import { describe, expect, it } from 'vitest';

import { getPhaseTimer, runWithPhaseTimer, timePhase } from './phase-timer';

const SLEEP_MS = 20;
const NO_PHASES = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('phase timer', () => {
  it('attributes a phase to the timer open on the call', async () => {
    const attributes = await runWithPhaseTimer(async (timer) => {
      await timePhase('auth_gate', () => sleep(SLEEP_MS));
      return timer.attributes();
    });

    expect(Object.keys(attributes)).toEqual(['phase.auth_gate_ms']);
    expect(attributes['phase.auth_gate_ms']).toBeGreaterThanOrEqual(SLEEP_MS - 1);
  });

  it('sums repeated phases rather than keeping the last one', async () => {
    const attributes = await runWithPhaseTimer(async (timer) => {
      await timePhase('route_selection', () => sleep(SLEEP_MS));
      await timePhase('route_selection', () => sleep(SLEEP_MS));
      return timer.attributes();
    });

    expect(attributes['phase.route_selection_ms']).toBeGreaterThanOrEqual(SLEEP_MS * 2 - 1);
  });

  it('records a phase that threw before rethrowing', async () => {
    const failure = new Error('gate rejected');
    const attributes = await runWithPhaseTimer(async (timer) => {
      await expect(timePhase('policy_gate', () => Promise.reject(failure))).rejects.toBe(failure);
      return timer.attributes();
    });

    expect(attributes).toHaveProperty('phase.policy_gate_ms');
  });

  it('keeps concurrent requests apart', async () => {
    const [first, second] = await Promise.all([
      runWithPhaseTimer(async (timer) => {
        await timePhase('auth_gate', () => sleep(SLEEP_MS));
        return timer.attributes();
      }),
      runWithPhaseTimer(async (timer) => {
        await timePhase('spend_gate', () => sleep(SLEEP_MS));
        return timer.attributes();
      }),
    ]);

    expect(Object.keys(first)).toEqual(['phase.auth_gate_ms']);
    expect(Object.keys(second)).toEqual(['phase.spend_gate_ms']);
  });

  it('runs the work unattributed outside an instrumented request', async () => {
    expect(getPhaseTimer()).toBeNull();
    await expect(timePhase('auth_gate', () => Promise.resolve('done'))).resolves.toBe('done');
  });

  it('reports no phases when nothing was timed', async () => {
    const attributes = await runWithPhaseTimer((timer) => Promise.resolve(timer.attributes()));
    expect(Object.keys(attributes)).toHaveLength(NO_PHASES);
  });
});
