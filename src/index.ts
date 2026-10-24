import express from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { database, findPaths } from "./graph.js";
import {
  DEMO_BRIEF,
  DEMO_PEOPLE,
  EVENT_ID,
  demoEvidence,
  ScoutError,
  topics,
  type Trace,
} from "./domain.js";
import { credentials, fingerprint, read, reserve, write } from "./store.js";
import { loadEventMatchApi } from "./eventmatch-api.js";
import { collectEvidence } from "./brightdata.js";
const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  next();
});
app.use(express.json({ limit: "16kb" }));
app.get("/health", (_req, res) =>
  res.json({ service: "Scout", status: "online" }),
);
app.use("/api", (req, res, next) => {
  // Hosted private access is enforced by Vercel Authentication. Never disable it for this project.
  if (
    process.env.VERCEL &&
    (process.env.SCOUT_PROTECTION_MODE !== "vercel-auth" ||
      req.hostname !== process.env.VERCEL_URL)
  )
    return res
      .status(503)
      .json({
        error: {
          code: "protection_required",
          message: "Protected Scout deployment is required.",
        },
      });
  if (!["GET", "HEAD"].includes(req.method)) {
    const origin = req.get("origin");
    const expected = process.env.VERCEL
      ? `https://${req.get("host")}`
      : `http://${req.get("host")}`;
    if (origin !== expected)
      return res
        .status(403)
        .json({
          error: {
            code: "origin_mismatch",
            message: "Open Scout and retry this action from its own page.",
          },
        });
  }
  next();
});
app.get("/api/status", async (_req, res) => {
  const c = await credentials();
  const db = await database();
  try {
    await db
      .selectGraph("scout_health")
      .query("RETURN 1 AS ready", { TIMEOUT: 2000 });
  } finally {
    await db.close().catch(() => {});
  }
  res.json({
    database: true,
    eventmatch: !!(c.eventmatchKey || process.env.EVENTMATCH_API_KEY),
    brightdata: !!(c.brightdataKey && c.brightdataZone),
    brightdataEnabled: process.env.BRIGHTDATA_ENABLED === "true",
    eventId: EVENT_ID,
    mode: "protected-single-operator",
    provider: "EventMatch external developer API",
  });
});
const CredentialInput = z
  .object({
    eventmatchKey: z.string().max(4096).optional(),
    brightdataKey: z.string().max(4096).optional(),
    brightdataZone: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .optional(),
  })
  .strict();
app.post("/api/connections", async (req, res) => {
  const v = CredentialInput.parse(req.body);
  const current = await credentials();
  for (const [k, value] of Object.entries(v))
    if (value) Object.assign(current, { [k]: value });
  await write("credentials:operator", current, 7 * 86400000);
  res.json({
    saved: true,
    message:
      "Stored encrypted in the dedicated Scout database. Secret values are never returned.",
  });
});
const RunInput = z
  .object({
    id: z.uuid(),
    mode: z.enum(["synthetic", "live"]),
    brief: z
      .object({
        name: z.string().min(1).max(120),
        goal: z.string().min(10).max(1500),
        topic: z.enum(["mcp", "graph", "web"]),
        knownCompanies: z.array(z.string().max(200)).max(20),
      })
      .strict(),
  })
  .strict();
app.post("/api/run", async (req, res) => {
  const input = RunInput.parse(req.body);
  const stamp = fingerprint(input);
  const key = "run:" + input.id;
  const reservation = await reserve(key, stamp);
  if (!reservation.consistent)
    throw new ScoutError(
      "idempotency_conflict",
      "This run ID belongs to different inputs.",
      409,
    );
  if (!reservation.acquired) {
    const cached = await read<any>(key);
    if (cached?.status === "complete")
      return res.json({ ...cached.result, replayed: true });
    throw new ScoutError(
      "run_already_started",
      "This run has already started or its result is uncertain. Do not retry paid operations blindly.",
      409,
    );
  }
  const trace: Trace[] = [];
  try {
    let event,
      people,
      evidence,
      inspected,
      caveat = "";
    if (input.mode === "synthetic") {
      event = {
        id: "synthetic-event",
        title: "Synthetic conference · no real People",
      };
      people = DEMO_PEOPLE;
      evidence = demoEvidence();
      inspected = people.length;
      trace.push({
        tool: "Synthetic fixtures",
        status: "complete",
        detail:
          "EventMatch and Bright Data are simulated in this mode. FalkorDB is real.",
        durationMs: 0,
      });
    } else {
      const loaded = await loadEventMatchApi(trace);
      ({ event, people, inspected, caveat } = loaded);
      if (!people.length)
        throw new ScoutError(
          "insufficient_affiliation_evidence",
          "The bounded API shortlist contains no confirmed identities with a reported company. No affiliations were invented.",
        );
      evidence = await collectEvidence(people, trace);
    }
    const start = performance.now();
    const result = await findPaths(
      people,
      evidence,
      input.brief,
      event,
      input.id,
    );
    trace.push({
      tool: "FalkorDB · multi-hop Cypher query",
      status: "complete",
      detail:
        "Queried private requirements, reported company associations, public-source mentions and event listings. Known companies excluded.",
      durationMs: Math.round(performance.now() - start),
    });
    const output = {
      ...result,
      mode: input.mode,
      event,
      inspected,
      eligible: people.length,
      evidenceCount: evidence.length,
      topic: topics[input.brief.topic].label,
      trace,
      sourceCaveat: caveat,
      completedAt: new Date().toISOString(),
    };
    await write(key, { status: "complete", result: output });
    res.json(output);
  } catch (e) {
    await write(key, { status: "failed" }).catch(() => {});
    throw e;
  }
});
app.get("/api/brief", (_req, res) => res.json(DEMO_BRIEF));
const publicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);
app.use(express.static(publicDir, { etag: false, index: false }));
app.get("/", (req, res) => {
  if (process.env.VERCEL && req.hostname !== process.env.VERCEL_URL)
    return res.redirect(303, `https://${process.env.VERCEL_URL}/`);
  res.sendFile(path.join(publicDir, "index.html"));
});
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error: {
            code: "invalid_input",
            message: "Check the form fields and try again.",
          },
        });
    const e =
      error instanceof ScoutError
        ? error
        : new ScoutError(
            "execution_failed",
            "This step could not finish. Check connections and the run status before retrying.",
          );
    res.status(e.status).json({ error: { code: e.code, message: e.message } });
  },
);
if (!process.env.VERCEL)
  app.listen(Number(process.env.PORT || 3107), "127.0.0.1", () =>
    console.log("Scout listening on http://127.0.0.1:3107"),
  );
export default app;
