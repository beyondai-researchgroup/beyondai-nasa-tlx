import { getDb, isNonEmptyString } from '../../_lib/db.js';
import { ApiRequest, ApiResponse, sendJson } from '../../_lib/http.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const id = req.query['id'];
  const participantId = Array.isArray(id) ? id[0] : id;

  if (!isNonEmptyString(participantId, 50)) {
    sendJson(res, 400, { error: 'Invalid participant id' });
    return;
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT "ParticipantId" FROM "Participant"
      WHERE "ParticipantId" = ${participantId}
    `) as unknown[];
    // 2026-09-09 fix — ParticipantId is scoped per research now, not globally unique; a same-id
    // collision across two researches used to silently report exists:true off whichever row
    // LIMIT 1 happened to return. This is a dev/manual-login-only check (the real entry point is
    // /start or /link/:token, both of which resolve unambiguously), so failing loud here just
    // tells the person testing to use one of those instead of a bare id.
    if (rows.length > 1) {
      sendJson(res, 409, { error: 'AMBIGUOUS_PARTICIPANT_ID' });
      return;
    }
    sendJson(res, 200, { exists: rows.length > 0 });
  } catch (err) {
    console.error('[DB] participant check error:', err);
    sendJson(res, 500, { error: 'Database error' });
  }
}
