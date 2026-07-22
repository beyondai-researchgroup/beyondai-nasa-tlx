import { getDb, isNonEmptyString } from '../_lib/db.js';
import { ApiRequest, ApiResponse, sendJson } from '../_lib/http.js';

// Marks a study session (BeyondAI → NASA TLX flow) as finished for a participant.
// Called by the results page right after the TLX result is saved successfully.
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const b = req.body as Record<string, unknown> | null;
  const participantId = b?.['participantId'];
  const sessionId = b?.['sessionId'];
  if (!isNonEmptyString(participantId, 50) ||
      typeof sessionId !== 'number' || !Number.isInteger(sessionId) || sessionId < 1 || sessionId > 3) {
    sendJson(res, 400, { error: 'Invalid payload: participantId and sessionId (1-3) are required' });
    return;
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      UPDATE "ParticipantSession"
      SET "IsFinished" = TRUE
      WHERE "ParticipantId" = ${participantId} AND "SessionId" = ${sessionId}
      RETURNING "Id"
    `) as unknown[];
    if (rows.length === 0) {
      sendJson(res, 404, { error: 'Participant session not found' });
      return;
    }
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('[DB] session-finished error:', err);
    sendJson(res, 500, { error: 'Database error' });
  }
}
