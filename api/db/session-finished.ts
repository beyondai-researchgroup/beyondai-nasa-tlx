import { getDb, isNonEmptyString } from '../_lib/db.js';
import { notifyEegMarker, notifyEegStop } from '../_lib/eeg.js';
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
      typeof sessionId !== 'number' || !Number.isInteger(sessionId) || sessionId < 1 || sessionId > 4) {
    sendJson(res, 400, { error: 'Invalid payload: participantId and sessionId (1-4) are required' });
    return;
  }

  try {
    const sql = getDb();

    const participantRows = (await sql`
      SELECT "IsTestParticipant" FROM "Participant" WHERE "ParticipantId" = ${participantId} LIMIT 1
    `) as { IsTestParticipant: boolean }[];
    if (!participantRows.length) {
      sendJson(res, 404, { error: 'Participant not found' });
      return;
    }

    // A fixed test participant's IsFinished flag never changes — they keep re-running the same
    // session indefinitely for other researchers to test against (see Participant.IsTestParticipant).
    if (!participantRows[0].IsTestParticipant) {
      const rows = (await sql`
        UPDATE "ParticipantSession"
        SET "IsFinished" = TRUE, "FinishedAt" = NOW()
        WHERE "ParticipantId" = ${participantId} AND "SessionId" = ${sessionId}
        RETURNING "Id"
      `) as unknown[];
      if (rows.length === 0) {
        sendJson(res, 404, { error: 'Participant session not found' });
        return;
      }
    }
    await notifyEegMarker('TLX_DONE');
    if (sessionId === 3 || sessionId === 4) {
      // Report (3) is the last of the normal 3-session flow; Hybrid (4, experimental — participant
      // "004" only) is that participant's sole, terminal session — both should stop recording.
      await notifyEegStop();
    }
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('[DB] session-finished error:', err);
    sendJson(res, 500, { error: 'Database error' });
  }
}
