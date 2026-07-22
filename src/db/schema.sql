-- NASA TLX database schema for Neon PostgreSQL
-- Run once against your Neon database to initialise tables.

CREATE TABLE IF NOT EXISTS "Participant" (
  "Id"            SERIAL PRIMARY KEY,
  "FirstName"     VARCHAR(100),
  "LastName"      VARCHAR(100),
  "ParticipantId" VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS "TlxResult" (
  "Id"              SERIAL PRIMARY KEY,
  "ParticipantId"   VARCHAR(50) NOT NULL REFERENCES "Participant"("ParticipantId"),
  "SessionId"       VARCHAR(50) NOT NULL,
  "CompletedAt"     TIMESTAMPTZ DEFAULT NOW(),
  "Language"        VARCHAR(5),

  -- Raw scales (0–100; Performance already inverted on the client)
  "MentalDemand"    SMALLINT,
  "PhysicalDemand"  SMALLINT,
  "TemporalDemand"  SMALLINT,
  "Performance"     SMALLINT,
  "Effort"          SMALLINT,
  "Frustration"     SMALLINT,

  -- Weight factors (number of selections, 0–5 each, sum = 15)
  "WeightMental"    SMALLINT,
  "WeightPhysical"  SMALLINT,
  "WeightTemporal"  SMALLINT,
  "WeightPerf"      SMALLINT,
  "WeightEffort"    SMALLINT,
  "WeightFrust"     SMALLINT,

  -- Computed scores
  "RawTLX"          NUMERIC(5,2),
  "WeightedTLX"     NUMERIC(5,2),

  -- Active configuration flags
  "ConfigScores"       BOOLEAN,
  "ConfigWeightings"   BOOLEAN,

  -- Completion times in seconds, measured silently on the client
  "DurationTotalSec"       INTEGER,
  "DurationScalesSec"      INTEGER,
  "DurationComparisonsSec" INTEGER,

  -- One result per participant per session (the API upserts on conflict)
  CONSTRAINT "TlxResult_Participant_Session_UQ" UNIQUE ("ParticipantId", "SessionId")
);

-- Migration for databases created before the unique constraint existed.
-- Run once; fails harmlessly if the constraint is already present.
-- If it fails with a duplicate-key error, remove duplicate rows first
-- (keep the newest per participant+session), then re-run:
--
--   DELETE FROM "TlxResult" t USING "TlxResult" t2
--   WHERE t."ParticipantId" = t2."ParticipantId"
--     AND t."SessionId" = t2."SessionId"
--     AND t."Id" < t2."Id";
--
--   ALTER TABLE "TlxResult"
--     ADD CONSTRAINT "TlxResult_Participant_Session_UQ"
--     UNIQUE ("ParticipantId", "SessionId");
