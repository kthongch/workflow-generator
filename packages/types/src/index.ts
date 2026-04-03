// ── Job ──────────────────────────────────────────────────────────────────────

export type JobStatus =
  | "queued"
  | "running"
  | "waiting_gate_1"
  | "waiting_gate_2"
  | "waiting_skill_pr"
  | "done"
  | "failed"
  | "cancelled";

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  input: JobInput;
  plan?: Plan;
  result?: JobResult;
  error?: JobError;
  retryCount: number;
}

export interface JobInput {
  files: InputFile[];
  prompt: string;
  platformId: PlatformId;
  project: string;
}

export interface InputFile {
  name: string;
  sizeBytes: number;
  sourceId: SourceId;
  content: string; // base64 for binary, utf-8 text otherwise
}

export type SourceId = "hydra" | "azure" | "document" | "prompt";
export type PlatformId =
  | "github-actions"
  | "azure-devops"
  | "jenkins"
  | "gitlab-ci";

// ── Plan (Gate 1 payload) ─────────────────────────────────────────────────────

export interface Plan {
  sourceType: SourceId;
  sourceSummary: string;
  detectedPatterns: string[];
  targetPlatform: PlatformId;
  expectedOutput: {
    workflowFiles: string[];
    jobs: string[];
    manualInputs: string[];
    runnerLabels: string[];
  };
  assumptions: string[];
  blockers: string[];
  skillUsed: string;
  skillVersion: string;
  costEstimate: CostEstimate;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

// ── Result (Gate 2 payload + final) ──────────────────────────────────────────

export interface JobResult {
  files: GeneratedFile[];
  prUrl?: string;
  prBranch?: string;
  summary: string;
  evalScore?: number;      // 0-10, from AI self-eval
  evalIssues?: string[];   // issues flagged by self-eval
}

export interface GeneratedFile {
  filename: string;
  repoPath: string;
  content: string;
  mappingSummary: MappingRow[];
  reviewNotes: ReviewNotes;
}

export interface MappingRow {
  source: string;
  sourceType: string;
  condition: string;
  ghJob: string;
  ghStep: string;
}

export interface ReviewNotes {
  blockers: string[];
  assumptions: string[];
  secretsNeeded: string[];
  boilerplateRemoved: string[];
  warnings: string[];
}

export interface JobError {
  message: string;
  step: string;
  retryCount: number;
  skillPrUrl?: string; // set if skill self-improve was triggered
}

// ── SSE Events ────────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: "step:start"; stepId: string; label: string }
  | { type: "step:log"; stepId: string; message: string }
  | { type: "step:stream"; token: string } // YAML token streaming in step 4
  | { type: "step:done"; stepId: string; durationMs: number }
  | { type: "gate:1:pause"; plan: Plan }
  | { type: "gate:2:pause"; yamlDiff: string; impactSummary: ImpactSummary }
  | { type: "gate:resume"; gate: 1 | 2 }
  | { type: "skill:pr:opened"; prUrl: string; proposedChanges: string }
  | { type: "job:done"; result: JobResult }
  | { type: "job:failed"; error: JobError }
  | { type: "heartbeat" }; // keep-alive every 15s

export interface ImpactSummary {
  workflowFiles: string[];
  jobCount: number;
  stepCount: number;
  runnerLabels: string[];
  newSecrets: string[];
  deploymentStandardChanges: string[];
}

// ── API request/response ──────────────────────────────────────────────────────

export interface CreateJobRequest {
  input: JobInput;
}

export interface CreateJobResponse {
  jobId: string;
}

export interface ApproveGateRequest {
  gate: 1 | 2;
  approved: boolean;
}

// ── Skill ─────────────────────────────────────────────────────────────────────

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  detectHints: string;
  version?: string;
}
