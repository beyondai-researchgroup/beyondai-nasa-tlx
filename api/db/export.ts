import { getDb, toCsv } from '../_lib/db.js';
import { ApiRequest, ApiResponse, sendJson } from '../_lib/http.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const token = process.env['EXPORT_TOKEN'];
  if (!token) {
    sendJson(res, 503, { error: 'Export disabled: EXPORT_TOKEN is not configured' });
    return;
  }
  const provided = req.query['token'];
  if ((Array.isArray(provided) ? provided[0] : provided) !== token) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const sql = getDb();
    const rows = (await sql`SELECT * FROM "TlxResult" ORDER BY "CompletedAt"`) as Record<string, unknown>[];
    const date = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tlx-results-${date}.csv"`,
    });
    res.end(toCsv(rows));
  } catch (err) {
    console.error('[DB] export error:', err);
    sendJson(res, 500, { error: 'Database error' });
  }
}
