import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type SessionId = 'Uvodna sesija' | 'Sesija 1' | 'Sesija 2';

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
