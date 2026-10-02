import { getDb, validateResultPayload } from '../_lib/db.js';
import { ApiRequest, ApiResponse, sendJson } from '../_lib/http.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const validationError = validateResultPayload(req.body);
  if (validationError) {
    sendJson(res, 400, { error: `Invalid payload: ${validationError}` });
    return;
  }

  try {
    const sql = getDb();
    const b = req.body as Record<string, unknown>;
    // One result per participant per session: re-submitting overwrites the
    // previous row instead of inserting a duplicate.
    await sql`
      INSERT INTO "TlxResult" (
        "ParticipantId", "SessionId", "Language",
        "MentalDemand", "PhysicalDemand", "TemporalDemand",
        "Performance", "Effort", "Frustration",
        "WeightMental", "WeightPhysical", "WeightTemporal",
        "WeightPerf", "WeightEffort", "WeightFrust",
        "RawTLX", "WeightedTLX",
        "ConfigScores", "ConfigWeightings",
        "DurationTotalSec", "DurationScalesSec", "DurationComparisonsSec", "IsTimedOut"
      ) VALUES (
        ${b['participantId']}, ${b['sessionId']}, ${b['language']},
        ${b['mentalDemand']}, ${b['physicalDemand']}, ${b['temporalDemand']},
        ${b['performance']}, ${b['effort']}, ${b['frustration']},
        ${b['weightMental']}, ${b['weightPhysical']}, ${b['weightTemporal']},
        ${b['weightPerf']}, ${b['weightEffort']}, ${b['weightFrust']},
        ${b['rawTLX']}, ${b['weightedTLX']},
        ${b['configScores']}, ${b['configWeightings']},
        ${b['durationTotalSec']}, ${b['durationScalesSec']}, ${b['durationComparisonsSec']}, ${b['isTimedOut'] === true}
      )
      -- Conflict target moved from (ParticipantId, SessionId) to (ParticipantGuid, SessionId) —
      -- item 1 of admin-dashboard-andrejkatin's "platform improvements round 2" plan.
      -- ParticipantGuid is auto-populated by a shared-DB trigger from ParticipantId before the
      -- conflict check runs, so no change is needed here beyond the conflict target itself.
      ON CONFLICT ("ParticipantGuid", "SessionId") DO UPDATE SET
        "Language" = EXCLUDED."Language",
        "MentalDemand" = EXCLUDED."MentalDemand",
        "PhysicalDemand" = EXCLUDED."PhysicalDemand",
        "TemporalDemand" = EXCLUDED."TemporalDemand",
        "Performance" = EXCLUDED."Performance",
        "Effort" = EXCLUDED."Effort",
        "Frustration" = EXCLUDED."Frustration",
        "WeightMental" = EXCLUDED."WeightMental",
        "WeightPhysical" = EXCLUDED."WeightPhysical",
        "WeightTemporal" = EXCLUDED."WeightTemporal",
        "WeightPerf" = EXCLUDED."WeightPerf",
        "WeightEffort" = EXCLUDED."WeightEffort",
        "WeightFrust" = EXCLUDED."WeightFrust",
        "RawTLX" = EXCLUDED."RawTLX",
        "WeightedTLX" = EXCLUDED."WeightedTLX",
        "ConfigScores" = EXCLUDED."ConfigScores",
        "ConfigWeightings" = EXCLUDED."ConfigWeightings",
        "DurationTotalSec" = EXCLUDED."DurationTotalSec",
        "DurationScalesSec" = EXCLUDED."DurationScalesSec",
        "DurationComparisonsSec" = EXCLUDED."DurationComparisonsSec",
        "IsTimedOut" = EXCLUDED."IsTimedOut",
        "CompletedAt" = NOW()
    `;
    sendJson(res, 201, { ok: true });
  } catch (err) {
    console.error('[DB] save result error:', err);
    sendJson(res, 500, { error: 'Database error' });
  }
}
