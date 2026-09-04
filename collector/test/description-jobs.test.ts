import { describe, expect, it } from 'vitest';
import { planDescriptionJobs, recordDescriptionAttempt } from '../src/description-jobs.js';
const now = Date.parse('2026-09-04T00:00:00Z');
const source = { id: 'owner/tool', description: 'Search across research papers.', readmeSummary: null, descriptionZh: null, stars: 10 };
describe('description queue', () => {
  it('retries failures with backoff and resets when evidence changes', () => {
    const first = planDescriptionJobs([source], {}, new Set(), now);
    recordDescriptionAttempt(first.jobs[source.id], false, now);
    expect(planDescriptionJobs([source], first.jobs, new Set(), now + 1000).ready).toHaveLength(0);
    expect(planDescriptionJobs([source], first.jobs, new Set(), now + 86400000).ready).toHaveLength(1);
    const changed = planDescriptionJobs([{ ...source, description: 'Search academic papers with references.' }], first.jobs, new Set(), now);
    expect(changed.ready).toHaveLength(1);
    expect(changed.jobs[source.id].attempts).toBe(0);
  });
  it('keeps original English retryable and missing sources out of paid batches', () => {
    const english = { ...source, descriptionZh: source.description };
    expect(planDescriptionJobs([english], {}, new Set(), now).ready).toHaveLength(1);
    const missing = planDescriptionJobs([{ ...source, description: '' }], {}, new Set(), now);
    expect(missing.ready).toHaveLength(0);
    expect(missing.jobs[source.id].status).toBe('missing-source');
  });
  it('prioritizes visible lists and avoids repeats for completed Chinese', () => {
    const other = { ...source, id: 'owner/big', stars: 10000 };
    const plan = planDescriptionJobs([other, source], {}, new Set([source.id]), now);
    expect(plan.ready[0].id).toBe(source.id);
    const complete = planDescriptionJobs([{ ...source, descriptionZh: '搜索学术论文并整理引用来源。' }], {}, new Set(), now);
    expect(complete.ready).toHaveLength(0);
    expect(complete.jobs[source.id].status).toBe('complete');
  });
});
