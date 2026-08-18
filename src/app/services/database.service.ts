import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';

const REQUEST_TIMEOUT_MS = 10_000;

export interface TlxResultDto {
  participantId: string;
  sessionId: string;
  language: string;
  mentalDemand: number;
  physicalDemand: number;
  temporalDemand: number;
  performance: number;
  effort: number;
  frustration: number;
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
}

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
  async getTlxConfig(participantId: string): Promise<{ calculateScores: boolean; includeWeightings: boolean }> {
    try {
      return await firstValueFrom(
        this.http
          .get<{ calculateScores: boolean; includeWeightings: boolean }>(
            `/api/db/tlx-config/${encodeURIComponent(participantId)}`
          )
          .pipe(timeout(REQUEST_TIMEOUT_MS))
      );
    } catch {
      return { calculateScores: true, includeWeightings: true };
    }
  }
}
