import type { JobInput, Plan } from "../lib/types.js";
import type { LoadedSkills } from "./01-read-skills.js";
import { claudeJSON } from "../claude.js";

export async function generatePlan(
  input: JobInput,
  skills: LoadedSkills,
  onLog: (msg: string) => void
): Promise<Plan> {
  onLog("Analyzing input files and detecting patterns...");

  const userContent = buildUserContent(input);

  const raw = await claudeJSON<Plan>({
    model: "claude-haiku-4-5-20251001", // Haiku — mechanical planning task
    system: skills.systemPrompt + "\n\n" + PLAN_INSTRUCTIONS,
    user: userContent,
    maxTokens: 2000,
  });

  onLog(`Detected: ${raw.sourceSummary}`);
  if (raw.blockers?.length) {
    onLog(`Blockers found: ${raw.blockers.length}`);
  }

  return raw;
}

function buildUserContent(input: JobInput): string {
  const parts: string[] = [];

  if (input.files?.length) {
    parts.push(`FILES (${input.files.length}):\n`);
    for (const f of input.files) {
      const content = f.content.startsWith("data:")
        ? "[binary file — metadata only]"
        : f.content.slice(0, 20_000); // truncate for planning
      parts.push(`=== ${f.name} (source: ${f.sourceId}, ${f.sizeBytes} bytes) ===\n${content}\n\n`);
    }
  }

  if (input.prompt?.trim()) {
    parts.push(`USER CONTEXT:\n${input.prompt}\n\n`);
  }

  parts.push(`TARGET PLATFORM: ${input.platformId}\n`);
  parts.push("Analyze the input and produce a structured plan. Respond ONLY with the JSON object.");

  return parts.join("");
}

const PLAN_INSTRUCTIONS = `
Produce a deployment plan JSON. Respond ONLY with valid JSON — no markdown fences.

Required fields:
- sourceType: detected source type
- sourceSummary: one sentence
- detectedPatterns: specific patterns found (not generic)
- targetPlatform: from user input
- expectedOutput: { workflowFiles, jobs, manualInputs, runnerLabels }
- assumptions: every inference not explicitly in input
- blockers: things that need human action after generation
- skillUsed: skill id used
- skillVersion: from skill frontmatter or "unknown"
- costEstimate: { inputTokens (estimate), outputTokens (estimate), estimatedUsd }
`;
