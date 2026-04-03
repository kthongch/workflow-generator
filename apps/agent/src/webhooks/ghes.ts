import type { FastifyInstance } from "fastify";
import { PatternStore } from "../skill-improve/pattern-store.js";
import { claudeJSON } from "../claude.js";
import { GHESClient } from "../lib/ghes-client.js";

const SKILLS_PATH = process.env.SKILLS_PATH ?? "/mnt/skills";
const SKILLS_REPO = process.env.SKILLS_REPO ?? "org/deployment-ai-tools";

interface GHESPREvent {
  action: "opened" | "closed" | "merged" | "synchronize" | "edited";
  pull_request: {
    number: number;
    title: string;
    body: string;
    html_url: string;
    merged: boolean;
    head: { ref: string };
    base: { ref: string };
  };
  repository: {
    name: string;
    full_name: string;
  };
}

export function registerWebhooks(app: FastifyInstance): void {
  // POST /webhooks/ghes — receives GHES pull_request events
  app.post<{ Body: GHESPREvent }>("/webhooks/ghes", async (req, reply) => {
    const event = req.body;

    // Only handle PRs in the skills repo
    if (event.repository?.full_name !== SKILLS_REPO) {
      return reply.send({ ok: true, skipped: "not skills repo" });
    }

    const pr = event.pull_request;
    const branch = pr.head.ref;

    // Only handle skill PRs (branch prefix: skill-learn/ or skill-fix/)
    if (!branch.startsWith("skill-learn/") && !branch.startsWith("skill-fix/")) {
      return reply.send({ ok: true, skipped: "not a skill PR" });
    }

    app.log.info({ action: event.action, branch, prNumber: pr.number }, "Skill PR event");

    if (event.action === "closed") {
      if (pr.merged) {
        await handleSkillPRMerged(pr, branch);
      } else {
        await handleSkillPRClosed(pr, branch);
      }
    }

    return reply.send({ ok: true });
  });
}

// ── PR merged ─────────────────────────────────────────────────────────────────

async function handleSkillPRMerged(
  pr: GHESPREvent["pull_request"],
  branch: string
): Promise<void> {
  const store = new PatternStore(SKILLS_PATH);

  // Extract source from branch name: skill-learn/bamboo-1234 → bamboo
  const sourceId = branch.replace("skill-learn/", "").split("-")[0];

  if (branch.startsWith("skill-learn/")) {
    // Draft skill was merged → promote to learning
    store.promoteToLearning(sourceId);

    // Check if PR was merged with edits — if so, learn from the diff
    await analyzeAndLearnFromPREdits(pr, sourceId);
  }

  // For skill-fix/ PRs — record that the fix was accepted
  if (branch.startsWith("skill-fix/")) {
    // Update pattern store to note fix was accepted
    const mem = store.listAll().find(m => m.prUrl === pr.html_url);
    if (mem) {
      store.recordJobOutcome(mem.source, "pr-merge", true, [
        `Fix PR #${pr.number} merged: ${pr.title}`,
      ]);
    }
  }
}

// ── PR closed without merge ───────────────────────────────────────────────────

async function handleSkillPRClosed(
  pr: GHESPREvent["pull_request"],
  branch: string
): Promise<void> {
  const store = new PatternStore(SKILLS_PATH);
  const sourceId = branch.replace("skill-learn/", "").split("-")[0];

  if (branch.startsWith("skill-learn/")) {
    // Draft rejected — mark in memory but keep draft for future attempt
    store.recordJobOutcome(sourceId, "pr-rejected", false, [
      `Skill PR #${pr.number} was rejected without merge`,
    ]);
  }
}

// ── Analyze PR edits as learning signal ───────────────────────────────────────

async function analyzeAndLearnFromPREdits(
  pr: GHESPREvent["pull_request"],
  sourceId: string
): Promise<void> {
  try {
    const client = new GHESClient({
      baseUrl: `${process.env.GHES_URL}/api/v3`,
      token: process.env.GHES_BOT_TOKEN!,
    });

    const [owner, repo] = SKILLS_REPO.split("/");

    // Get the diff of the merged PR
    const { data: files } = await (client as any).octokit.pulls.listFiles({
      owner, repo, pull_number: pr.number,
    });

    if (!files?.length) return;

    const diffs = files
      .filter((f: any) => f.filename.includes(sourceId))
      .map((f: any) => f.patch ?? "")
      .join("\n\n");

    if (!diffs) return;

    // Ask Claude what was learned from the human's edits
    const analysis = await claudeJSON<{ observations: string[] }>({
      model: "claude-haiku-4-5-20251001", // Haiku — simple extraction
      system: "Extract what a human corrected in a skill file diff. Return JSON: { observations: string[] }",
      user: `PR title: ${pr.title}\n\nDiff:\n${diffs.slice(0, 5000)}\n\nWhat did the human correct or add?`,
      maxTokens: 500,
    });

    if (analysis.observations?.length) {
      const store = new PatternStore(SKILLS_PATH);
      store.recordJobOutcome(sourceId, `pr-${pr.number}-edits`, true, analysis.observations);
    }
  } catch (err) {
    // Non-critical — webhook should not fail
    console.error("analyzeAndLearnFromPREdits failed:", err);
  }
}
