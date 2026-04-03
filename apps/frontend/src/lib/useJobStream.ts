"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { SSEEvent, Plan, ImpactSummary, JobResult, JobError } from "@wfg/types";

export type JobPhase =
  | "idle"
  | "running"
  | "waiting_gate_1"
  | "waiting_gate_2"
  | "waiting_skill_pr"
  | "done"
  | "failed";

export interface JobState {
  phase: JobPhase;
  steps: StepState[];
  yamlTokens: string;
  gate1Payload?: Plan;
  gate2Payload?: { yamlDiff: string; impactSummary: ImpactSummary };
  skillPrUrl?: string;
  result?: JobResult;
  error?: JobError;
}

export interface StepState {
  id: string;
  label: string;
  status: "pending" | "running" | "done";
  logs: string[];
  durationMs?: number;
}

export function useJobStream(jobId: string | null) {
  const [state, setState] = useState<JobState>({ phase: "idle", steps: [], yamlTokens: "" });
  const esRef = useRef<EventSource | null>(null);

  const updateStep = useCallback((id: string, patch: Partial<StepState>) => {
    setState((s) => ({
      ...s,
      steps: s.steps.map((st) => (st.id === id ? { ...st, ...patch } : st)),
    }));
  }, []);

  const appendLog = useCallback((stepId: string, message: string) => {
    setState((s) => ({
      ...s,
      steps: s.steps.map((st) =>
        st.id === stepId ? { ...st, logs: [...st.logs, message] } : st
      ),
    }));
  }, []);

  useEffect(() => {
    if (!jobId) return;

    setState({ phase: "running", steps: [], yamlTokens: "" });

    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as SSEEvent;

      switch (event.type) {
        case "step:start":
          setState((s) => ({
            ...s,
            steps: [
              ...s.steps.filter((st) => st.id !== event.stepId),
              { id: event.stepId, label: event.label, status: "running", logs: [] },
            ],
          }));
          break;

        case "step:log":
          appendLog(event.stepId, event.message);
          break;

        case "step:stream":
          setState((s) => ({ ...s, yamlTokens: s.yamlTokens + event.token }));
          break;

        case "step:done":
          updateStep(event.stepId, { status: "done", durationMs: event.durationMs });
          break;

        case "gate:1:pause":
          setState((s) => ({ ...s, phase: "waiting_gate_1", gate1Payload: event.plan }));
          break;

        case "gate:2:pause":
          setState((s) => ({
            ...s,
            phase: "waiting_gate_2",
            gate2Payload: { yamlDiff: event.yamlDiff, impactSummary: event.impactSummary },
          }));
          break;

        case "gate:resume":
          setState((s) => ({ ...s, phase: "running" }));
          break;

        case "skill:pr:opened":
          setState((s) => ({
            ...s,
            phase: "waiting_skill_pr",
            skillPrUrl: event.prUrl,
          }));
          break;

        case "job:done":
          setState((s) => ({ ...s, phase: "done", result: event.result }));
          es.close();
          break;

        case "job:failed":
          setState((s) => ({ ...s, phase: "failed", error: event.error }));
          es.close();
          break;

        case "heartbeat":
          break;
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects — no action needed unless job is terminal
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [jobId, updateStep, appendLog]);

  const approveGate = useCallback(
    async (gate: 1 | 2, approved: boolean) => {
      if (!jobId) return;
      await fetch(`/api/jobs/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gate, approved }),
      });
    },
    [jobId]
  );

  return { state, approveGate };
}
