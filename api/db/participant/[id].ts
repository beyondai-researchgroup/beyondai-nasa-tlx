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
      LIMIT 1
    `) as unknown[];
    sendJson(res, 200, { exists: rows.length > 0 });
  } catch (err) {
    console.error('[DB] participant check error:', err);
    sendJson(res, 500, { error: 'Database error' });
  }
}
