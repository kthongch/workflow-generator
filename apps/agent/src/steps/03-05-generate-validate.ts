// ── Step 3: Map input ─────────────────────────────────────────────────────────

import type { JobInput, GeneratedFile } from "../lib/types.js";
import type { LoadedSkills } from "./01-read-skills.js";
import { claudeJSON, claudeStream } from "../claude.js";
import yaml from "js-yaml";

export interface MappedConfig {
  variables: Record<string, string>;
  runnerLabels: string[];
  conditions: Array<{ sort: number; expression: string }>;
  waves: Array<{ name: string; runner: string; sortRange: [number, number] }>;
}

export async function mapInput(
  input: JobInput,
  skills: LoadedSkills,
  onLog: (msg: string) => void
): Promise<MappedConfig> {
  onLog("Extracting variables, runners, and deployment waves...");

  const raw = await claudeJSON<MappedConfig>({
    model: "claude-haiku-4-5-20251001", // Haiku — structured extraction
    system: skills.systemPrompt + "\n\nExtract deployment config. Respond ONLY with JSON.",
    user: buildFileContent(input) + "\n\nExtract the deployment configuration JSON.",
    maxTokens: 1500,
  });

  onLog(`Found ${Object.keys(raw.variables || {}).length} variables, ${raw.waves?.length || 0} waves`);
  return raw;
}

// ── Step 4: Generate workflow YAML (Sonnet, streaming) ────────────────────────

export interface GenerateResult {
  files: GeneratedFile[];
  rawYaml: string; // the last generated YAML (used for fix loop)
}

export async function generateWorkflow(
  input: JobInput,
  mappedConfig: MappedConfig,
  skills: LoadedSkills,
  onToken: (token: string) => void,
  onLog: (msg: string) => void
): Promise<GenerateResult> {
  onLog("Generating workflow YAML...");

  let fullText = "";

  await claudeStream({
    model: "claude-sonnet-4-20250514", // Sonnet — quality critical
    system: skills.systemPrompt,
    user:
      buildFileContent(input) +
      `\n\nMAP:\n${JSON.stringify(mappedConfig, null, 2)}\n\n` +
      "Generate GitHub Actions workflow(s). Respond ONLY with the JSON object.",
    maxTokens: 8000,
    onToken: (token) => {
      fullText += token;
      onToken(token);
    },
  });

  onLog("Parsing generated output...");

  const clean = fullText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(clean) as { files: GeneratedFile[] };
  const rawYaml = parsed.files?.[0]?.content ?? "";

  return { files: parsed.files, rawYaml };
}

// ── Step 5: Validate + AI fix loop ────────────────────────────────────────────

export interface ValidateResult {
  files: GeneratedFile[];
}

interface FixOptions {
  maxRetries: number;
  onRetry: (attempt: number, error: string) => void;
  onFixDone: (attempt: number) => void;
}

export async function validateAndFix(
  generateResult: GenerateResult,
  input: JobInput,
  skills: LoadedSkills,
  opts: FixOptions
): Promise<{ result: ValidateResult | null; retryCount: number }> {
  let currentFiles = generateResult.files;
  let retryCount = 0;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const errors = validateFiles(currentFiles);

    if (errors.length === 0) {
      return { result: { files: currentFiles }, retryCount };
    }

    if (attempt === opts.maxRetries) {
      // All retries exhausted
      return { result: null, retryCount };
    }

    retryCount++;
    const errorSummary = errors.join("\n");
    opts.onRetry(attempt + 1, errorSummary);

    // Ask Claude to fix — Sonnet for reasoning
    const fixed = await fixWorkflow(currentFiles, errorSummary, skills);
    opts.onFixDone(attempt + 1);
    currentFiles = fixed;
  }

  return { result: null, retryCount };
}

function validateFiles(files: GeneratedFile[]): string[] {
  const errors: string[] = [];

  for (const file of files) {
    // 1. Valid YAML
    try {
      const parsed = yaml.load(file.content) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") {
        errors.push(`${file.filename}: YAML parsed to non-object`);
        continue;
      }

      // 2. Required top-level keys
      for (const key of ["name", "on", "jobs"]) {
        if (!(key in parsed)) errors.push(`${file.filename}: missing top-level key '${key}'`);
      }

      const jobs = (parsed.jobs ?? {}) as Record<string, unknown>;
      if (typeof jobs !== "object" || Object.keys(jobs).length === 0) {
        errors.push(`${file.filename}: no jobs defined`);
        continue;
      }

      for (const [jobId, job] of Object.entries(jobs)) {
        const j = job as Record<string, unknown>;
        if (!j["runs-on"]) errors.push(`${file.filename}: job '${jobId}' missing runs-on`);
        if (!j["timeout-minutes"]) errors.push(`${file.filename}: job '${jobId}' missing timeout-minutes`);
        if (!Array.isArray(j.steps) || j.steps.length === 0)
          errors.push(`${file.filename}: job '${jobId}' has no steps`);

        // Check cleanup has if: always()
        if (jobId === "cleanup" && j["if"] !== "always()") {
          errors.push(`${file.filename}: cleanup job must have 'if: always()'`);
        }
      }
    } catch (e) {
      errors.push(`${file.filename}: YAML syntax error — ${String(e)}`);
    }
  }

  return errors;
}

async function fixWorkflow(
  files: GeneratedFile[],
  errors: string,
  skills: LoadedSkills
): Promise<GeneratedFile[]> {
  const raw = await claudeJSON<{ files: GeneratedFile[] }>({
    model: "claude-sonnet-4-20250514",
    system: skills.systemPrompt,
    user:
      `CURRENT YAML (has errors):\n${files.map((f) => f.content).join("\n\n---\n\n")}\n\n` +
      `VALIDATION ERRORS:\n${errors}\n\n` +
      "Fix ONLY the reported errors. Do not change anything else. Respond ONLY with the same JSON structure.",
    maxTokens: 8000,
  });
  return raw.files;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildFileContent(input: JobInput): string {
  const parts: string[] = [];
  for (const f of input.files ?? []) {
    const content = f.content.slice(0, 50_000);
    parts.push(`=== ${f.name} (source: ${f.sourceId}) ===\n${content}\n\n`);
  }
  if (input.prompt?.trim()) parts.push(`USER CONTEXT:\n${input.prompt}\n\n`);
  parts.push(`TARGET PLATFORM: ${input.platformId}\n`);
  return parts.join("");
}
