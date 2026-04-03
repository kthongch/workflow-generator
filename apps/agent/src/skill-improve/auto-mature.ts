import { PatternStore } from "./pattern-store.js";
import { GHESClient } from "../lib/ghes-client.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const SKILLS_PATH = process.env.SKILLS_PATH ?? "/mnt/skills";
const SKILLS_REPO = process.env.SKILLS_REPO ?? "org/deployment-ai-tools";

// Called after every successful job — checks if any draft/learning skill
// has reached the threshold for promotion
export async function checkAutoMature(sourceId: string): Promise<void> {
  const store = new PatternStore(SKILLS_PATH);
  const mem = store.get(sourceId);
  if (!mem) return;

  // learning → stable: seen >= threshold AND success rate >= 80%
  if (
    mem.status === "learning" &&
    mem.seenCount >= mem.stableThreshold &&
    mem.successRate >= 0.8
  ) {
    await proposeStablePR(sourceId, mem.seenCount, mem.successRate);
  }
}

async function proposeStablePR(
  sourceId: string,
  seenCount: number,
  successRate: number
): Promise<void> {
  // Read the current draft skill file
  const draftPath = join(SKILLS_PATH, "sources", `${sourceId}.md`);
  if (!existsSync(draftPath)) return;

  const content = readFileSync(draftPath, "utf-8");

  // Already stable — don't re-propose
  if (content.includes("status: stable")) return;

  // Replace status in frontmatter
  const stableContent = content
    .replace(/^status: (draft|learning)$/m, "status: stable")
    .replace(/^created_by: agent$/m, "created_by: agent-promoted");

  if (!process.env.GHES_BOT_TOKEN || !process.env.GHES_URL) return;

  const url = process.env.GHES_URL ?? "https://api.github.com";
  const baseUrl = url.includes("api.github.com") || url === "https://github.com"
    ? "https://api.github.com"
    : `${url.replace(/\/$/, "")}/api/v3`;

  const client = new GHESClient({
    baseUrl,
    token: process.env.GHES_BOT_TOKEN,
  });

  const [owner, repo] = SKILLS_REPO.split("/");

  try {
    await client.createPR({
      owner, repo,
      title: `skill: promote ${sourceId} to stable (${seenCount} uses, ${Math.round(successRate * 100)}% success)`,
      body: `## Auto-mature: ${sourceId} → stable

This skill has reached the stability threshold:
- **Seen**: ${seenCount} jobs
- **Success rate**: ${Math.round(successRate * 100)}%
- **Threshold**: ${seenCount} seen / 80% success

### What changed
Only the \`status\` field changed from \`learning\` → \`stable\`.
No mapping rules were modified.

Review and merge to mark this skill as production-ready.

---
*Auto-proposed by Workflow Generator Agent*`,
      head: `skill-mature/${sourceId}-${Date.now()}`,
      base: "main",
      files: [
        {
          path: `skills/sources/${sourceId}.md`,
          content: stableContent,
        },
      ],
    });
  } catch {
    // Non-critical — log but don't fail
    console.error(`[auto-mature] Failed to propose stable PR for ${sourceId}`);
  }
}
