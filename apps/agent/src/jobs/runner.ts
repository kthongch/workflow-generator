import type { Job } from "../lib/types.js";
import { JobStore, auditLog } from "../db.js";
import { SSEEmitter } from "./emitter.js";
import { readSkills } from "../steps/01-read-skills.js";
import { mapInput, generateWorkflow, validateAndFix } from "../steps/03-05-generate-validate.js";
import { openPR } from "../steps/06-open-pr.js";
import { runGate1 } from "../gates/gate1.js";
import { runGate2 } from "../gates/gate2.js";
import { analyzeSkillGap, proposeSkillFix, proposeNewSourceSkill } from "../skill-improve/index.js";
import { PatternStore } from "../skill-improve/pattern-store.js";
import { selfEvaluate } from "../skill-improve/self-eval.js";
import { checkAutoMature } from "../skill-improve/auto-mature.js";
import { auditLog } from "../db.js";

const SKILLS_PATH = process.env.SKILLS_PATH || "/mnt/skills";

export class JobRunner {
  constructor(
    private store: JobStore,
    private emitter: SSEEmitter
  ) {}

  async run(jobId: string): Promise<void> {
    const job = this.store.get(jobId)!;

    const emit = (type: string, payload?: Record<string, unknown>) =>
      this.emitter.emit(jobId, { type, ...payload } as never);

    const stepStart = (stepId: string, label: string) =>
      emit("step:start", { stepId, label });

    const stepLog = (stepId: string, message: string) =>
      emit("step:log", { stepId, message });

    const stepDone = (stepId: string, start: number) =>
      emit("step:done", { stepId, durationMs: Date.now() - start });

    try {
      this.store.update(jobId, { status: "running" });

      // ── Step 1: Read skills (no Claude call) ─────────────────────────────
      let t = Date.now();
      stepStart("read-skills", "Loading skill files");
      const skills = await readSkills({
        skillsPath: SKILLS_PATH,
        platformId: job.input.platformId,
        sourceHint: job.input.files?.length === 1 ? job.input.files[0].sourceId : undefined,
      });
      stepDone("read-skills", t);

      // ── Gate 1 — static plan, no Claude needed ────────────────────────────
      // Build plan from input metadata only (no API call)
      const staticPlan = buildStaticPlan(job.input);
      this.store.update(jobId, { status: "waiting_gate_1", plan: staticPlan });
      const gate1Approved = await runGate1(jobId, staticPlan, this.emitter);
      if (!gate1Approved) {
        this.store.update(jobId, { status: "cancelled" });
        return;
      }
      this.store.update(jobId, { status: "running" });

      // ── Step 2: Map input (Haiku — first Claude call, after user approved) ─
      t = Date.now();
      stepStart("map-input", "Mapping deployment config");
      const mappedConfig = await mapInput(job.input, skills, (msg) =>
        stepLog("map-input", msg)
      );
      stepDone("map-input", t);

      // ── Step 4 + 5: Generate + validate with fix loop ─────────────────────
      t = Date.now();
      stepStart("generate", "Generating workflow YAML");

      let generateResult = await generateWorkflow(
        job.input,
        mappedConfig,
        skills,
        (token) => emit("step:stream", { token }),
        (msg) => stepLog("generate", msg)
      );
      stepDone("generate", t);

      t = Date.now();
      stepStart("validate", "Validating workflow");

      const { result: validatedResult, retryCount } = await validateAndFix(
        generateResult,
        job.input,
        skills,
        {
          maxRetries: Number(process.env.MAX_FIX_RETRIES || 3),
          onRetry: (attempt, error) => {
            stepLog("validate", `Validation failed (attempt ${attempt}): ${error}`);
            stepLog("validate", "Asking Claude to fix...");
          },
          onFixDone: (attempt) => {
            stepLog("validate", `Fix applied (attempt ${attempt}) — re-validating`);
          },
        }
      );
      stepDone("validate", t);

      this.store.update(jobId, { retryCount });

      // ── Skill self-improve if all retries exhausted ───────────────────────
      if (validatedResult === null) {
        stepLog("validate", "Validation failed after all retries — analyzing skill gap");
        this.store.update(jobId, { status: "waiting_skill_pr" });

        const analysis = await analyzeSkillGap(generateResult, job.input, skills);
        const skillPr = await proposeSkillFix(analysis, jobId);

        emit("skill:pr:opened", { prUrl: skillPr.prUrl, proposedChanges: analysis.summary });
        this.store.update(jobId, {
          status: "failed",
          error: {
            message: "Workflow validation failed — skill update proposed",
            step: "validate",
            retryCount,
            skillPrUrl: skillPr.prUrl,
          },
        });
        emit("job:failed", {
          error: {
            message: `Skill gap detected. Review and merge skill PR before retrying: ${skillPr.prUrl}`,
            step: "validate",
            retryCount,
            skillPrUrl: skillPr.prUrl,
          },
        });
        return;
      }

      // ── Gate 2 ────────────────────────────────────────────────────────────
      this.store.update(jobId, { status: "waiting_gate_2" });
      const gate2Approved = await runGate2(jobId, validatedResult, this.emitter);
      if (!gate2Approved) {
        this.store.update(jobId, { status: "cancelled" });
        return;
      }
      this.store.update(jobId, { status: "running" });

      // ── Step 6: Open PR ───────────────────────────────────────────────────
      t = Date.now();
      stepStart("open-pr", "Opening PR on GHES");
      const prResult = await openPR(job, validatedResult, (msg) =>
        stepLog("open-pr", msg)
      );
      stepDone("open-pr", t);

      // ── Step 7: AI self-eval (replaces user rating as weak signal) ──────────
      t = Date.now();
      stepStart("self-eval", "Evaluating output quality");

      let evalResult;
      try {
        evalResult = await selfEvaluate(job.input, validatedResult.files);
        stepLog("self-eval", `Score: ${evalResult.score}/10 — ${evalResult.passed ? "passed" : "needs review"}`);
        if (evalResult.issues.length) {
          stepLog("self-eval", `Issues: ${evalResult.issues.join("; ")}`);
        }
      } catch {
        // Non-critical — self-eval failure should not block the job
        evalResult = null;
      }
      stepDone("self-eval", t);

      // ── Step 8: Learn from input (fire-and-forget) ────────────────────────
      proposeNewSourceSkill(job.input, skills, jobId)
        .then((skillPr) => {
          if (skillPr) {
            emit("skill:pr:opened", {
              prUrl: skillPr.prUrl,
              proposedChanges: `New source skill learned: ${skillPr.sourceId}`,
            });
          }
        })
        .catch(() => { /* non-critical */ });

      // Update pattern store — AI eval as weak signal
      const patternStore = new PatternStore(SKILLS_PATH);
      const primarySource = job.input.files?.[0]?.sourceId;
      if (primarySource) {
        const evalPassed = evalResult?.passed ?? true;
        const observations = evalResult?.issues?.map(i => `Issue: ${i}`) ?? [];
        patternStore.recordJobOutcome(primarySource, jobId, evalPassed, observations);
        // Check if skill should be promoted to stable
        checkAutoMature(primarySource).catch(() => {});
      }

      // ── Done ──────────────────────────────────────────────────────────────
      const finalResult = {
        files: validatedResult.files,
        prUrl: prResult.prUrl,
        prBranch: prResult.branchName,
        summary: plan.sourceSummary,
        evalScore: evalResult?.score,
        evalIssues: evalResult?.issues ?? [],
      };
      this.store.update(jobId, { status: "done", result: finalResult });
      emit("job:done", { result: finalResult });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error = { message, step: "unknown", retryCount: job.retryCount };
      this.store.update(jobId, { status: "failed", error });
      emit("job:failed", { error });
    }
  }
}

// Build a static plan from input metadata — no Claude call needed
// This is shown at Gate 1 so user can approve before any API spend
function buildStaticPlan(input: Job["input"]) {
  const totalBytes = input.files?.reduce((s, f) => s + f.sizeBytes, 0) ?? 0;
  const inTok = Math.round((totalBytes || 174572) / 3.5) + 4000;
  const outTok = 2800;
  const estimatedUsd = inTok / 1e6 * 3.0 + outTok / 1e6 * 15.0;

  const sources = [...new Set(input.files?.map(f => f.sourceId) ?? ["unknown"])];
  const fileNames = input.files?.map(f => f.name) ?? [];

  return {
    sourceType: sources[0] ?? "unknown",
    sourceSummary: fileNames.length
      ? `${fileNames.length} file(s): ${fileNames.join(", ")}`
      : input.prompt?.slice(0, 80) ?? "Prompt-based generation",
    detectedPatterns: [],
    targetPlatform: input.platformId,
    expectedOutput: {
      workflowFiles: [`deploy-${input.project?.toLowerCase().replace(/\s+/g, "-") || "workflow"}.yml`],
      jobs: ["prepare", "deploy", "cleanup"],
      manualInputs: [],
      runnerLabels: [],
    },
    assumptions: ["Full analysis will run after approval"],
    blockers: [],
    skillUsed: `${sources[0]}-to-${input.platformId}`,
    skillVersion: "latest",
    costEstimate: { inputTokens: inTok, outputTokens: outTok, estimatedUsd },
  };
}
