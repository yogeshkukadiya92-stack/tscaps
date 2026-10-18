import { randomUUID } from 'node:crypto';

/** One in-flight edit/export per session; retries never repeat mutations automatically. */
export class ReelService {
  constructor(browser, templates) { this.browser = browser; this.templates = templates; this.jobs = new Map(); this.active = null; }
  list({ query = '', category = 'All' } = {}) {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return this.templates.filter(t => (category === 'All' || t.category === category) && terms.every(term => `${t.name} ${t.description} ${t.bestFor} ${t.category} ${t.style}`.toLowerCase().includes(term)));
  }
  idle() { if (this.active) throw new Error(`Job ${this.active} is still running. Use get_job before another operation.`); }
  start(operation, projectId, run) {
    this.idle();
    const id = randomUUID(), job = { id, operation, projectId, status: 'running', startedAt: new Date().toISOString() };
    this.active = id; this.jobs.set(id, job);
    // Bound retained metadata without ever dropping the active job.
    if (this.jobs.size > 100) this.jobs.delete(this.jobs.keys().next().value);
    Promise.resolve().then(run).then(result => Object.assign(job, { status: 'succeeded', result }), error => Object.assign(job, { status: 'failed', error: error instanceof Error ? error.message : 'The operation failed. Inspect the plugin browser before retrying.' })).finally(() => { job.finishedAt = new Date().toISOString(); if (this.active === id) this.active = null; });
    return { ...job, instructions: 'Call get_job with this ID until succeeded or failed. Do not submit the same operation again while it is running.' };
  }
  get(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('Unknown job in this plugin session. Jobs are in memory; inspect the saved project if the plugin restarted.');
    return { ...job };
  }
}
