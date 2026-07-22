import { neon } from '@neondatabase/serverless';

// Shared between server.ts (Express, used for local dev via `npm run serve:db`) and the
// standalone Vercel serverless functions under /api/db/*. Vercel's Angular framework preset
// prerenders every route (angular.json `ssr.prerender: true`) and, when it can, skips
// deploying a Node function entirely — which silently drops any custom Express routes
// defined inside server.ts's app(). Standalone /api/*.ts functions are Vercel's first-class,
// always-deployed convention, so the DB endpoints live here instead.

let _sql: ReturnType<typeof neon> | null = null;

export function getDb() {
  if (!_sql) {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = neon(url);
  }
  return _sql;
}

export const SESSION_IDS = ['Uvodna sesija', 'Sesija 1', 'Sesija 2'];

export function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}
export function isScaleValue(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100;
}
export function isWeight(v: unknown): boolean {
  return v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5);
}
export function isScore(v: unknown): boolean {
  return v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100);
}
export function isDuration(v: unknown): boolean {
  return v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 999999);
}

export function validateResultPayload(b: unknown): string | null {
  if (typeof b !== 'object' || b === null) return 'body must be an object';
  const p = b as Record<string, unknown>;

  if (!isNonEmptyString(p['participantId'], 50)) return 'participantId invalid';
  if (!isNonEmptyString(p['sessionId'], 50) || !SESSION_IDS.includes(p['sessionId'] as string)) {
    return 'sessionId invalid';
  }
  if (!isNonEmptyString(p['language'], 5)) return 'language invalid';

  const scaleFields = ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration'];
  for (const f of scaleFields) {
    if (!isScaleValue(p[f])) return `${f} must be an integer 0-100`;
  }

  const weightFields = ['weightMental', 'weightPhysical', 'weightTemporal', 'weightPerf', 'weightEffort', 'weightFrust'];
  for (const f of weightFields) {
    if (!isWeight(p[f])) return `${f} must be null or an integer 0-5`;
  }
  const weights = weightFields.map(f => p[f]);
  if (weights.every(w => w !== null)) {
    const sum = (weights as number[]).reduce((a, b) => a + b, 0);
    if (sum !== 15) return 'weights must sum to 15';
  } else if (weights.some(w => w !== null)) {
    return 'weights must be all set or all null';
  }

  if (!isScore(p['rawTLX'])) return 'rawTLX must be null or a number 0-100';
  if (!isScore(p['weightedTLX'])) return 'weightedTLX must be null or a number 0-100';
  if (typeof p['configScores'] !== 'boolean') return 'configScores must be boolean';
  if (typeof p['configWeightings'] !== 'boolean') return 'configWeightings must be boolean';

  for (const f of ['durationTotalSec', 'durationScalesSec', 'durationComparisonsSec']) {
    if (!isDuration(p[f])) return `${f} must be null or a non-negative integer`;
  }

  return null;
}

const CSV_COLUMNS = [
  'Id', 'ParticipantId', 'SessionId', 'CompletedAt', 'Language',
  'MentalDemand', 'PhysicalDemand', 'TemporalDemand', 'Performance', 'Effort', 'Frustration',
  'WeightMental', 'WeightPhysical', 'WeightTemporal', 'WeightPerf', 'WeightEffort', 'WeightFrust',
  'RawTLX', 'WeightedTLX', 'ConfigScores', 'ConfigWeightings',
  'DurationTotalSec', 'DurationScalesSec', 'DurationComparisonsSec',
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map(c => csvCell(row[c])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
