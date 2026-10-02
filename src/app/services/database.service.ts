import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';

const REQUEST_TIMEOUT_MS = 10_000;

export interface TlxResultDto {
  participantId: string;
  sessionId: string;
  language: string;
  // number | null (not just number) since a timed-out submission may leave a scale untouched —
  // see AppComponent.onTimerExpired.
  mentalDemand: number | null;
  physicalDemand: number | null;
  temporalDemand: number | null;
  performance: number | null;
  effort: number | null;
  frustration: number | null;
  weightMental: number | null;
  weightPhysical: number | null;
  weightTemporal: number | null;
  weightPerf: number | null;
  weightEffort: number | null;
  weightFrust: number | null;
  rawTLX: number | null;
  weightedTLX: number | null;
  configScores: boolean;
  configWeightings: boolean;
  durationTotalSec: number | null;
  durationScalesSec: number | null;
  durationComparisonsSec: number | null;
  /** True when this submission was auto-sent because the per-research timer (Research.
   *  TimerNasaTlxEnabled/Minutes) expired, not because the participant clicked Submit themselves. */
  isTimedOut?: boolean;
}

/** Per-app participant timer (2026-09-11) — timerMinutes only meaningful when timerEnabled is
 *  true. Threaded alongside the existing calculateScores/includeWeightings structure config. */
export interface TlxConfigDto {
  calculateScores: boolean;
  includeWeightings: boolean;
  timerEnabled: boolean;
  timerMinutes: number | null;
  /** Participant.IsTestParticipant — defaults to false both when the participant genuinely isn't
   *  one AND on any fetch failure (fail-closed), since AutoStartComponent's legacy raw-param
   *  `/start` shape uses this field as its one authorization check. */
  isTestParticipant: boolean;
}

/** Post-session questionnaire (2026-10-01) — submitted right after the TLX result, before the
 *  study session is marked finished. See ResultsComponent/PostSessionComponent. */
export interface PostSessionResponseDto {
  participantId: string;
  sessionId: number;
  language: string;
  answers: {
    q1: number;
    q2: number;
    q3: number;
    q4: number;
    q5: string | null;
  };
}

export type HandoffResolveResult =
  | { status: 'ok'; participantId: string; dbSessionId: number; lang: 'sr' | 'en'; config: TlxConfigDto; codeReviewLinkToken: string | null }
  | { status: 'not_found' | 'expired' | 'error' };

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private http = inject(HttpClient);

  async checkParticipantExists(participantId: string): Promise<boolean> {
    const res = await firstValueFrom(
      this.http
        .get<{ exists: boolean }>(`/api/db/participant/${encodeURIComponent(participantId)}`)
        .pipe(timeout(REQUEST_TIMEOUT_MS))
    );
    if (typeof res?.exists !== 'boolean') {
      throw new Error('Unexpected participant check response');
    }
    return res.exists;
  }

  async saveTlxResult(dto: TlxResultDto): Promise<void> {
    await firstValueFrom(
      this.http.post<void>('/api/db/result', dto).pipe(timeout(REQUEST_TIMEOUT_MS))
    );
  }

  /** Post-session questionnaire (2026-10-01) — see PostSessionResponseDto. */
  async savePostSessionResponse(dto: PostSessionResponseDto): Promise<void> {
    await firstValueFrom(
      this.http.post<void>('/api/db/post-session-response', dto).pipe(timeout(REQUEST_TIMEOUT_MS))
    );
  }

  /** Marks the study-flow session (ParticipantSession row) as finished. */
  async markSessionFinished(participantId: string, sessionId: number): Promise<void> {
    await firstValueFrom(
      this.http
        .post<void>('/api/db/session-finished', { participantId, sessionId })
        .pipe(timeout(REQUEST_TIMEOUT_MS))
    );
  }

  /**
   * Fetches the participant's research-level TLX structure config (set on the BeyondAI Admin
   * Dashboard's Study Configuration page). Callers fall back to the full-procedure default on
   * any failure — this must never block getting into the test.
   */
  async getTlxConfig(participantId: string): Promise<TlxConfigDto> {
    try {
      const res = await firstValueFrom(
        this.http
          .get<Partial<TlxConfigDto>>(`/api/db/tlx-config/${encodeURIComponent(participantId)}`)
          .pipe(timeout(REQUEST_TIMEOUT_MS))
      );
      return {
        calculateScores: res.calculateScores ?? true,
        includeWeightings: res.includeWeightings ?? true,
        timerEnabled: res.timerEnabled === true,
        timerMinutes: res.timerMinutes ?? null,
        isTestParticipant: res.isTestParticipant === true,
      };
    } catch {
      // Never blocks getting into the test — same "never block" principle that already governed
      // calculateScores/includeWeightings here; a fetch hiccup simply means no timer either.
      // isTestParticipant deliberately still defaults to false (fail-closed) here — see its own
      // doc comment on TlxConfigDto.
      return { calculateScores: true, includeWeightings: true, timerEnabled: false, timerMinutes: null, isTestParticipant: false };
    }
  }

  /**
   * Resolves a BeyondAI handoff token — the entry point for every real (non-test) participant's
   * `/start`. Unlike {@link getTlxConfig}, this deliberately does NOT swallow errors into a
   * default — an invalid/expired/unreachable token must block entry, not silently let someone in.
   */
  async resolveHandoff(token: string): Promise<HandoffResolveResult> {
    try {
      const res = await firstValueFrom(
        this.http
          .get<{ participantId: string; dbSessionId: number; lang: 'sr' | 'en'; config: TlxConfigDto; codeReviewLinkToken: string | null }>(
            `/api/db/handoff/${encodeURIComponent(token)}`
          )
          .pipe(timeout(REQUEST_TIMEOUT_MS))
      );
      return { status: 'ok', ...res };
    } catch (err: any) {
      const status = err?.status;
      if (status === 404) return { status: 'not_found' };
      if (status === 410) return { status: 'expired' };
      return { status: 'error' };
    }
  }

  /** Magic-link resolution (Part D of the platform re-architecture) — mirrors REI-40/Big Five's
   *  own resolveLink shape. */
  async resolveLink(token: string): Promise<LinkResolveResult> {
    try {
      const res = await firstValueFrom(
        this.http
          .get<{ participantId: string; lang: 'sr' | 'en'; config: Partial<TlxConfigDto> }>(
            `/api/db/link/${encodeURIComponent(token)}`
          )
          .pipe(timeout(REQUEST_TIMEOUT_MS))
      );
      return {
        ok: true,
        participantId: res.participantId,
        lang: res.lang,
        config: {
          calculateScores: res.config.calculateScores ?? true,
          includeWeightings: res.config.includeWeightings ?? true,
          timerEnabled: res.config.timerEnabled === true,
          timerMinutes: res.config.timerMinutes ?? null,
          isTestParticipant: false,
        },
      };
    } catch (err: any) {
      const code = err?.error?.error;
      if (code === 'NOT_FOUND' || code === 'EXPIRED' || code === 'ALREADY_COMPLETED' || code === 'NOT_ACTIVE') {
        return { ok: false, error: code };
      }
      return { ok: false, error: 'SERVER_ERROR' };
    }
  }
}

export type LinkResolveResult =
  | { ok: true; participantId: string; lang: 'sr' | 'en'; config: TlxConfigDto }
  | { ok: false; error: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_COMPLETED' | 'NOT_ACTIVE' | 'SERVER_ERROR' };
