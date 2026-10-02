import { getDb, isNonEmptyString, resolveTlxLink } from '../../_lib/db.js';
import { ApiRequest, ApiResponse, sendJson } from '../../_lib/http.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const t = req.query['token'];
  const token = Array.isArray(t) ? t[0] : t;

  if (!isNonEmptyString(token, 64)) {
    sendJson(res, 400, { error: 'Invalid token' });
    return;
  }

  try {
    const sql = getDb();
    const result = await resolveTlxLink(sql, token);
    if (result.status === 'not_found') { sendJson(res, 404, { error: 'NOT_FOUND' }); return; }
    if (result.status === 'expired') { sendJson(res, 410, { error: 'EXPIRED' }); return; }
    if (result.status === 'not_active') { sendJson(res, 403, { error: 'NOT_ACTIVE' }); return; }
    if (result.status === 'already_completed') { sendJson(res, 409, { error: 'ALREADY_COMPLETED' }); return; }
    sendJson(res, 200, { participantId: result.participantId, lang: result.lang, config: result.config });
  } catch (err) {
    console.error('[DB] link resolve error:', err);
    sendJson(res, 500, { error: 'SERVER_ERROR' });
  }
}
