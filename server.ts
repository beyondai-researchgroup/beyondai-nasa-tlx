import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';
import { getDb, isNonEmptyString, validateResultPayload, validatePostSessionPayload, toCsv, getTlxConfigForParticipant, resolveTlxLink, resolveTlxHandoff } from './api/_lib/db';
import { notifyEegMarker, notifyEegStop } from './api/_lib/eeg';

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
      ` as unknown[];
      // 2026-09-09 fix — see api/db/participant/[id].ts's identical comment (this route mirrors
      // it for local dev): ParticipantId can collide across researches now, so a bare lookup
      // must fail loud on 2+ rows instead of silently picking one.
      if (rows.length > 1) {
        res.status(409).json({ error: 'AMBIGUOUS_PARTICIPANT_ID' });
        return;
      }
      res.json({ exists: rows.length > 0 });
    } catch (err) {
      console.error('[DB] participant check error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Research-level TLX structure config (BeyondAI Admin Dashboard's "Study Configuration"
  // page) — read by both the manual /login page and the /start auto-handoff instead of either
  // hardcoding {true,true} or letting whoever's testing pick fresh checkboxes each time.
  server.get('/api/db/tlx-config/:participantId', async (req, res) => {
    const participantId = req.params['participantId'];
    if (!isNonEmptyString(participantId, 50)) {
      res.status(400).json({ error: 'Invalid participant id' });
      return;
    }
    try {
      const sql = getDb();
      const result = await getTlxConfigForParticipant(sql, participantId);
      if (result.status === 'not_found') {
        res.status(404).json({ error: 'Participant not found' });
        return;
      }
      if (result.status === 'ambiguous') {
        res.status(409).json({ error: 'AMBIGUOUS_PARTICIPANT_ID' });
        return;
      }
      res.json(result.config);
    } catch (err) {
      console.error('[DB] tlx-config error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Magic-link resolution (Part D of the platform re-architecture, 2026-09-07) — mirrors
  // api/db/link/[token].ts (the standalone Vercel function used in production) for local dev.
  server.get('/api/db/link/:token', async (req, res) => {
    const token = req.params['token'];
    if (!isNonEmptyString(token, 64)) {
      res.status(400).json({ error: 'Invalid token' });
      return;
    }
    try {
      const sql = getDb();
      const result = await resolveTlxLink(sql, token);
      if (result.status === 'not_found') { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      if (result.status === 'expired') { res.status(410).json({ error: 'EXPIRED' }); return; }
      if (result.status === 'not_active') { res.status(403).json({ error: 'NOT_ACTIVE' }); return; }
      if (result.status === 'already_completed') { res.status(409).json({ error: 'ALREADY_COMPLETED' }); return; }
      res.json({ participantId: result.participantId, lang: result.lang, config: result.config });
    } catch (err) {
      console.error('[DB] link resolve error:', err);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  });

  // BeyondAI handoff token resolution — mirrors api/db/handoff/[token].ts for local dev.
  server.get('/api/db/handoff/:token', async (req, res) => {
    const token = req.params['token'];
    if (!isNonEmptyString(token, 64)) {
      res.status(400).json({ error: 'Invalid token' });
      return;
    }
    try {
      const sql = getDb();
      const result = await resolveTlxHandoff(sql, token);
      if (result.status === 'not_found') { res.status(404).json({ error: 'NOT_FOUND' }); return; }
      if (result.status === 'expired') { res.status(410).json({ error: 'EXPIRED' }); return; }
      res.json({
        participantId: result.participantId,
        dbSessionId: result.dbSessionId,
        lang: result.lang,
        config: result.config,
        codeReviewLinkToken: result.codeReviewLinkToken,
      });
    } catch (err) {
      console.error('[DB] handoff resolve error:', err);
      res.status(500).json({ error: 'SERVER_ERROR' });
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
          "DurationTotalSec", "DurationScalesSec", "DurationComparisonsSec", "IsTimedOut"
        ) VALUES (
          ${b.participantId}, ${b.sessionId}, ${b.language},
          ${b.mentalDemand}, ${b.physicalDemand}, ${b.temporalDemand},
          ${b.performance}, ${b.effort}, ${b.frustration},
          ${b.weightMental}, ${b.weightPhysical}, ${b.weightTemporal},
          ${b.weightPerf}, ${b.weightEffort}, ${b.weightFrust},
          ${b.rawTLX}, ${b.weightedTLX},
          ${b.configScores}, ${b.configWeightings},
          ${b.durationTotalSec}, ${b.durationScalesSec}, ${b.durationComparisonsSec}, ${b.isTimedOut === true}
        )
        -- Conflict target moved from (ParticipantId, SessionId) to (ParticipantGuid, SessionId) —
        -- see api/db/result.ts's identical comment (this file mirrors it for local dev).
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
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[DB] save result error:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Post-session questionnaire (2026-10-01) — saved AFTER the TLX result, from the new
  // /post-session page. One response per participant per session (re-submit overwrites, same
  // idempotent-retry shape as /api/db/result). Mirrors api/db/post-session-response.ts for
  // local dev.
  server.post('/api/db/post-session-response', async (req, res) => {
    const validationError = validatePostSessionPayload(req.body);
    if (validationError) {
      res.status(400).json({ error: `Invalid payload: ${validationError}` });
      return;
    }
    try {
      const sql = getDb();
      const b = req.body;
      await sql`
        INSERT INTO "PostSessionResponse" ("ParticipantId", "SessionId", "Language", "Answers")
        VALUES (${b.participantId}, ${b.sessionId}, ${b.language}, ${JSON.stringify(b.answers)})
        ON CONFLICT ("ParticipantGuid", "SessionId") DO UPDATE SET
          "Language" = EXCLUDED."Language",
          "Answers" = EXCLUDED."Answers",
          "CompletedAt" = NOW()
      `;
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[DB] save post-session response error:', err);
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
        typeof sessionId !== 'number' || !Number.isInteger(sessionId) || sessionId < 1 || sessionId > 4) {
      res.status(400).json({ error: 'Invalid payload: participantId and sessionId (1-4) are required' });
      return;
    }
    try {
      const sql = getDb();

      const participantRows = await sql`
        SELECT "IsTestParticipant" FROM "Participant" WHERE "ParticipantId" = ${participantId} LIMIT 1
      ` as { IsTestParticipant: boolean }[];
      if (!participantRows.length) {
        res.status(404).json({ error: 'Participant not found' });
        return;
      }

      // A fixed test participant's IsFinished flag never changes — see api/db/session-finished.ts's
      // identical comment (this file mirrors it for local dev).
      if (!participantRows[0].IsTestParticipant) {
        const rows = await sql`
          UPDATE "ParticipantSession"
          SET "IsFinished" = TRUE, "FinishedAt" = NOW()
          WHERE "ParticipantId" = ${participantId} AND "SessionId" = ${sessionId}
          RETURNING "Id"
        ` as unknown[];
        if (rows.length === 0) {
          res.status(404).json({ error: 'Participant session not found' });
          return;
        }
      }
      await notifyEegMarker('TLX_DONE');
      if (sessionId === 3 || sessionId === 4) {
        // Report (3) is the last of the 3 study sessions; Hybrid (4, experimental — participant
        // "004" only) is that participant's sole, terminal session — both stop recording.
        await notifyEegStop();
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
