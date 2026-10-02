import { getDb, validatePostSessionPayload } from '../_lib/db.js';
import { ApiRequest, ApiResponse, sendJson } from '../_lib/http.js';

// Post-session questionnaire (2026-10-01) — saved AFTER the TLX result, from the new
// /post-session page, before the study session is marked finished. One response per
// participant per session (re-submit overwrites, same idempotent-retry shape as
// api/db/result.ts). Mirrors server.ts's identical route for local dev.
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const validationError = validatePostSessionPayload(req.body);
  if (validationError) {
    sendJson(res, 400, { error: `Invalid payload: ${validationError}` });
    return;
  }

  try {
    const sql = getDb();
    const b = req.body as Record<string, unknown>;
    await sql`
      INSERT INTO "PostSessionResponse" ("ParticipantId", "SessionId", "Language", "Answers")
      VALUES (${b['participantId']}, ${b['sessionId']}, ${b['language']}, ${JSON.stringify(b['answers'])})
      ON CONFLICT ("ParticipantGuid", "SessionId") DO UPDATE SET
        "Language" = EXCLUDED."Language",
        "Answers" = EXCLUDED."Answers",
        "CompletedAt" = NOW()
    `;
    sendJson(res, 201, { ok: true });
  } catch (err) {
    console.error('[DB] save post-session response error:', err);
    sendJson(res, 500, { error: 'Database error' });
  }
}
