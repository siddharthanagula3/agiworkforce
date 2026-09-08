import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import {
  TURN_START_PROGRESS_ENTRY_ID,
  startTurnStartTicker,
  withTurnStartSummary,
} from './turnStartProgress';

const STARTED_AT_MS = 1_000_000;
const MODEL_NAME = 'Fixture Router Model';

function placeholderActivity(summary: string): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'conversation-1',
    turnId: 'assistant-1',
    lastSequence: -1,
    status: 'running',
    startedAtMs: STARTED_AT_MS,
    updatedAtMs: STARTED_AT_MS,
    entries: [
      {
        kind: 'progress',
        id: TURN_START_PROGRESS_ENTRY_ID,
        progressId: 'local-starting',
        summary,
        status: 'running',
        startedAtMs: STARTED_AT_MS,
      },
    ],
  } as AgentActivityState;
}

describe('rewriting the starting step', () => {
  it('replaces the summary the placeholder was stamped with', () => {
    const next = withTurnStartSummary(
      placeholderActivity(`Connecting to ${MODEL_NAME}`),
      `Connecting to ${MODEL_NAME} · 12s`,
    );

    expect(next?.entries[0]).toMatchObject({ summary: `Connecting to ${MODEL_NAME} · 12s` });
  });

  it('leaves the event sequence alone so a real event stream is unaffected', () => {
    const before = placeholderActivity('Connecting');
    const next = withTurnStartSummary(before, 'Connecting · 3s');

    expect(next?.lastSequence).toBe(before.lastSequence);
  });

  it('does nothing once the starting step has been closed', () => {
    const closed = placeholderActivity('Connecting');
    closed.entries = closed.entries.map((entry) => ({ ...entry, status: 'completed' as const }));

    expect(withTurnStartSummary(closed, 'Connecting · 3s')).toBe(closed);
  });

  it('does nothing when there is no starting step to rewrite', () => {
    const other = placeholderActivity('Connecting');
    other.entries = [];

    expect(withTurnStartSummary(other, 'Connecting · 3s')).toBe(other);
  });

  it('tolerates a turn with no activity at all', () => {
    expect(withTurnStartSummary(undefined, 'anything')).toBeUndefined();
  });
});

describe('the starting step reports how long the turn has been waiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances the label every tick so a stalled route stops looking healthy', () => {
    const seen: string[] = [];
    let nowMs = STARTED_AT_MS;
    const ticker = startTurnStartTicker({
      modelName: MODEL_NAME,
      startedAtMs: STARTED_AT_MS,
      now: () => nowMs,
      intervalMs: 1_000,
      onSummary: (summary) => seen.push(summary),
    });

    for (let tick = 1; tick <= 3; tick += 1) {
      nowMs = STARTED_AT_MS + tick * 1_000;
      vi.advanceTimersByTime(1_000);
    }
    ticker.stop();

    expect(seen).toEqual([
      `Connecting to ${MODEL_NAME} · 1s`,
      `Connecting to ${MODEL_NAME} · 2s`,
      `Connecting to ${MODEL_NAME} · 3s`,
    ]);
  });

  it('stops emitting once the turn moves on', () => {
    const seen: string[] = [];
    const ticker = startTurnStartTicker({
      modelName: MODEL_NAME,
      startedAtMs: STARTED_AT_MS,
      now: () => STARTED_AT_MS + 5_000,
      intervalMs: 1_000,
      onSummary: (summary) => seen.push(summary),
    });

    vi.advanceTimersByTime(1_000);
    ticker.stop();
    vi.advanceTimersByTime(10_000);

    expect(seen).toHaveLength(1);
  });
});
