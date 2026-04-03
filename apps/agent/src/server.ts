import { readFileSync } from "fs";
import { join } from "path";

// Auto-load .env
try {
  const lines = readFileSync(join(process.cwd(), ".env"), "utf-8").split("\n");
  for (const line of lines) {
    const [k, ...v] = line.split("=");
    if (k?.trim() && !k.startsWith("#") && v.length) {
      process.env[k.trim()] ??= v.join("=").trim();
    }
  }
} catch {}

import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "crypto";
import type {
  CreateJobRequest,
  CreateJobResponse,
  ApproveGateRequest,
  Job,
  SSEEvent,
  SkillMeta,
} from "./lib/types.js";
import { JobRunner } from "./jobs/runner.js";
import { JobStore, auditLog, getAuditLog } from "./db.js";
import { SSEEmitter } from "./jobs/emitter.js";
import { listSkills } from "./steps/01-read-skills.js";
import { PatternStore } from "./skill-improve/pattern-store.js";
import { registerWebhooks } from "./webhooks/ghes.js";
import { authMiddleware, getUser } from "./auth.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.FRONTEND_URL || "*" });

const store = new JobStore();
const emitter = new SSEEmitter();

// ── Auth preHandler — applied to all routes except health ─────────────────────
app.addHook("preHandler", async (req, reply) => {
  if (req.url === "/health") return; // skip auth for health check
  await authMiddleware(req, reply);
});

// ── POST /jobs ────────────────────────────────────────────────────────────────
app.post<{ Body: CreateJobRequest; Reply: CreateJobResponse }>(
  "/jobs",
  async (req, reply) => {
    const user = getUser(req);
    const jobId = randomUUID();
    const job: Job = {
      id: jobId,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      input: req.body.input,
      retryCount: 0,
    };
    store.set(jobId, job);

    auditLog({
      jobId,
      userId: user.sub,
      userName: user.name ?? user.preferred_username ?? user.sub,
      action: "job:created",
      detail: `${req.body.input.files?.length ?? 0} files, platform: ${req.body.input.platformId}`,
    });

    const runner = new JobRunner(store, emitter);
    runner.run(jobId).catch((err) => {
      app.log.error({ jobId, err }, "Job runner crashed");
    });

    return reply.code(202).send({ jobId });
  }
);

// ── GET /jobs — list ──────────────────────────────────────────────────────────
app.get("/jobs", async (_req, reply) => {
  return reply.send({ jobs: store.list() });
});

// ── GET /jobs/:id ─────────────────────────────────────────────────────────────
app.get<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
  const job = store.get(req.params.id);
  if (!job) return reply.code(404).send({ error: "Job not found" });
  return reply.send(job);
});

// ── GET /jobs/:id/stream — SSE ────────────────────────────────────────────────
app.get<{ Params: { id: string } }>("/jobs/:id/stream", async (req, reply) => {
  const { id } = req.params;
  const job = store.get(id);
  if (!job) return reply.code(404).send({ error: "Job not found" });

  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
  reply.raw.flushHeaders();

  const send = (event: SSEEvent) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  emitter.getHistory(id).forEach(send);
  const unsub = emitter.subscribe(id, send);
  const hb = setInterval(() => send({ type: "heartbeat" }), 15_000);

  req.raw.on("close", () => {
    unsub();
    clearInterval(hb);
  });

  await new Promise(() => {});
});

// ── POST /jobs/:id/approve ────────────────────────────────────────────────────
app.post<{ Params: { id: string }; Body: ApproveGateRequest }>(
  "/jobs/:id/approve",
  async (req, reply) => {
    const { id } = req.params;
    const job = store.get(id);
    if (!job) return reply.code(404).send({ error: "Job not found" });

    const user = getUser(req);
    const { gate, approved } = req.body;

    auditLog({
      jobId: id,
      userId: user.sub,
      userName: user.name ?? user.sub,
      action: approved ? `gate:${gate}:approved` : `gate:${gate}:rejected`,
      detail: null,
    });

    if (!approved) {
      store.update(id, { status: "cancelled" });
      emitter.emit(id, { type: "job:failed", error: { message: `Cancelled at Gate ${gate}`, step: `gate${gate}`, retryCount: 0 } });
      return reply.send({ ok: true, action: "cancelled" });
    }

    emitter.approveGate(id, gate);
    return reply.send({ ok: true, action: "resumed" });
  }
);

// ── DELETE /jobs/:id ──────────────────────────────────────────────────────────
app.delete<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
  const job = store.get(req.params.id);
  if (!job) return reply.code(404).send({ error: "Job not found" });
  store.update(req.params.id, { status: "cancelled" });
  return reply.send({ ok: true });
});

// ── GET /skills ───────────────────────────────────────────────────────────────
app.get<{ Reply: { skills: SkillMeta[] } }>("/skills", async (_req, reply) => {
  const skills = await listSkills(process.env.SKILLS_PATH || "/mnt/skills");
  return reply.send({ skills });
});

// ── GET /memory ───────────────────────────────────────────────────────────────
app.get("/memory", async (_req, reply) => {
  const patternStore = new PatternStore(process.env.SKILLS_PATH || "/mnt/skills");
  return reply.send({ sources: patternStore.listAll() });
});

// ── GET /audit ────────────────────────────────────────────────────────────────
app.get("/audit", async (req, reply) => {
  const limit = Number((req.query as any).limit ?? 200);
  return reply.send({ entries: getAuditLog(limit) });
});

// ── Webhooks ──────────────────────────────────────────────────────────────────
registerWebhooks(app);

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", async (_req, reply) => {
  return reply.send({ ok: true, ts: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT || 4000);
await app.listen({ port, host: "0.0.0.0" });
console.log(`Agent running on port ${port}`);
