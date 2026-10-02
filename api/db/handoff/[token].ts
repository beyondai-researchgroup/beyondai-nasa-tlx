import { getDb, isNonEmptyString, resolveTlxHandoff } from '../../_lib/db.js';
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
    const result = await resolveTlxHandoff(sql, token);
    if (result.status === 'not_found') { sendJson(res, 404, { error: 'NOT_FOUND' }); return; }
    if (result.status === 'expired') { sendJson(res, 410, { error: 'EXPIRED' }); return; }
    sendJson(res, 200, {
      participantId: result.participantId,
      dbSessionId: result.dbSessionId,
      lang: result.lang,
      config: result.config,
      codeReviewLinkToken: result.codeReviewLinkToken,
    });
  } catch (err) {
    console.error('[DB] handoff resolve error:', err);
    sendJson(res, 500, { error: 'SERVER_ERROR' });
  }
}
