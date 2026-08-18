import { getDb, isNonEmptyString, getTlxConfigForParticipant } from '../../_lib/db.js';
import { ApiRequest, ApiResponse, sendJson } from '../../_lib/http.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const raw = req.query['participantId'];
  const participantId = Array.isArray(raw) ? raw[0] : raw;

  if (!isNonEmptyString(participantId, 50)) {
    sendJson(res, 400, { error: 'Invalid participant id' });
    return;
  }

  try {
    const sql = getDb();
    const config = await getTlxConfigForParticipant(sql, participantId);
    if (!config) {
      sendJson(res, 404, { error: 'Participant not found' });
      return;
    }
    sendJson(res, 200, config);
  } catch (err) {
    console.error('[DB] tlx-config error:', err);
    sendJson(res, 500, { error: 'Database error' });
  }
}
