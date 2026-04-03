import type { Plan } from "../lib/types.js";
import type { SSEEmitter } from "../jobs/emitter.js";
import type { ValidateResult } from "../steps/03-05-generate-validate.js";

// ── Gate 1 — pause before generate, show plan + cost ──────────────────────────

export async function runGate1(
  jobId: string,
  plan: Plan,
  emitter: SSEEmitter
): Promise<boolean> {
  emitter.emit(jobId, { type: "gate:1:pause", plan });
  const approved = await emitter.waitForGateApproval(jobId, 1);
  if (approved) emitter.emit(jobId, { type: "gate:resume", gate: 1 });
  return approved;
}

// ── Gate 2 — pause before PR, show diff + impact ──────────────────────────────

export async function runGate2(
  jobId: string,
  result: ValidateResult,
  emitter: SSEEmitter
): Promise<boolean> {
  const yamlDiff = result.files
    .map((f) => `### ${f.filename}\n\`\`\`yaml\n${f.content}\n\`\`\``)
    .join("\n\n");

  const impactSummary = {
    workflowFiles: result.files.map((f) => f.filename),
    jobCount: result.files.reduce((s, f) => {
      const jobs = (f.content.match(/^\w[\w-]+:/gm) ?? []).length;
      return s + jobs;
    }, 0),
    stepCount: result.files.reduce((s, f) => {
      const steps = (f.content.match(/^\s+- name:/gm) ?? []).length;
      return s + steps;
    }, 0),
    runnerLabels: [
      ...new Set(
        result.files.flatMap((f) => {
          const matches = f.content.matchAll(/runs-on:\s*\[self-hosted,\s*([^\]]+)\]/g);
          return [...matches].map((m) => m[1].trim());
        })
      ),
    ],
    newSecrets: result.files.flatMap((f) => f.reviewNotes?.secretsNeeded ?? []),
    deploymentStandardChanges: result.files.flatMap((f) => f.reviewNotes?.warnings ?? []),
  };

  emitter.emit(jobId, { type: "gate:2:pause", yamlDiff, impactSummary });
  const approved = await emitter.waitForGateApproval(jobId, 2);
  if (approved) emitter.emit(jobId, { type: "gate:resume", gate: 2 });
  return approved;
}
