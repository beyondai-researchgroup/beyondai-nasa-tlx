import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';
import { getDb, isNonEmptyString, validateResultPayload, toCsv } from './api/_lib/db';

// ── Rate limiting (in-memory, per IP) ─────────────────────────────────────────

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(limit: number, windowMs: number): express.RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
    }
    const key = req.ip ?? 'unknown';
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}

export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.disable('x-powered-by');
  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  server.use(express.json());
  server.use('/api/', rateLimit(60, 60_000));

  // ── DB API routes ──────────────────────────────────────────────────────────

  server.get('/api/db/participant/:id', async (req, res) => {
    const id = req.params['id'];
    if (!isNonEmptyString(id, 50)) {
      res.status(400).json({ error: 'Invalid participant id' });
      return;
    }
    try {
      const sql = getDb();
      const rows = await sql`
        SELECT "ParticipantId" FROM "Participant"
        WHERE "ParticipantId" = ${id}
        LIMIT 1
      ` as unknown[];
      res.json({ exists: rows.length > 0 });
    } catch (err) {
      console.error('[DB] participant check error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  server.post('/api/db/result', async (req, res) => {
    const validationError = validateResultPayload(req.body);
    if (validationError) {
      res.status(400).json({ error: `Invalid payload: ${validationError}` });
      return;
    }
    try {
      const sql = getDb();
      const b = req.body;
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
          "DurationTotalSec", "DurationScalesSec", "DurationComparisonsSec"
        ) VALUES (
          ${b.participantId}, ${b.sessionId}, ${b.language},
          ${b.mentalDemand}, ${b.physicalDemand}, ${b.temporalDemand},
          ${b.performance}, ${b.effort}, ${b.frustration},
          ${b.weightMental}, ${b.weightPhysical}, ${b.weightTemporal},
          ${b.weightPerf}, ${b.weightEffort}, ${b.weightFrust},
          ${b.rawTLX}, ${b.weightedTLX},
          ${b.configScores}, ${b.configWeightings},
          ${b.durationTotalSec}, ${b.durationScalesSec}, ${b.durationComparisonsSec}
        )
        ON CONFLICT ("ParticipantId", "SessionId") DO UPDATE SET
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
          "CompletedAt" = NOW()
      `;
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[DB] save result error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Marks a study session (BeyondAI → NASA TLX flow) as finished for a participant.
  // Called by the results page right after the TLX result is saved successfully.
  server.post('/api/db/session-finished', async (req, res) => {
    const b = req.body as Record<string, unknown> | null;
    const participantId = b?.['participantId'];
    const sessionId = b?.['sessionId'];
    if (!isNonEmptyString(participantId, 50) ||
        typeof sessionId !== 'number' || !Number.isInteger(sessionId) || sessionId < 1 || sessionId > 3) {
      res.status(400).json({ error: 'Invalid payload: participantId and sessionId (1-3) are required' });
      return;
    }
    try {
      const sql = getDb();
      const rows = await sql`
        UPDATE "ParticipantSession"
        SET "IsFinished" = TRUE
        WHERE "ParticipantId" = ${participantId} AND "SessionId" = ${sessionId}
        RETURNING "Id"
      ` as unknown[];
      if (rows.length === 0) {
        res.status(404).json({ error: 'Participant session not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[DB] session-finished error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  server.get('/api/db/export', async (req, res) => {
    const token = process.env['EXPORT_TOKEN'];
    if (!token) {
      res.status(503).json({ error: 'Export disabled: EXPORT_TOKEN is not configured' });
      return;
    }
    if (req.query['token'] !== token) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    try {
      const sql = getDb();
      const rows = await sql`
        SELECT * FROM "TlxResult" ORDER BY "CompletedAt"
      ` as Record<string, unknown>[];
      const date = new Date().toISOString().slice(0, 10);
      res
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="tlx-results-${date}.csv"`)
        .send(toCsv(rows));
    } catch (err) {
      console.error('[DB] export error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ── Static files + Angular SSR ─────────────────────────────────────────────

  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      // Hashed bundles are safe to cache long-term; assets (i18n, images)
      // keep their names between deploys, so they must revalidate.
      if (filePath.includes('assets')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  server.get('*', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
      })
      .then((html) => res.send(html))
      .catch((err) => next(err));
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();
