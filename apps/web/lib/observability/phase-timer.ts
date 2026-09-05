import { AsyncLocalStorage } from 'node:async_hooks';

export interface PhaseTimer {
  record(phase: string, durationMs: number): void;
  attributes(): Record<string, number>;
}

const storage = new AsyncLocalStorage<PhaseTimer>();

const PHASE_ATTRIBUTE_PREFIX = 'phase';
const NO_ELAPSED_MS = 0;

function createPhaseTimer(): PhaseTimer {
  const totals = new Map<string, number>();
  return {
    record(phase, durationMs) {
      totals.set(phase, (totals.get(phase) ?? NO_ELAPSED_MS) + durationMs);
    },
    attributes() {
      const attributes: Record<string, number> = {};
      for (const [phase, durationMs] of totals) {
        attributes[`${PHASE_ATTRIBUTE_PREFIX}.${phase}_ms`] = durationMs;
      }
      return attributes;
    },
  };
}

export function runWithPhaseTimer<R>(fn: (timer: PhaseTimer) => R): R {
  const timer = createPhaseTimer();
  return storage.run(timer, () => fn(timer));
}

export function getPhaseTimer(): PhaseTimer | null {
  return storage.getStore() ?? null;
}

export async function timePhase<R>(phase: string, fn: () => Promise<R>): Promise<R> {
  const timer = storage.getStore();
  if (!timer) return fn();
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    timer.record(phase, Date.now() - startedAt);
  }
}
