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
    const result = await getTlxConfigForParticipant(sql, participantId);
    if (result.status === 'not_found') {
      sendJson(res, 404, { error: 'Participant not found' });
      return;
    }
    if (result.status === 'ambiguous') {
      sendJson(res, 409, { error: 'AMBIGUOUS_PARTICIPANT_ID' });
      return;
    }
    sendJson(res, 200, result.config);
  } catch (err) {
    console.error('[DB] tlx-config error:', err);
    sendJson(res, 500, { error: 'Database error' });
  }
}
