"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useJobStream } from "../lib/useJobStream";
import type { Plan, ImpactSummary, Job } from "@wfg/types";

// ── Types ─────────────────────────────────────────────────────────────────────
type SourceId = "hydra" | "azure" | "document" | "prompt";
type PlatformId = "github-actions" | "azure-devops" | "jenkins" | "gitlab-ci";
type Page = "dashboard" | "generate" | "skills" | "history" | "audit";

interface FileEntry { id: string; name: string; size: number; sourceId: SourceId; content: string }
interface SkillMeta { id: string; name: string; description: string; detectHints: string }
interface SourceMemory { source: string; status: string; seenCount: number; successRate: number; observations: string[] }

// ── Constants ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard" as Page, label: "Dashboard" },
  { id: "generate" as Page, label: "Generator" },
  { id: "history" as Page, label: "History" },
  { id: "skills" as Page, label: "Skills" },
  { id: "audit" as Page, label: "Audit log" },
];

const ICONS: Record<Page, React.ReactNode> = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  ),
  generate: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3,2 13,8 3,14" />
    </svg>
  ),
  history: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8,4 8,8 11,10" />
    </svg>
  ),
  skills: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 1l1.8 3.6L14 5.4l-3 2.9.7 4.1L8 10.4l-3.7 2L5 8.3 2 5.4l4.2-.8z" />
    </svg>
  ),
  audit: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <line x1="4" y1="6" x2="12" y2="6" />
      <line x1="4" y1="9" x2="10" y2="9" />
      <line x1="4" y1="12" x2="8" y2="12" />
    </svg>
  ),
};

const PLATFORMS: { id: PlatformId; name: string; tag?: string }[] = [
  { id: "github-actions", name: "GitHub Actions", tag: "default" },
  { id: "azure-devops", name: "Azure DevOps" },
  { id: "jenkins", name: "Jenkins", tag: "beta" },
  { id: "gitlab-ci", name: "GitLab CI", tag: "beta" },
];

const EXT_SOURCE: Record<string, SourceId> = {
  json: "hydra", yml: "azure", yaml: "azure",
  pdf: "document", doc: "document", docx: "document", md: "document", txt: "prompt",
};
const EXT_COLOR: Record<string, string> = {
  json: "#6366f1", yml: "#0ea5e9", yaml: "#0ea5e9",
  pdf: "#ef4444", doc: "#3b82f6", docx: "#3b82f6", txt: "#6b7280", md: "#10b981",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function readFile(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target?.result as string);
    r.onerror = rej;
    r.readAsText(f);
  });
}

function estimateCost(files: FileEntry[], platformId: PlatformId) {
  const bytes = files.reduce((s, f) => s + f.size, 0) || 0;
  const inTok = Math.round(bytes / 3.5) + 4000;
  const outTok = platformId === "github-actions" ? 2800 : 2200;
  return { inTok, outTok, total: inTok / 1e6 * 3 + outTok / 1e6 * 15, kb: bytes / 1024 };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function jobCostUsd(job: Job): number {
  const result = job.result as any;
  if (result?.evalScore !== undefined) {
    // Rough estimate from token usage
    const bytes = job.input.files?.reduce((s: number, f: any) => s + (f.sizeBytes ?? 0), 0) ?? 0;
    const inTok = Math.round(bytes / 3.5) + 4000;
    return inTok / 1e6 * 3 + 2800 / 1e6 * 15;
  }
  return 0;
}

// ── Shared components ─────────────────────────────────────────────────────────
function Pill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: bg, color }}>{label}</span>;
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: 12, ...style }}>
      {children}
    </div>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: "0.8px", marginBottom: 8 }}>{children}</div>;
}

function Empty({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center" as const, color: "#9ca3af" }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{msg}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    done: { color: "#16a34a", bg: "#f0fdf4" },
    failed: { color: "#dc2626", bg: "#fef2f2" },
    cancelled: { color: "#6b7280", bg: "#f9fafb" },
    running: { color: "#2563eb", bg: "#eff6ff" },
    waiting_gate_1: { color: "#d97706", bg: "#fffbeb" },
    waiting_gate_2: { color: "#d97706", bg: "#fffbeb" },
    queued: { color: "#6b7280", bg: "#f9fafb" },
  };
  const c = map[status] ?? { color: "#6b7280", bg: "#f9fafb" };
  return <Pill color={c.color} bg={c.bg} label={status.replace(/_/g, " ")} />;
}

// ── Gate modals ───────────────────────────────────────────────────────────────
function Gate1Modal({ plan, onApprove, onReject }: { plan: Plan; onApprove: () => void; onReject: () => void }) {
  return (
    <div style={{ position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 520, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 3 }}>Approve generation</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>No API call has been made yet — confirm to proceed</div>
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: "#374151", fontWeight: 500, marginBottom: 5 }}>{plan.sourceSummary}</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Source: <strong>{plan.sourceType}</strong> → Platform: <strong>{plan.targetPlatform}</strong>
          </div>
          {plan.blockers?.length > 0 && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef3c7", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
              ⚠ {plan.blockers.join(" · ")}
            </div>
          )}
        </Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { l: "Input tokens", v: `~${(plan.costEstimate.inputTokens / 1000).toFixed(1)}K` },
            { l: "Output tokens", v: `~${(plan.costEstimate.outputTokens / 1000).toFixed(1)}K` },
            { l: "Estimated cost", v: `$${plan.costEstimate.estimatedUsd.toFixed(4)}`, dark: true },
          ].map((r, i) => (
            <div key={i} style={{ background: r.dark ? "#111827" : "#f9fafb", borderRadius: 8, padding: "10px 12px", border: r.dark ? "none" : "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 11, color: r.dark ? "rgba(255,255,255,0.45)" : "#9ca3af", marginBottom: 3 }}>{r.l}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: r.dark ? "#fff" : "#111827" }}>{r.v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onReject} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={onApprove} style={{ flex: 2, padding: "11px 0", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Confirm & generate
          </button>
        </div>
      </div>
    </div>
  );
}

function Gate2Modal({ yamlDiff, impact, onApprove, onReject }: { yamlDiff: string; impact: ImpactSummary; onApprove: () => void; onReject: () => void }) {
  return (
    <div style={{ position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 700, width: "90%", maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 3 }}>Approve PR creation</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>Review generated workflow before pushing to GHES</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { l: "Files", v: String(impact.workflowFiles.length) },
            { l: "Jobs", v: String(impact.jobCount) },
            { l: "Steps", v: String(impact.stepCount) },
          ].map((r, i) => (
            <div key={i} style={{ background: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 3 }}>{r.l}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{r.v}</div>
            </div>
          ))}
        </div>
        {impact.runnerLabels?.length > 0 && (
          <div style={{ marginBottom: 12, fontSize: 12, color: "#6b7280" }}>
            Runners: {impact.runnerLabels.map(r => <code key={r} style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, marginRight: 4 }}>{r}</code>)}
          </div>
        )}
        {impact.newSecrets?.length > 0 && (
          <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "#92400e" }}>
            ⚠ Secrets to create in repo: {impact.newSecrets.join(", ")}
          </div>
        )}
        <pre style={{ background: "#0f172a", borderRadius: 10, padding: "14px 16px", fontSize: 11, fontFamily: "monospace", color: "#94a3b8", overflow: "auto", maxHeight: 280, lineHeight: 1.7, marginBottom: 20, whiteSpace: "pre-wrap" as const }}>
          {yamlDiff.slice(0, 6000)}
        </pre>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onReject} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Back</button>
          <button onClick={onApprove} style={{ flex: 2, padding: "11px 0", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Approve & open PR
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function PageDashboard({ setPage }: { setPage: (p: Page) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/jobs/list")
      .then(r => r.json())
      .then(d => { setJobs(d.jobs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const done = jobs.filter(j => j.status === "done");
  const failed = jobs.filter(j => j.status === "failed");
  const totalCost = done.reduce((s, j) => s + jobCostUsd(j), 0);
  const recent = jobs.slice(0, 8);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.5px" }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: "#9ca3af", margin: "4px 0 0" }}>All generations — session data</p>
        </div>
        <button onClick={() => setPage("generate")} style={{ background: "#111827", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + New generation
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        {[
          { l: "TOTAL JOBS", v: String(jobs.length), s: "this session" },
          { l: "SUCCESSFUL", v: String(done.length), s: `${jobs.length ? Math.round(done.length / jobs.length * 100) : 0}% success rate` },
          { l: "FAILED", v: String(failed.length), s: failed.length > 0 ? "check history" : "all good" },
          { l: "APPROX COST", v: `$${totalCost.toFixed(4)}`, s: "this session" },
        ].map((m, i) => (
          <Card key={i} style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.8px", marginBottom: 8 }}>{m.l}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: "-1px", marginBottom: 2 }}>{m.v}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{m.s}</div>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Recent generations</div>
          <button onClick={() => setPage("history")} style={{ fontSize: 12, color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
            View all →
          </button>
        </div>
        {loading && <div style={{ padding: "20px", fontSize: 13, color: "#9ca3af" }}>Loading…</div>}
        {!loading && recent.length === 0 && <Empty icon="⚡" msg="No generations yet — start by dropping a file in Generator" />}
        {recent.map((j, i) => {
          const file = j.input.files?.[0];
          const result = j.result as any;
          return (
            <div key={j.id} style={{ padding: "11px 20px", borderBottom: i < recent.length - 1 ? "1px solid #f9fafb" : "none", display: "grid", gridTemplateColumns: "1fr 90px 90px 80px 90px", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", fontFamily: "monospace" }}>
                  {result?.files?.[0]?.filename ?? file?.name ?? j.id.slice(0, 8)}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {j.input.project || "—"} · {j.input.platformId}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{file?.sourceId ?? "—"}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>{timeAgo(j.createdAt)}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", fontFamily: "monospace" }}>
                {j.status === "done" ? `$${jobCostUsd(j).toFixed(4)}` : "—"}
              </div>
              <StatusPill status={j.status} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ── Generator ─────────────────────────────────────────────────────────────────
function PageGenerator() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [platformId, setPlatformId] = useState<PlatformId>("github-actions");
  const [project, setProject] = useState("");
  const [dragging, setDragging] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { state, approveGate } = useJobStream(jobId);

  const est = estimateCost(files, platformId);
  const canSubmit = (files.length > 0 || prompt.trim().length > 0) && !submitting && !jobId;

  const addFiles = useCallback(async (list: FileList) => {
    const entries = await Promise.all(Array.from(list).map(async f => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return {
        id: Math.random().toString(36).slice(2),
        name: f.name, size: f.size,
        sourceId: (EXT_SOURCE[ext] ?? "document") as SourceId,
        content: await readFile(f).catch(() => ""),
      };
    }));
    setFiles(p => [...p, ...entries]);
  }, []);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            files: files.map(f => ({ name: f.name, sizeBytes: f.size, sourceId: f.sourceId, content: f.content })),
            prompt, platformId, project,
          },
        }),
      });
      const { jobId: id } = await res.json();
      setJobId(id);
    } finally { setSubmitting(false); }
  };

  const reset = () => { setJobId(null); setFiles([]); setPrompt(""); setProject(""); };

  const isLive = !!jobId;
  const isDone = state.phase === "done";
  const isFailed = state.phase === "failed";

  return (
    <div>
      {state.phase === "waiting_gate_1" && state.gate1Payload && (
        <Gate1Modal plan={state.gate1Payload} onApprove={() => approveGate(1, true)} onReject={() => approveGate(1, false)} />
      )}
      {state.phase === "waiting_gate_2" && state.gate2Payload && (
        <Gate2Modal yamlDiff={state.gate2Payload.yamlDiff} impact={state.gate2Payload.impactSummary} onApprove={() => approveGate(2, true)} onReject={() => approveGate(2, false)} />
      )}

      {/* Configure form */}
      {!isLive && (
        <div>
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.5px" }}>Generator</h1>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: "4px 0 0" }}>
              Drop source files → Gate 1 (approve cost) → Generate → Gate 2 (approve diff) → PR
            </p>
          </div>

          {/* 1. Project */}
          <Card>
            <SLabel>1 · Project label (optional)</SLabel>
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, marginBottom: 10 }}>
              Tag this generation for history tracking.
            </div>
            <input value={project} onChange={e => setProject(e.target.value)}
              placeholder="e.g. Checkout Service, Payment API, Scheduler…"
              style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#111827", background: "#fafafa", outline: "none", fontFamily: "inherit" }} />
          </Card>

          {/* 2. Input files */}
          <Card>
            <SLabel>2 · Input files</SLabel>
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, marginBottom: 12 }}>
              Drop deployment source files to convert. Source type is auto-detected from extension — change per file if needed.<br />
              Supported: <strong>JSON</strong> (Hydra) · <strong>YAML</strong> (Azure DevOps) · <strong>PDF / Word / Markdown</strong> (documents) · <strong>TXT</strong> (free-text prompt)
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragging ? "#6366f1" : "#d1d5db"}`, borderRadius: 10, padding: "32px 20px", textAlign: "center" as const, cursor: "pointer", background: dragging ? "#f5f3ff" : "#fafafa", transition: "all 0.12s" }}>
              <input ref={fileRef} type="file" multiple accept=".json,.yml,.yaml,.txt,.md,.pdf,.doc,.docx" onChange={e => e.target.files && addFiles(e.target.files)} style={{ display: "none" }} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>⬇</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Drop files here</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>or <span style={{ color: "#6366f1", fontWeight: 600 }}>click to browse</span></div>
            </div>
            {files.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <SLabel>File source types</SLabel>
                {files.map(f => {
                  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
                  const col = EXT_COLOR[ext] ?? "#6b7280";
                  return (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#fafafa", border: "1px solid #f3f4f6", borderRadius: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.name}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{(f.size / 1024).toFixed(1)} KB</div>
                      </div>
                      <select value={f.sourceId} onChange={e => setFiles(p => p.map(x => x.id === f.id ? { ...x, sourceId: e.target.value as SourceId } : x))}
                        style={{ padding: "5px 10px", border: "1.5px solid #e5e7eb", borderRadius: 6, fontSize: 12, color: "#374151", background: "#fff", outline: "none" }}>
                        <option value="hydra">hydra (JSON)</option>
                        <option value="azure">azure (YAML)</option>
                        <option value="document">document (PDF/Word/MD)</option>
                        <option value="prompt">prompt (free text)</option>
                      </select>
                      <button onClick={() => setFiles(p => p.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", color: "#d1d5db", cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* 3. Context */}
          <Card>
            <SLabel>3 · Additional context</SLabel>
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, marginBottom: 12 }}>
              Add instructions not obvious from the files — runner labels, target repo, approval gates, wave order, input parameters.
            </div>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
              placeholder={"Examples:\n• First file is a prereq deployment, second is the main app deployment\n• Runner label: RUNNER-PROD-1  ·  Target repo: my-app-repo\n• Add manual approval gate before the production wave\n• Make update_type a required dropdown: Major / Minor / Patch"}
              style={{ width: "100%", boxSizing: "border-box" as const, padding: "11px 14px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#374151", background: "#fafafa", resize: "vertical" as const, outline: "none", fontFamily: "inherit", lineHeight: 1.6 }} />
          </Card>

          {/* 4. Platform */}
          <Card>
            <SLabel>4 · Output platform</SLabel>
            <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5, marginBottom: 12 }}>
              Select the CI/CD platform to generate for. Each platform uses its own mapping rules and syntax conventions.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {PLATFORMS.map(p => (
                <div key={p.id} onClick={() => setPlatformId(p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1.5px solid ${platformId === p.id ? "#111827" : "#e5e7eb"}`, borderRadius: 10, cursor: "pointer", background: platformId === p.id ? "#111827" : "#fafafa", transition: "all 0.12s" }}>
                  <div style={{ width: 17, height: 17, borderRadius: "50%", border: `2px solid ${platformId === p.id ? "#fff" : "#d1d5db"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {platformId === p.id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: platformId === p.id ? "#fff" : "#111827" }}>{p.name}</div>
                    {p.tag && <div style={{ fontSize: 10, color: platformId === p.id ? "rgba(255,255,255,0.4)" : "#9ca3af" }}>{p.tag}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Cost bar + submit */}
          <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 12, padding: "14px 20px", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 20, alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.7px", textTransform: "uppercase" as const, marginBottom: 3 }}>Estimated cost</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.8px" }}>
                {files.length > 0 ? `$${est.total.toFixed(4)}` : "—"}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                {files.length > 0 ? `${est.kb.toFixed(1)} KB · ~${(est.inTok / 1000).toFixed(1)}K + ${(est.outTok / 1000).toFixed(1)}K tokens` : "Add files to estimate"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.7px", textTransform: "uppercase" as const, marginBottom: 5 }}>Output</div>
              <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "#111827", color: "#fff" }}>
                {PLATFORMS.find(p => p.id === platformId)?.name}
              </span>
            </div>
            <button onClick={submit} disabled={!canSubmit}
              style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: canSubmit ? "#111827" : "#f3f4f6", color: canSubmit ? "#fff" : "#9ca3af", fontWeight: 800, fontSize: 14, cursor: canSubmit ? "pointer" : "not-allowed", whiteSpace: "nowrap" as const }}>
              {submitting ? "Starting…" : canSubmit ? `Review & generate` : "Add input first"}
            </button>
          </div>
        </div>
      )}

      {/* Live view */}
      {isLive && (
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 22 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.5px" }}>
                {isDone ? "Generation complete" : isFailed ? "Generation failed" : "Generating…"}
              </h1>
              <p style={{ fontSize: 13, color: "#9ca3af", margin: "4px 0 0" }}>
                {isDone ? `PR ready` : isFailed ? (state.error?.message?.slice(0, 100) ?? "Error") : `${state.steps.find(s => s.status === "running")?.label ?? "Working"}…`}
              </p>
            </div>
            {(isDone || isFailed) && (
              <button onClick={reset} style={{ padding: "9px 18px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                New generation
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 14 }}>
            {/* Steps sidebar */}
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
              <SLabel>Steps</SLabel>
              {state.steps.length === 0 && <div style={{ fontSize: 12, color: "#d1d5db" }}>Starting…</div>}
              {state.steps.map(step => (
                <div key={step.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: step.status === "done" ? "#111827" : step.status === "running" ? "#eff6ff" : "#f9fafb", border: `1.5px solid ${step.status === "done" ? "#111827" : step.status === "running" ? "#2563eb" : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    {step.status === "done" && <span style={{ fontSize: 9, color: "#fff" }}>✓</span>}
                    {step.status === "running" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2563eb", display: "block" }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: step.status === "running" ? 600 : 400, color: step.status === "done" ? "#111827" : step.status === "running" ? "#1e40af" : "#d1d5db", lineHeight: 1.4 }}>
                      {step.label}
                    </div>
                    {step.durationMs !== undefined && step.status === "done" && (
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>{(step.durationMs / 1000).toFixed(1)}s</div>
                    )}
                    {step.logs.slice(-1).map((log, i) => (
                      <div key={i} style={{ fontSize: 10, color: "#9ca3af", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{log}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* YAML stream */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column" as const, minHeight: 300 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", letterSpacing: "0.7px", textTransform: "uppercase" as const, marginBottom: 10 }}>
                Output stream
              </div>
              <pre style={{ flex: 1, margin: 0, fontFamily: "monospace", fontSize: 12, color: "#94a3b8", lineHeight: 1.7, overflow: "auto", maxHeight: 500, whiteSpace: "pre-wrap" as const }}>
                {state.yamlTokens || (state.phase === "running" ? "Waiting for generation…" : "")}
                {state.phase === "running" && state.yamlTokens && (
                  <span style={{ display: "inline-block", width: 8, height: 14, background: "#818cf8", animation: "blink 1s step-end infinite", verticalAlign: "text-bottom" }} />
                )}
              </pre>
            </div>
          </div>

          {/* Done actions */}
          {isDone && state.result && (
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" as const }}>
              {state.result.prUrl && (
                <a href={state.result.prUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", padding: "11px 20px", borderRadius: 10, background: "#111827", color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                  View PR on GHES →
                </a>
              )}
              {state.result.evalScore !== undefined && (
                <div style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontSize: 13, color: state.result.evalScore >= 7 ? "#16a34a" : "#d97706", fontWeight: 600 }}>
                  AI quality score: {state.result.evalScore}/10
                  {state.result.evalIssues?.length ? (
                    <span style={{ fontWeight: 400, color: "#6b7280" }}> — {state.result.evalIssues[0]}</span>
                  ) : null}
                </div>
              )}
              {state.skillPrUrl && (
                <a href={state.skillPrUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", padding: "11px 16px", borderRadius: 10, border: "1px solid #a78bfa", background: "#f5f3ff", color: "#6d28d9", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  ◈ New skill learned — review PR
                </a>
              )}
            </div>
          )}

          {/* Error */}
          {isFailed && (
            <div style={{ marginTop: 14 }}>
              <div style={{ padding: "14px 16px", background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, marginBottom: state.error?.skillPrUrl ? 10 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 6 }}>Generation failed</div>
                <div style={{ fontSize: 12, color: "#7f1d1d", fontFamily: "monospace", lineHeight: 1.5, wordBreak: "break-word" as const }}>
                  {state.error?.message ?? "Unknown error"}
                </div>
                {state.error?.message?.toLowerCase().includes("credit") && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#dc2626" }}>
                    → Add credits at{" "}
                    <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#dc2626", fontWeight: 700 }}>
                      console.anthropic.com
                    </a>
                    {" "}→ Plans &amp; Billing
                  </div>
                )}
                {state.error?.message?.toLowerCase().includes("api_key") && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#dc2626" }}>
                    → Check ANTHROPIC_API_KEY in apps/agent/.env
                  </div>
                )}
              </div>
              {state.error?.skillPrUrl && (
                <div style={{ padding: "12px 14px", background: "#f5f3ff", border: "1px solid #a78bfa", borderRadius: 10, fontSize: 13, color: "#6d28d9", marginBottom: 10 }}>
                  Skill gap detected —{" "}
                  <a href={state.error.skillPrUrl} target="_blank" rel="noreferrer" style={{ color: "#6d28d9", fontWeight: 600 }}>
                    review skill PR
                  </a>{" "}
                  then retry.
                </div>
              )}
              <button onClick={reset} style={{ marginTop: 6, padding: "9px 18px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}

// ── History ───────────────────────────────────────────────────────────────────
function PageHistory({ setPage }: { setPage: (p: Page) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/jobs/list")
      .then(r => r.json())
      .then(d => { setJobs(d.jobs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.5px" }}>History</h1>
          <p style={{ fontSize: 13, color: "#9ca3af", margin: "4px 0 0" }}>All generation jobs — this session</p>
        </div>
        <button onClick={() => setPage("generate")} style={{ background: "#111827", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + New generation
        </button>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "11px 20px", borderBottom: "1px solid #f3f4f6", display: "grid", gridTemplateColumns: "1fr 100px 100px 80px 80px 100px", gap: 8 }}>
          {["Job / file", "Project", "Platform", "Source", "Time", "Status"].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: "0.7px" }}>{h}</div>
          ))}
        </div>
        {loading && <div style={{ padding: "20px", fontSize: 13, color: "#9ca3af" }}>Loading…</div>}
        {!loading && jobs.length === 0 && <Empty icon="◫" msg="No jobs yet — run a generation first" />}
        {jobs.map((j, i) => {
          const file = j.input.files?.[0];
          const result = j.result as any;
          const filename = result?.files?.[0]?.filename ?? file?.name ?? `job-${j.id.slice(0, 8)}`;
          return (
            <div key={j.id} style={{ padding: "12px 20px", borderBottom: i < jobs.length - 1 ? "1px solid #f9fafb" : "none", display: "grid", gridTemplateColumns: "1fr 100px 100px 80px 80px 100px", gap: 8, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {filename}
                </div>
                {result?.prUrl && (
                  <a href={result.prUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#6366f1", textDecoration: "none" }}>
                    View PR →
                  </a>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{j.input.project || "—"}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{j.input.platformId}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>{file?.sourceId ?? "—"}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>{timeAgo(j.createdAt)}</div>
              <StatusPill status={j.status} />
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ── Skills ────────────────────────────────────────────────────────────────────
function PageSkills() {
  const [sources, setSources] = useState<SkillMeta[]>([]);
  const [memory, setMemory] = useState<SourceMemory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/skills").then(r => r.json()),
      fetch("/api/memory").then(r => r.json()),
    ]).then(([s, m]) => {
      setSources(s.skills ?? []);
      setMemory(m.sources ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function getMemory(id: string): SourceMemory | undefined {
    return memory.find(m => m.source === id);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 4px", letterSpacing: "-0.5px" }}>Skills</h1>
      <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 20px" }}>
        Source & platform mapping rules — edit .md files and save to update immediately. No redeploy needed.
      </p>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "11px 18px", borderBottom: "1px solid #f3f4f6", display: "grid", gridTemplateColumns: "1fr 80px 60px 80px 200px", gap: 8 }}>
          {["Source skill", "Status", "Seen", "Success", "Detection hints"].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: "0.7px" }}>{h}</div>
          ))}
        </div>
        {loading && <div style={{ padding: "20px 18px", fontSize: 13, color: "#9ca3af" }}>Loading…</div>}
        {!loading && sources.length === 0 && <Empty icon="◈" msg="No source skills found — check SKILLS_PATH in .env" />}
        {sources.map((s, i) => {
          const mem = getMemory(s.id);
          const status = s.id.includes("draft") ? "draft" : mem ? mem.status : "stable";
          return (
            <div key={s.id} style={{ padding: "13px 18px", borderBottom: i < sources.length - 1 ? "1px solid #f9fafb" : "none", display: "grid", gridTemplateColumns: "1fr 80px 60px 80px 200px", gap: 8, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{s.name || s.id}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.description || "—"}</div>
                <div style={{ fontSize: 10, color: "#d1d5db", fontFamily: "monospace", marginTop: 2 }}>skills/sources/{s.id}.md</div>
              </div>
              <Pill
                color={status === "stable" ? "#16a34a" : status === "learning" ? "#2563eb" : "#d97706"}
                bg={status === "stable" ? "#f0fdf4" : status === "learning" ? "#eff6ff" : "#fffbeb"}
                label={status}
              />
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{mem?.seenCount ?? 0}×</div>
              <div style={{ fontSize: 12, color: mem ? (mem.successRate >= 0.8 ? "#16a34a" : "#d97706") : "#9ca3af", fontWeight: 600 }}>
                {mem ? `${Math.round(mem.successRate * 100)}%` : "—"}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {s.detectHints || "—"}
              </div>
            </div>
          );
        })}
      </Card>

      {memory.length > 0 && (
        <Card style={{ marginTop: 0 }}>
          <SLabel>Skill memory — observations</SLabel>
          {memory.map(m => (
            <div key={m.source} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{m.source}</div>
              {m.observations.length === 0 && <div style={{ fontSize: 11, color: "#d1d5db" }}>No observations yet</div>}
              {m.observations.slice(0, 5).map((o, i) => (
                <div key={i} style={{ fontSize: 11, color: "#6b7280", padding: "3px 0", borderBottom: "1px solid #f9fafb" }}>· {o}</div>
              ))}
            </div>
          ))}
        </Card>
      )}

      <div style={{ padding: "12px 16px", background: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 10, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
        <strong>How skills work:</strong> Each source skill (<code>skills/sources/*.md</code>) teaches the agent how to read a deployment tool's format.
        Platform skills (<code>skills/platforms/*.md</code>) define output syntax. Edit → save → next job uses updated rules automatically.
        <br /><br />
        <strong>Lifecycle:</strong> <code>draft</code> (agent-created, unverified) → <code>learning</code> (human-reviewed) → <code>stable</code> (high usage + success rate)
      </div>
    </div>
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────
interface AuditEntry {
  id: number; ts: string; jobId: string | null;
  userId: string; userName: string; action: string; detail: string | null;
}

function PageAudit() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/audit")
      .then(r => r.json())
      .then(d => { setEntries(d.entries ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const ACTION_COLOR: Record<string, { color: string; bg: string }> = {
    "job:created":        { color: "#2563eb", bg: "#eff6ff" },
    "gate:1:approved":    { color: "#16a34a", bg: "#f0fdf4" },
    "gate:2:approved":    { color: "#16a34a", bg: "#f0fdf4" },
    "gate:1:rejected":    { color: "#dc2626", bg: "#fef2f2" },
    "gate:2:rejected":    { color: "#dc2626", bg: "#fef2f2" },
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.5px" }}>Audit log</h1>
        <p style={{ fontSize: 13, color: "#9ca3af", margin: "4px 0 0" }}>All actions — who did what, when</p>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "11px 20px", borderBottom: "1px solid #f3f4f6", display: "grid", gridTemplateColumns: "160px 130px 160px 1fr 200px", gap: 8 }}>
          {["Time", "User", "Action", "Detail", "Job ID"].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: "0.7px" }}>{h}</div>
          ))}
        </div>

        {loading && <div style={{ padding: "20px", fontSize: 13, color: "#9ca3af" }}>Loading…</div>}
        {!loading && entries.length === 0 && <Empty icon="◫" msg="No audit entries yet — actions will appear here" />}

        {entries.map((e, i) => {
          const ac = ACTION_COLOR[e.action] ?? { color: "#6b7280", bg: "#f9fafb" };
          const date = new Date(e.ts);
          return (
            <div key={e.id} style={{ padding: "10px 20px", borderBottom: i < entries.length - 1 ? "1px solid #f9fafb" : "none", display: "grid", gridTemplateColumns: "160px 130px 160px 1fr 200px", gap: 8, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: "#374151", fontFamily: "monospace" }}>
                  {date.toLocaleDateString()} {date.toLocaleTimeString()}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>{e.userName}</div>
              <Pill color={ac.color} bg={ac.bg} label={e.action} />
              <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {e.detail ?? "—"}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{e.jobId?.slice(0, 8) ?? "—"}</div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSession } = require("next-auth/react");
  const { data: session } = useSession();
  const user = (session as any)?.user;

  const pages: Record<Page, React.ReactNode> = {
    dashboard: <PageDashboard setPage={setPage} />,
    generate: <PageGenerator />,
    history: <PageHistory setPage={setPage} />,
    skills: <PageSkills />,
    audit: <PageAudit />,
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f5f5f4", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", overflow: "hidden", fontSize: 15 }}>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#18181b", display: "flex", flexDirection: "column" as const, flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Minimal geometric logo mark */}
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" rx="1" fill="#18181b" />
                <rect x="9" y="1" width="6" height="6" rx="1" fill="#18181b" opacity="0.4" />
                <rect x="1" y="9" width="6" height="6" rx="1" fill="#18181b" opacity="0.4" />
                <rect x="9" y="9" width="6" height="6" rx="1" fill="#18181b" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa", letterSpacing: "-0.3px" }}>Workflow Generator</div>
              <div style={{ fontSize: 11, color: "#52525b", marginTop: 1 }}>Deployment AI</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: "12px 10px", flex: 1 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 10px", borderRadius: 8, border: "none",
                background: page === n.id ? "rgba(255,255,255,0.08)" : "transparent",
                color: page === n.id ? "#fafafa" : "#71717a",
                fontSize: 14, fontWeight: page === n.id ? 600 : 400,
                cursor: "pointer", textAlign: "left" as const, marginBottom: 2,
                transition: "all 0.1s",
              }}>
              <span style={{ opacity: page === n.id ? 1 : 0.5, display: "flex" }}>
                {ICONS[n.id]}
              </span>
              {n.label}
              {page === n.id && (
                <span style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "#fafafa" }} />
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#27272a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
              {user?.image ? (
                <img src={user.image} alt="" style={{ width: 28, height: 28 }} />
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="7" cy="5" r="2.5" />
                  <path d="M1.5 12.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
                </svg>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#fafafa", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {user?.name ?? "Local user"}
              </div>
              <div style={{ fontSize: 11, color: "#52525b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {user?.email ?? "No auth · Phase 1"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", padding: "32px 36px" }}>
        {pages[page]}
      </div>
    </div>
  );
}
