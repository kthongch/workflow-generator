import type { JobInput } from "../lib/types.js";
import type { GeneratedFile } from "../lib/types.js";
import { claudeJSON } from "../claude.js";

export interface SelfEvalResult {
  score: number;          // 0-10
  passed: boolean;        // score >= 6
  issues: string[];       // specific problems found
  strengths: string[];    // what looks correct
  confidence: "high" | "medium" | "low"; // how confident the eval is
}

const EVAL_PROMPT = `You are evaluating a generated CI/CD workflow for quality.
You have the original source input and the generated output.
Score the output 0-10 based on:

- Correctness: does it accurately represent the source intent? (40%)
- Completeness: are all steps/conditions/variables covered? (30%)
- Standards: does it follow CI/CD best practices? (20%)
- Safety: no secrets inline, cleanup always runs, timeouts set? (10%)

Be critical. A score of 8+ means production-ready with no changes needed.
Respond ONLY with JSON.`;

export async function selfEvaluate(
  input: JobInput,
  files: GeneratedFile[]
): Promise<SelfEvalResult> {
  const sourcePreview = input.files
    .map(f => `=== ${f.name} (${f.sourceId}) ===\n${f.content.slice(0, 3000)}`)
    .join("\n\n");

  const outputPreview = files
    .map(f => `=== ${f.filename} ===\n${f.content.slice(0, 3000)}`)
    .join("\n\n");

  return claudeJSON<SelfEvalResult>({
    model: "claude-haiku-4-5-20251001", // Haiku — cheap, fast, good enough for eval
    system: EVAL_PROMPT,
    user:
      `SOURCE INPUT:\n${sourcePreview}\n\n` +
      `GENERATED OUTPUT:\n${outputPreview}\n\n` +
      `USER CONTEXT: ${input.prompt || "(none)"}\n\n` +
      `Evaluate and respond ONLY with JSON: { score, passed, issues, strengths, confidence }`,
    maxTokens: 600,
  });
}
