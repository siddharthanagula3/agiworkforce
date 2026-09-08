import type { AgentActivityState } from '@agiworkforce/client-runtime';
import { deriveAgentActivityLabel } from './agentActivityLabel';

export const TURN_START_PROGRESS_ENTRY_ID = 'progress:local-starting';

export const TURN_START_TICK_INTERVAL_MS = 1_000;

export function withTurnStartSummary(
  activity: AgentActivityState | undefined,
  summary: string,
): AgentActivityState | undefined {
  if (!activity) return activity;
  const index = activity.entries.findIndex((entry) => entry.id === TURN_START_PROGRESS_ENTRY_ID);
  if (index < 0) return activity;
  const entry = activity.entries[index];
  if (!entry || entry.kind !== 'progress' || entry.status !== 'running') return activity;
  if (entry.summary === summary) return activity;
  return {
    ...activity,
    entries: activity.entries.map((current, position) =>
      position === index ? { ...entry, summary } : current,
    ),
  };
}

export interface TurnStartTicker {
  stop: () => void;
}

export type TurnStartPhase = 'connecting' | 'waiting';

export interface TurnStartTickerOptions {
  modelName?: string | undefined;
  startedAtMs: number;
  phase?: TurnStartPhase;
  now?: () => number;
  intervalMs?: number;
  onSummary: (summary: string) => void;
}

export function turnStartSummary(
  phase: TurnStartPhase,
  modelName: string | undefined,
  elapsedMs: number,
): string {
  return deriveAgentActivityLabel(
    phase === 'waiting'
      ? { kind: 'waiting', ...(modelName ? { modelName } : {}), elapsedMs }
      : { kind: 'idle', ...(modelName ? { modelName } : {}), elapsedMs },
  );
}

export function startTurnStartTicker(options: TurnStartTickerOptions): TurnStartTicker {
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? TURN_START_TICK_INTERVAL_MS;
  const phase = options.phase ?? 'connecting';
  const timer = setInterval(() => {
    options.onSummary(
      turnStartSummary(phase, options.modelName, Math.max(0, now() - options.startedAtMs)),
    );
  }, intervalMs);
  return {
    stop: () => clearInterval(timer),
  };
}
