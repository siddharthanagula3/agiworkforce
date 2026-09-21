import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  JOB_KINDS,
  JOB_QUEUE_NAMES,
  JOB_QUEUE_POLICIES,
  computeJobBackoffSeconds,
  queueForJobKind,
  type JobQueueName,
} from '../job-queues';

const JITTER_FLOOR = 0.8;
const JITTER_CEILING = 1.2;

/** Deterministic across runs, so a failure names one seed rather than a mood. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_00_00_00_00;
  };
}

const SEEDS = [1, 7, 13, 101, 4_099, 65_537, 2_147_483_647];

function attemptsFor(queue: JobQueueName): number[] {
  const policy = JOB_QUEUE_POLICIES[queue];
  return Array.from({ length: policy.maxAttempts + 4 }, (_value, index) => index);
}

describe('job backoff, over every queue the product defines', () => {
  it('measures every queue rather than a chosen one', () => {
    expect(JOB_QUEUE_NAMES.length).toBeGreaterThan(0);
    expect(new Set(JOB_QUEUE_NAMES).size).toBe(JOB_QUEUE_NAMES.length);
    expect(Object.keys(JOB_QUEUE_POLICIES).sort()).toEqual([...JOB_QUEUE_NAMES].sort());
  });

  it('never returns a delay past the queue ceiling, whatever the attempt or the jitter', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      for (const seed of SEEDS) {
        const random = seeded(seed);
        for (const attempt of attemptsFor(queue)) {
          const delay = computeJobBackoffSeconds(policy, attempt, random);
          expect(delay, `${queue} attempt ${attempt} seed ${seed}`).toBeLessThanOrEqual(
            policy.backoffMaxSeconds,
          );
        }
      }
    }
  });

  it('never returns a delay that would retry immediately', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      for (const seed of SEEDS) {
        const random = seeded(seed);
        for (const attempt of attemptsFor(queue)) {
          expect(
            computeJobBackoffSeconds(policy, attempt, random),
            `${queue} attempt ${attempt} seed ${seed}`,
          ).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('grows the delay with the attempt until the ceiling, with no jitter in the way', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      const fixed = () => 0.5;
      let previous = 0;
      for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
        const delay = computeJobBackoffSeconds(policy, attempt, fixed);
        expect(delay, `${queue} attempt ${attempt}`).toBeGreaterThanOrEqual(previous);
        previous = delay;
      }
      expect(previous, `${queue} reaches a real delay`).toBeGreaterThan(1);
    }
  });

  it('keeps the jitter inside the declared band, so two workers do not retry in lockstep', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
        const undiluted = Math.min(
          policy.backoffMaxSeconds,
          policy.backoffBaseSeconds * 2 ** Math.min(30, attempt - 1),
        );
        const low = computeJobBackoffSeconds(policy, attempt, () => 0);
        const high = computeJobBackoffSeconds(policy, attempt, () => 1);
        expect(low, `${queue} attempt ${attempt} floor`).toBeGreaterThanOrEqual(
          Math.max(1, Math.floor(undiluted * JITTER_FLOOR)),
        );
        expect(high, `${queue} attempt ${attempt} ceiling`).toBeLessThanOrEqual(
          Math.min(policy.backoffMaxSeconds, Math.ceil(undiluted * JITTER_CEILING)),
        );
      }
    }
  });

  it('spreads two failures of the same job rather than returning one fixed delay', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      const attempt = policy.maxAttempts;
      const delays = new Set(
        SEEDS.map((seed) => computeJobBackoffSeconds(policy, attempt, seeded(seed))),
      );
      const atCeiling = computeJobBackoffSeconds(policy, attempt, () => 0.5);
      const pinnedToCeiling = atCeiling === policy.backoffMaxSeconds;
      expect(delays.size > 1 || pinnedToCeiling, `${queue} spreads its retries`).toBe(true);
    }
  });

  it('clamps a random source that answers outside zero to one', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      for (const rogue of [-5, 5, Number.NaN]) {
        const delay = computeJobBackoffSeconds(policy, 3, () => rogue);
        expect(delay, `${queue} with random ${rogue}`).toBeGreaterThanOrEqual(1);
        expect(delay, `${queue} with random ${rogue}`).toBeLessThanOrEqual(
          policy.backoffMaxSeconds,
        );
      }
    }
  });
});

describe('queue policy, over every queue the product defines', () => {
  it('gives every queue a ceiling no smaller than its first delay', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      expect(policy.backoffMaxSeconds, queue).toBeGreaterThanOrEqual(policy.backoffBaseSeconds);
      expect(policy.backoffBaseSeconds, queue).toBeGreaterThan(0);
    }
  });

  it('gives every queue a bounded number of attempts, so a poison job reaches the dead letter', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      expect(policy.maxAttempts, queue).toBeGreaterThan(0);
      expect(Number.isFinite(policy.maxAttempts), queue).toBe(true);
    }
  });

  it('gives every queue a concurrency cap, so one queue cannot take every worker slot', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      expect(policy.maxConcurrency, queue).toBeGreaterThan(0);
      expect(policy.maxConcurrency, queue).toBeLessThanOrEqual(50);
    }
  });

  it('gives every queue a lease and a retention window', () => {
    for (const queue of JOB_QUEUE_NAMES) {
      const policy = JOB_QUEUE_POLICIES[queue];
      expect(policy.leaseSeconds, queue).toBeGreaterThan(0);
      expect(policy.retainFinishedDays, queue).toBeGreaterThan(0);
    }
  });

  it('routes every kind a producer can enqueue to a queue that has a policy', () => {
    const kinds = Object.keys(JOB_KINDS) as Array<keyof typeof JOB_KINDS>;
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      const queue = queueForJobKind(kind);
      expect(JOB_QUEUE_NAMES, `${kind} routes somewhere real`).toContain(queue);
    }
  });

  it('leaves no queue without a kind that can reach it', () => {
    const reachable = new Set(
      (Object.keys(JOB_KINDS) as Array<keyof typeof JOB_KINDS>).map(queueForJobKind),
    );
    for (const queue of JOB_QUEUE_NAMES) {
      expect(reachable, `${queue} has a producer`).toContain(queue);
    }
  });
});
