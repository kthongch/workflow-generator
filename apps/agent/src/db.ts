import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Job } from "./lib/types.js";

// Pure JSON file store — no native deps, works on Windows without Python/gyp
// For high-volume use, swap to better-sqlite3 or Postgres later

const DATA_DIR = process.env.DB_PATH
  ? join(process.env.DB_PATH, "..")
  : join(process.cwd(), "data");

const JOBS_FILE = process.env.DB_PATH ?? join(DATA_DIR, "jobs.json");
const AUDIT_FILE = join(DATA_DIR, "audit.json");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(file: string, data: unknown): void {
  ensureDir();
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

// ── Job store ─────────────────────────────────────────────────────────────────

type JobMap = Record<string, Job>;

export class JobStore {
  private cache: JobMap | null = null;

  private load(): JobMap {
    if (!this.cache) this.cache = readJSON<JobMap>(JOBS_FILE, {});
    return this.cache;
  }

  private save(): void {
    writeJSON(JOBS_FILE, this.cache);
  }

  get(id: string): Job | undefined {
    return this.load()[id];
  }

  set(id: string, job: Job): void {
    this.load()[id] = job;
    this.save();
  }

  update(id: string, patch: Partial<Job>): Job {
    const jobs = this.load();
    if (!jobs[id]) throw new Error(`Job ${id} not found`);
    jobs[id] = { ...jobs[id], ...patch, updatedAt: new Date().toISOString() };
    this.save();
    return jobs[id];
  }

  list(limit = 100): Job[] {
    const jobs = Object.values(this.load());
    return jobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: number;
  ts: string;
  jobId: string | null;
  userId: string;
  userName: string;
  action: string;
  detail: string | null;
}

export function auditLog(entry: Omit<AuditEntry, "id" | "ts">): void {
  const entries = readJSON<AuditEntry[]>(AUDIT_FILE, []);
  entries.unshift({
    id: Date.now(),
    ts: new Date().toISOString(),
    ...entry,
  });
  // Keep last 1000 entries
  writeJSON(AUDIT_FILE, entries.slice(0, 1000));
}

export function getAuditLog(limit = 200): AuditEntry[] {
  return readJSON<AuditEntry[]>(AUDIT_FILE, []).slice(0, limit);
}
