import type { SSEEvent } from "../lib/types.js";

type Subscriber = (event: SSEEvent) => void;

export class SSEEmitter {
  private subs = new Map<string, Set<Subscriber>>();
  private history = new Map<string, SSEEvent[]>();
  private gateResolvers = new Map<string, (approved: boolean) => void>();

  emit(jobId: string, event: SSEEvent): void {
    // Store in history for reconnect replay
    if (!this.history.has(jobId)) this.history.set(jobId, []);
    this.history.get(jobId)!.push(event);

    // Notify live subscribers
    this.subs.get(jobId)?.forEach((fn) => fn(event));
  }

  subscribe(jobId: string, fn: Subscriber): () => void {
    if (!this.subs.has(jobId)) this.subs.set(jobId, new Set());
    this.subs.get(jobId)!.add(fn);
    return () => this.subs.get(jobId)?.delete(fn);
  }

  getHistory(jobId: string): SSEEvent[] {
    return this.history.get(jobId) ?? [];
  }

  // Called by HTTP POST /jobs/:id/approve
  approveGate(jobId: string, gate: 1 | 2): void {
    const key = `${jobId}:gate${gate}`;
    const resolve = this.gateResolvers.get(key);
    if (resolve) {
      resolve(true);
      this.gateResolvers.delete(key);
    }
  }

  // Called by gate step — pauses runner until user approves
  waitForGateApproval(jobId: string, gate: 1 | 2): Promise<boolean> {
    const key = `${jobId}:gate${gate}`;
    return new Promise((resolve) => {
      this.gateResolvers.set(key, resolve);
    });
  }
}
