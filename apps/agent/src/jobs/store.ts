import type { Job } from "@wfg/types";

export class JobStore {
  private jobs = new Map<string, Job>();

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  set(id: string, job: Job): void {
    this.jobs.set(id, job);
  }

  update(id: string, patch: Partial<Job>): Job {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job ${id} not found`);
    const updated = { ...job, ...patch, updatedAt: new Date().toISOString() };
    this.jobs.set(id, updated);
    return updated;
  }

  list(): Job[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}
