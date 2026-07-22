import { ScaleName, TlxScaleValues, Weightings } from '../services/tlx-state.service';

export const SCALE_NAMES: ScaleName[] = [
  'Mentalni zahtev',
  'Fizički zahtev',
  'Vremenski pritisak',
  'Performansa',
  'Napor',
  'Frustracija',
];

export function scaleValuesToRecord(s: TlxScaleValues): Record<ScaleName, number> {
  return {
    'Mentalni zahtev': s.mentalDemand,
    'Fizički zahtev': s.physicalDemand,
    'Vremenski pritisak': s.temporalDemand,
    'Performansa': s.performance,
    'Napor': s.effort,
    'Frustracija': s.frustration,
  };
}

export function computeRawTLX(s: TlxScaleValues): number {
  const vals = Object.values(scaleValuesToRecord(s));
  return round1(vals.reduce((a, b) => a + b, 0) / 6);
}

export function computeWeightedTLX(s: TlxScaleValues, w: Weightings): number {
  const rec = scaleValuesToRecord(s);
  const total = SCALE_NAMES.reduce((sum, name) => sum + (rec[name] * w[name]) / 15, 0);
  return round1(total);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
