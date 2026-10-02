import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

// 'Samostalna sesija' (Part D of the platform re-architecture, 2026-09-07) — the standalone
// magic-link entry point's session label (see LinkAccessComponent), for a research that doesn't
// use code-review-ai's Intro/AI/Report flow at all.
export type SessionId = 'Uvodna sesija' | 'Sesija 1' | 'Sesija 2' | 'Hibridna sesija' | 'Samostalna sesija';

export type ScaleName =
  | 'Mentalni zahtev'
  | 'Fizički zahtev'
  | 'Vremenski pritisak'
  | 'Performansa'
  | 'Napor'
  | 'Frustracija';

export interface TlxConfig {
  calculateScores: boolean;
  includeWeightings: boolean;
  /** Per-app participant timer (2026-09-11) — timerMinutes only meaningful when timerEnabled. */
  timerEnabled: boolean;
  timerMinutes: number | null;
  isTestParticipant: boolean;
}

export interface TlxSession {
  sessionId: SessionId;
  participantId: string;
  config: TlxConfig;
  /**
   * Study-flow session id (1=Intro, 2=AI, 3=Report) from the shared "ParticipantSession"
   * table, set only when the session was started via the BeyondAI handoff (/start route).
   * When present, the results page marks that row finished after saving the TLX result.
   */
  dbSessionId?: number;
  /**
   * The real (non-test) participant's own personal Code Review link token, resolved alongside
   * the handoff token — used to send them back to that exact link on "session finished" instead
   * of a bare BeyondAI URL they could no longer use (the bare-id login is test-participants-only
   * now). Null for a test participant, or if no valid link token could be resolved.
   */
  codeReviewLinkToken?: string | null;
}

export interface TlxScaleValues {
  mentalDemand: number;
  physicalDemand: number;
  temporalDemand: number;
  performance: number;
  effort: number;
  frustration: number;
}

export type Weightings = Record<ScaleName, number>;

interface PersistedState {
  session: TlxSession | null;
  instructionsViewed: boolean;
  scales: TlxScaleValues | null;
  weightings: Weightings | null;
  resultSaved: boolean;
  startedAt: number | null;
  scalesCompletedAt: number | null;
  comparisonsCompletedAt: number | null;
  scalesTouched: string[];
  tourShownPages: string[];
}

const STORAGE_KEY = 'tlx-state';

@Injectable({ providedIn: 'root' })
export class TlxStateService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private _session = signal<TlxSession | null>(null);
  private _instructionsViewed = signal(false);
  private _scales = signal<TlxScaleValues | null>(null);
  private _weightings = signal<Weightings | null>(null);
  private _resultSaved = signal(false);
  private _startedAt = signal<number | null>(null);
  private _scalesCompletedAt = signal<number | null>(null);
  private _comparisonsCompletedAt = signal<number | null>(null);
  private _scalesTouched = signal<string[]>([]);
  private _tourShownPages = signal<Set<string>>(new Set());

  readonly session = this._session.asReadonly();
  readonly instructionsViewed = this._instructionsViewed.asReadonly();
  readonly scales = this._scales.asReadonly();
  readonly weightings = this._weightings.asReadonly();
  readonly resultSaved = this._resultSaved.asReadonly();
  readonly startedAt = this._startedAt.asReadonly();
  readonly scalesCompletedAt = this._scalesCompletedAt.asReadonly();
  readonly comparisonsCompletedAt = this._comparisonsCompletedAt.asReadonly();
  readonly scalesTouched = this._scalesTouched.asReadonly();
  readonly tourShownPages = this._tourShownPages.asReadonly();

  // Per-app participant timer (2026-09-11) — the timer itself lives in AppComponent (mounted for
  // the whole session, unlike a single-page test flow), but the currently-active page (scales,
  // typically) may be holding in-progress values that haven't been pushed into this shared state
  // yet (see ScalesComponent's own persistCurrentValues, only called on submit/goBack — not on
  // every slider drag, for performance). Whichever page is mounted registers a "flush" callback
  // here so the global expiry handler can ask it to commit its live progress before building the
  // timed-out save payload. At most one page is ever mounted at a time in this app's routing, so
  // a single slot is enough — no stack needed.
  private flushCallback: (() => void) | null = null;

  registerFlush(fn: () => void): void {
    this.flushCallback = fn;
  }

  unregisterFlush(fn: () => void): void {
    if (this.flushCallback === fn) this.flushCallback = null;
  }

  /** Best-effort — calls whatever page is currently registered, if any, so its live progress
   *  lands in this shared state before a timed-out save reads it. */
  flushCurrentPage(): void {
    this.flushCallback?.();
  }

  constructor() {
    this.restore();
  }

  setSession(s: TlxSession): void {
    this._session.set(s);
    this._startedAt.set(Date.now());
    this.persist();
  }
  markInstructionsViewed(): void { this._instructionsViewed.set(true); this.persist(); }
  setScales(s: TlxScaleValues): void { this._scales.set(s); this.persist(); }
  setWeightings(w: Weightings): void { this._weightings.set(w); this.persist(); }
  markResultSaved(): void { this._resultSaved.set(true); this.persist(); }
  markScalesCompleted(): void { this._scalesCompletedAt.set(Date.now()); this.persist(); }
  markComparisonsCompleted(): void { this._comparisonsCompletedAt.set(Date.now()); this.persist(); }
  setScalesTouched(keys: string[]): void { this._scalesTouched.set(keys); this.persist(); }

  /** Whether the per-page guided tour has already run for this page during the current session. */
  isTourShown(page: string): boolean { return this._tourShownPages().has(page); }

  /** Marks a page's guided tour as shown so it won't auto-start again on revisits. */
  markTourShown(page: string): void {
    if (this._tourShownPages().has(page)) return;
    const next = new Set(this._tourShownPages());
    next.add(page);
    this._tourShownPages.set(next);
    this.persist();
  }

  reset(): void {
    this._session.set(null);
    this._instructionsViewed.set(false);
    this._scales.set(null);
    this._weightings.set(null);
    this._resultSaved.set(false);
    this._startedAt.set(null);
    this._scalesCompletedAt.set(null);
    this._comparisonsCompletedAt.set(null);
    this._scalesTouched.set([]);
    this._tourShownPages.set(new Set());
    if (this.isBrowser) {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    }
  }

  private persist(): void {
    if (!this.isBrowser) return;
    const snapshot: PersistedState = {
      session: this._session(),
      instructionsViewed: this._instructionsViewed(),
      scales: this._scales(),
      weightings: this._weightings(),
      resultSaved: this._resultSaved(),
      startedAt: this._startedAt(),
      scalesCompletedAt: this._scalesCompletedAt(),
      comparisonsCompletedAt: this._comparisonsCompletedAt(),
      scalesTouched: this._scalesTouched(),
      tourShownPages: [...this._tourShownPages()],
    };
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* storage unavailable */ }
  }

  private restore(): void {
    if (!this.isBrowser) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(STORAGE_KEY); } catch { return; }
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as PersistedState;
      if (!s.session?.participantId) return;
      this._session.set(s.session);
      this._instructionsViewed.set(!!s.instructionsViewed);
      this._scales.set(s.scales ?? null);
      this._weightings.set(s.weightings ?? null);
      this._resultSaved.set(!!s.resultSaved);
      this._startedAt.set(s.startedAt ?? null);
      this._scalesCompletedAt.set(s.scalesCompletedAt ?? null);
      this._comparisonsCompletedAt.set(s.comparisonsCompletedAt ?? null);
      this._scalesTouched.set(Array.isArray(s.scalesTouched) ? s.scalesTouched : []);
      this._tourShownPages.set(new Set(Array.isArray(s.tourShownPages) ? s.tourShownPages : []));
    } catch {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }
}
