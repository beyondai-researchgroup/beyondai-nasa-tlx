import { TlxScaleValues, TlxSession, Weightings } from '../services/tlx-state.service';
import { computeRawTLX, computeWeightedTLX, scaleValuesToRecord } from './scoring';

export interface ExportDurations {
  totalSec: number | null;
  scalesSec: number | null;
  comparisonsSec: number | null;
}

export function buildExportJson(
  session: TlxSession,
  scales: TlxScaleValues,
  weightings: Weightings | null,
  language: string = 'sr',
  durations: ExportDurations | null = null,
): object {
  const result: Record<string, unknown> = {
    meta: {
      sessionId: session.sessionId,
      participantId: session.participantId,
      timestamp: new Date().toISOString(),
      language,
      config: session.config,
      ...(durations ? { durations } : {}),
    },
    scales: scaleValuesToRecord(scales),
  };

  if (weightings) result['weightings'] = weightings;

  if (session.config.calculateScores) {
    const scores: Record<string, number> = { rawTLX: computeRawTLX(scales) };
    if (weightings && session.config.includeWeightings) {
      scores['weightedTLX'] = computeWeightedTLX(scales, weightings);
    }
    result['scores'] = scores;
  }

  return result;
}

export function downloadJson(data: object, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildFilename(session: TlxSession): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const sid = session.sessionId.replace(/\s+/g, '');
  return `TLX_${session.participantId}_${sid}_${date}.json`;
}
