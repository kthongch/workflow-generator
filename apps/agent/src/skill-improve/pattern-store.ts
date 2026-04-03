import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SkillStatus = "draft" | "learning" | "stable";

export interface SourceMemory {
  source: string;
  status: SkillStatus;
  seenCount: number;
  stableThreshold: number;
  successCount: number;
  failCount: number;
  successRate: number;
  lastJobId: string;
  lastSeen: string;
  createdAt: string;
  detectionSignals: string[];
  observations: string[];  // freeform notes Claude adds
  prUrl?: string;          // skill PR if open
}

// ── Frontmatter helpers ───────────────────────────────────────────────────────

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [k, ...v] = line.split(":");
    if (k && v.length) meta[k.trim()] = v.join(":").trim();
  }
  return { meta, body: match[2].trim() };
}

function buildFrontmatter(mem: SourceMemory): string {
  return `---
source: ${mem.source}
status: ${mem.status}
seen_count: ${mem.seenCount}
stable_threshold: ${mem.stableThreshold}
success_count: ${mem.successCount}
fail_count: ${mem.failCount}
success_rate: ${mem.successRate.toFixed(2)}
last_job: ${mem.lastJobId}
last_seen: ${mem.lastSeen}
created_at: ${mem.createdAt}
detection_signals: ${mem.detectionSignals.join(",")}
${mem.prUrl ? `pr_url: ${mem.prUrl}` : ""}
---

## Observations
${mem.observations.map(o => `- ${o}`).join("\n")}
`;
}

// ── PatternStore ──────────────────────────────────────────────────────────────

export class PatternStore {
  private memDir: string;

  constructor(skillsPath: string) {
    this.memDir = join(skillsPath, "memory");
  }

  private memFile(source: string): string {
    return join(this.memDir, `source-${source}.md`);
  }

  get(source: string): SourceMemory | null {
    const path = this.memFile(source);
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8");
    const { meta, body } = parseFrontmatter(content);

    // Parse observations from body
    const obs = (body.match(/^- (.+)$/gm) ?? []).map(l => l.slice(2));

    return {
      source: meta.source ?? source,
      status: (meta.status ?? "draft") as SkillStatus,
      seenCount: parseInt(meta.seen_count ?? "0"),
      stableThreshold: parseInt(meta.stable_threshold ?? "10"),
      successCount: parseInt(meta.success_count ?? "0"),
      failCount: parseInt(meta.fail_count ?? "0"),
      successRate: parseFloat(meta.success_rate ?? "0"),
      lastJobId: meta.last_job ?? "",
      lastSeen: meta.last_seen ?? "",
      createdAt: meta.created_at ?? new Date().toISOString().split("T")[0],
      detectionSignals: (meta.detection_signals ?? "").split(",").filter(Boolean),
      observations: obs,
      prUrl: meta.pr_url || undefined,
    };
  }

  save(mem: SourceMemory): void {
    writeFileSync(this.memFile(mem.source), buildFrontmatter(mem), "utf-8");
  }

  // Record a job outcome and update status
  recordJobOutcome(
    source: string,
    jobId: string,
    success: boolean,
    newObservations: string[] = []
  ): SourceMemory {
    const existing = this.get(source);
    const now = new Date().toISOString().split("T")[0];

    const mem: SourceMemory = existing ?? {
      source,
      status: "draft",
      seenCount: 0,
      stableThreshold: 10,
      successCount: 0,
      failCount: 0,
      successRate: 0,
      lastJobId: jobId,
      lastSeen: now,
      createdAt: now,
      detectionSignals: [],
      observations: [],
    };

    mem.seenCount++;
    if (success) mem.successCount++; else mem.failCount++;
    mem.successRate = mem.successCount / mem.seenCount;
    mem.lastJobId = jobId;
    mem.lastSeen = now;

    // Deduplicate and add new observations
    for (const obs of newObservations) {
      if (!mem.observations.includes(obs)) mem.observations.push(obs);
    }

    // Status transitions
    if (mem.status === "draft" && mem.seenCount >= 1) {
      // stays draft until human merges PR
    }
    if (mem.status === "learning") {
      if (mem.seenCount >= mem.stableThreshold && mem.successRate >= 0.8) {
        mem.status = "stable";
      }
    }

    this.save(mem);
    return mem;
  }

  // Called when human merges the skill PR (draft → learning)
  promoteToLearning(source: string): void {
    const mem = this.get(source);
    if (!mem) return;
    if (mem.status === "draft") {
      mem.status = "learning";
      this.save(mem);
    }
  }

  listAll(): SourceMemory[] {
    if (!existsSync(this.memDir)) return [];
    return readdirSync(this.memDir)
      .filter(f => f.startsWith("source-") && f.endsWith(".md"))
      .map(f => this.get(f.replace("source-", "").replace(".md", "")))
      .filter((m): m is SourceMemory => m !== null);
  }
}
