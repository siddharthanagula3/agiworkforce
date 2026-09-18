import { describe, expect, it } from 'vitest';

import {
  JOB_HEALTH_THRESHOLDS,
  describeJobHealth,
  evaluateJobHealth,
  jobHealthIncidentKey,
  type JobQueueHealthInput,
} from '../job-health';

function queue(overrides: Partial<JobQueueHealthInput> = {}): JobQueueHealthInput {
  return { queue: 'default', queued: 0, dead: 0, oldestQueuedAgeMs: 0, stuck: 0, ...overrides };
}

describe('background job health', () => {
  it('says nothing about a queue that is draining', () => {
    expect(evaluateJobHealth([queue({ queued: 40, oldestQueuedAgeMs: 30_000 })])).toEqual([]);
  });

  it('warns when the oldest due job has waited past the warning threshold', () => {
    const [alert] = evaluateJobHealth([
      queue({ queued: 3, oldestQueuedAgeMs: JOB_HEALTH_THRESHOLDS.warningAgeMs }),
    ]);
    expect(alert?.severity).toBe('warning');
    expect(alert?.reasons[0]).toContain('15m');
  });

  it('pages when a queue has not been picked up for an hour', () => {
    const [alert] = evaluateJobHealth([
      queue({ queued: 3, oldestQueuedAgeMs: JOB_HEALTH_THRESHOLDS.criticalAgeMs }),
    ]);
    expect(alert?.severity).toBe('critical');
  });

  it('raises a job that is running on a lapsed lease, which no other signal reports', () => {
    const [alert] = evaluateJobHealth([queue({ stuck: 1 })]);
    expect(alert?.severity).toBe('warning');
    expect(alert?.reasons[0]).toContain('lease that lapsed');
  });

  it('escalates once enough jobs are stuck at the same time', () => {
    const [alert] = evaluateJobHealth([queue({ stuck: JOB_HEALTH_THRESHOLDS.criticalStuck })]);
    expect(alert?.severity).toBe('critical');
  });

  it('does not downgrade a critical age because the stuck count is only a warning', () => {
    const [alert] = evaluateJobHealth([
      queue({ oldestQueuedAgeMs: JOB_HEALTH_THRESHOLDS.criticalAgeMs, stuck: 1 }),
    ]);
    expect(alert?.severity).toBe('critical');
    expect(alert?.reasons).toHaveLength(2);
  });

  it('judges each queue on its own', () => {
    const alerts = evaluateJobHealth([
      queue({ queue: 'exports', stuck: 2 }),
      queue({ queue: 'default' }),
    ]);
    expect(alerts.map((alert) => alert.queue)).toEqual(['exports']);
  });

  it('keys the incident per queue so one stuck queue does not suppress another', () => {
    expect(jobHealthIncidentKey('exports')).not.toBe(jobHealthIncidentKey('default'));
  });

  it('names the queue and the counts in the page body', () => {
    const [alert] = evaluateJobHealth([queue({ queue: 'exports', queued: 9, dead: 2, stuck: 1 })]);
    expect(describeJobHealth(alert!)).toContain('exports');
    expect(describeJobHealth(alert!)).toContain('queued 9, dead 2');
  });
});
