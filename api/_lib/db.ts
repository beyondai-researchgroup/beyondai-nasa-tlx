import { neon } from '@neondatabase/serverless';
import { createLocalSql } from './local-db.js';

// Shared between server.ts (Express, used for local dev via `npm run serve:db`) and the
// standalone Vercel serverless functions under /api/db/*. Vercel's Angular framework preset
// prerenders every route (angular.json `ssr.prerender: true`) and, when it can, skips
// deploying a Node function entirely — which silently drops any custom Express routes
// defined inside server.ts's app(). Standalone /api/*.ts functions are Vercel's first-class,
// always-deployed convention, so the DB endpoints live here instead.
//
// Dual-mode (2026-09-08, extended platform-wide) — DB_MODE=local (.env.local,
// npm run serve:db:local, local dev only) swaps in a local Postgres client; see local-db.ts's
// header comment. npm run serve:db:neon (.env) / the deployed Vercel functions (DB_MODE never
// set there) always talk to the real Neon project unchanged.

let _sql: ReturnType<typeof neon> | null = null;

export function getDb() {
  if (!_sql) {
    if (process.env['DB_MODE'] === 'local') {
      const url = process.env['LOCAL_DATABASE_URL'];
      if (!url) throw new Error('LOCAL_DATABASE_URL environment variable is not set (DB_MODE=local)');
      _sql = createLocalSql(url) as unknown as ReturnType<typeof neon>;
      console.log('[db] developer mode: local Postgres');
    } else {
      const url = process.env['DATABASE_URL'];
      if (!url) throw new Error('DATABASE_URL environment variable is not set');
      _sql = neon(url);
    }
  }
  return _sql;
}

// 'Samostalna sesija' (Part D of the platform re-architecture, 2026-09-07) — the session label
// used for a standalone magic-link administration (a research not using code-review-ai's
// Intro/AI/Report flow at all — see resolveTlxLink below). One flat administration, unlike the
// counterbalanced 'Sesija 1'/'Sesija 2' pair the BeyondAI handoff produces.
// 'Hibridna sesija' (2026-10-02 fix) — BeyondAI's Hybrid mode (Sessions.Id 4, see
// src/app/utils/study.ts's DB_SESSION_TO_TLX) was missing here, so validateResultPayload 400'd
// every Hybrid TLX result.
export const SESSION_IDS = ['Uvodna sesija', 'Sesija 1', 'Sesija 2', 'Hibridna sesija', 'Samostalna sesija'];

export interface TlxConfig {
  calculateScores: boolean;
  includeWeightings: boolean;
  /** Per-app participant timer (2026-09-11), from Research.TimerNasaTlxEnabled/Minutes.
   *  timerMinutes is only meaningful when timerEnabled is true. */
  timerEnabled: boolean;
  timerMinutes: number | null;
  /** Participant.IsTestParticipant — only meaningful (and only ever checked) for the legacy raw
   *  participantId/sessionId `/start` shape; a magic-link/handoff-token resolution already proves
   *  authorization on its own, so this is always false there. */
  isTestParticipant: boolean;
}

export type TlxConfigResult =
  | { status: 'ok'; config: TlxConfig }
  | { status: 'not_found' }
  | { status: 'ambiguous' };

/**
 * Resolves a participant's research-level TLX structure config (BeyondAI Admin Dashboard's
 * "Study Configuration" page — TlxCalculateScores/TlxIncludeWeightings on the "Research"
 * table). Bare ParticipantId lookup (no ResearchId scoping available at this call site — see
 * AutoStartComponent) — 2026-09-09 fix: this used to `LIMIT 1` and silently return whichever
 * research's row came back first on a same-ParticipantId collision across researches (a real,
 * documented gap — resolveTlxLink below already joins via ParticipantGuid and doesn't have this
 * problem). Now detects 2+ rows and reports 'ambiguous' instead of guessing. Callers should fall
 * back to the full-procedure default ({calculateScores: true, includeWeightings: true}) for
 * BOTH 'not_found' and 'ambiguous' rather than blocking the flow — same "never block getting
 * into the test" principle this config already followed before this fix.
 */
export async function getTlxConfigForParticipant(
  sql: ReturnType<typeof neon>,
  participantId: string
): Promise<TlxConfigResult> {
  const rows = (await sql`
    SELECT r."TlxCalculateScores", r."TlxIncludeWeightings", r."TimerNasaTlxEnabled", r."TimerNasaTlxMinutes",
           p."IsTestParticipant"
    FROM "Participant" p
    JOIN "Research" r ON r."Id" = p."ResearchId"
    WHERE p."ParticipantId" = ${participantId}
  `) as {
    TlxCalculateScores: boolean; TlxIncludeWeightings: boolean; TimerNasaTlxEnabled: boolean;
    TimerNasaTlxMinutes: number | null; IsTestParticipant: boolean;
  }[];

  if (rows.length > 1) return { status: 'ambiguous' };
  if (!rows.length) return { status: 'not_found' };
  const row = rows[0];
  return {
    status: 'ok',
    config: {
      calculateScores: row.TlxCalculateScores,
      includeWeightings: row.TlxIncludeWeightings,
      timerEnabled: row.TimerNasaTlxEnabled === true,
      timerMinutes: row.TimerNasaTlxEnabled ? row.TimerNasaTlxMinutes : null,
      isTestParticipant: row.IsTestParticipant === true,
    },
  };
}

export type TlxHandoffResolveResult =
  | { status: 'ok'; participantId: string; dbSessionId: number; lang: 'sr' | 'en'; config: TlxConfig; codeReviewLinkToken: string | null }
  | { status: 'not_found' }
  | { status: 'expired' };

/**
 * Resolves a BeyondAI → NASA-TLX handoff token (`SurveyAccessToken.SurveyType = 'TLX_HANDOFF'`,
 * minted by code-review-ai on decision submit) — the only way a real (non-test) participant
 * reaches this app's `/start` route now; the legacy raw `participantId`/`sessionId` query-param
 * shape is test-participants-only (see AutoStartComponent). Also resolves the participant's
 * existing, longer-lived `CODE_REVIEW` personal-link token (if any, not expired) so the "session
 * finished" screen can send them back to the exact same link rather than a dead end — the handoff
 * token itself is single-purpose/short-lived (2h) and isn't meant to double as their permanent link.
 */
export async function resolveTlxHandoff(sql: ReturnType<typeof neon>, token: string): Promise<TlxHandoffResolveResult> {
  const rows = (await sql`
    SELECT p."ParticipantId", p."Language", sat."StudySessionId", sat."ExpiresAt",
           r."TlxCalculateScores", r."TlxIncludeWeightings", r."TimerNasaTlxEnabled", r."TimerNasaTlxMinutes",
           crt."Token" AS "CodeReviewToken", crt."ExpiresAt" AS "CodeReviewExpiresAt"
    FROM "SurveyAccessToken" sat
    JOIN "Participant" p ON p."Guid" = sat."ParticipantGuid"
    JOIN "Research" r ON r."Id" = p."ResearchId"
    LEFT JOIN "SurveyAccessToken" crt ON crt."ParticipantGuid" = sat."ParticipantGuid" AND crt."SurveyType" = 'CODE_REVIEW'
    WHERE sat."Token" = ${token} AND sat."SurveyType" = 'TLX_HANDOFF'
    LIMIT 1
  `) as {
    ParticipantId: string; Language: string | null; StudySessionId: number | null; ExpiresAt: string;
    TlxCalculateScores: boolean; TlxIncludeWeightings: boolean; TimerNasaTlxEnabled: boolean; TimerNasaTlxMinutes: number | null;
    CodeReviewToken: string | null; CodeReviewExpiresAt: string | null;
  }[];

  if (!rows.length || rows[0].StudySessionId == null) return { status: 'not_found' };
  const row = rows[0];
  const dbSessionId = row.StudySessionId!;
  if (new Date(row.ExpiresAt) < new Date()) return { status: 'expired' };

  const codeReviewLinkToken =
    row.CodeReviewToken && row.CodeReviewExpiresAt && new Date(row.CodeReviewExpiresAt) > new Date()
      ? row.CodeReviewToken
      : null;

  return {
    status: 'ok',
    participantId: row.ParticipantId,
    dbSessionId,
    lang: row.Language === 'en' ? 'en' : 'sr',
    config: {
      calculateScores: row.TlxCalculateScores,
      includeWeightings: row.TlxIncludeWeightings,
      timerEnabled: row.TimerNasaTlxEnabled === true,
      timerMinutes: row.TimerNasaTlxEnabled ? row.TimerNasaTlxMinutes : null,
      isTestParticipant: false,
    },
    codeReviewLinkToken,
  };
}

export type TlxLinkResolveResult =
  | { status: 'ok'; participantId: string; lang: 'sr' | 'en'; config: TlxConfig }
  | { status: 'not_found' }
  | { status: 'expired' }
  | { status: 'not_active' }
  | { status: 'already_completed' };

/**
 * Magic-link resolution (Part D of the platform re-architecture, 2026-09-07) — mirrors
 * rei40-andrejkatin/bigfive-andrejkatin's own `/api/link/:token` handlers exactly, including the
 * ParticipantGuid-based join (never the bare ParticipantId, which is scoped per research now and
 * can collide across researches — the Token itself already uniquely resolves the participant, so
 * the JOIN should follow that resolution). NASA-TLX's own TlxResult existence (for this
 * participant, any SessionId) is the completion signal, same "no separate consumed flag on the
 * token row" design used throughout this platform.
 */
export async function resolveTlxLink(sql: ReturnType<typeof neon>, token: string): Promise<TlxLinkResolveResult> {
  const rows = (await sql`
    SELECT sat."ParticipantGuid", sat."ExpiresAt", p."Language", r."TlxCalculateScores", r."TlxIncludeWeightings",
           r."ConsentPortalActive", r."TimerNasaTlxEnabled", r."TimerNasaTlxMinutes"
    FROM "SurveyAccessToken" sat
    JOIN "Participant" p ON p."Guid" = sat."ParticipantGuid"
    JOIN "Research" r ON r."Id" = p."ResearchId"
    WHERE sat."Token" = ${token} AND sat."SurveyType" = 'NASA_TLX'
    LIMIT 1
  `) as {
    ParticipantGuid: string; ExpiresAt: string; Language: string | null; TlxCalculateScores: boolean;
    TlxIncludeWeightings: boolean; ConsentPortalActive: boolean; TimerNasaTlxEnabled: boolean; TimerNasaTlxMinutes: number | null;
  }[];

  if (!rows.length) return { status: 'not_found' };
  const row = rows[0];
  if (new Date(row.ExpiresAt) < new Date()) return { status: 'expired' };
  // 2026-09-09 master pause switch — same Research.ConsentPortalActive column the Consent app's
  // slug-link Activate/Deactivate toggle writes; a researcher pausing a research now also closes
  // already-issued standalone NASA-TLX links, not just new Consent-app visits.
  if (!row.ConsentPortalActive) return { status: 'not_active' };

  const existing = (await sql`
    SELECT 1 FROM "TlxResult" WHERE "ParticipantGuid" = ${row.ParticipantGuid} LIMIT 1
  `) as unknown[];
  if (existing.length) return { status: 'already_completed' };

  const participantRows = (await sql`
    SELECT "ParticipantId" FROM "Participant" WHERE "Guid" = ${row.ParticipantGuid} LIMIT 1
  `) as { ParticipantId: string }[];

  return {
    status: 'ok',
    participantId: participantRows[0].ParticipantId,
    lang: row.Language === 'en' ? 'en' : 'sr',
    config: {
      calculateScores: row.TlxCalculateScores,
      includeWeightings: row.TlxIncludeWeightings,
      timerEnabled: row.TimerNasaTlxEnabled === true,
      timerMinutes: row.TimerNasaTlxEnabled ? row.TimerNasaTlxMinutes : null,
      isTestParticipant: false,
    },
  };
}

export function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}
export function isScaleValue(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100;
}
export function isNullableScaleValue(v: unknown): boolean {
  return v === null || isScaleValue(v);
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

  // Timer auto-submit (2026-09-11) — a timed-out submission may legitimately have unset scale
  // sliders (the participant ran out of time before touching every dimension); each one present
  // still has to be a valid 0-100 integer.
  const isTimedOut = p['isTimedOut'] === true;
  const scaleFields = ['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration'];
  for (const f of scaleFields) {
    if (isTimedOut ? !isNullableScaleValue(p[f]) : !isScaleValue(p[f])) return `${f} must be an integer 0-100`;
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

function isLikertValue(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * Post-session questionnaire (2026-10-01) — a short, fixed (not admin-configurable) 5-question
 * form shown right after the TLX scale, before the session is actually marked finished. "answers"
 * is {q1..q4: 1-5 Likert, q5: free text or null (optional)} — see PostSessionResponse.Answers.
 */
export function validatePostSessionPayload(b: unknown): string | null {
  if (typeof b !== 'object' || b === null) return 'body must be an object';
  const p = b as Record<string, unknown>;

  if (!isNonEmptyString(p['participantId'], 50)) return 'participantId invalid';
  if (typeof p['sessionId'] !== 'number' || !Number.isInteger(p['sessionId']) || (p['sessionId'] as number) < 1 || (p['sessionId'] as number) > 4) {
    return 'sessionId invalid';
  }
  if (!isNonEmptyString(p['language'], 5)) return 'language invalid';

  const answers = p['answers'];
  if (typeof answers !== 'object' || answers === null) return 'answers must be an object';
  const a = answers as Record<string, unknown>;

  for (const f of ['q1', 'q2', 'q3', 'q4']) {
    if (!isLikertValue(a[f])) return `answers.${f} must be an integer 1-5`;
  }
  if (a['q5'] !== null && a['q5'] !== undefined) {
    if (typeof a['q5'] !== 'string' || a['q5'].length > 2000) return 'answers.q5 must be null or a string up to 2000 chars';
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
