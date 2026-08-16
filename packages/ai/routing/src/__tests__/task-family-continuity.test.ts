import { describe, expect, it } from 'vitest';

import {
  applyTaskFamilyContinuity,
  decideTaskFamilyContinuity,
  type TaskFamilySessionRoute,
} from '../task-family-continuity';

const LOW_MODEL_ID = 'fixture-low-model';
const MID_MODEL_ID = 'fixture-mid-model';
const HIGH_MODEL_ID = 'fixture-high-model';
const VISION_LOW_MODEL_ID = 'fixture-vision-low-model';
const VISION_HIGH_MODEL_ID = 'fixture-vision-high-model';

const LADDER = [LOW_MODEL_ID, MID_MODEL_ID, HIGH_MODEL_ID] as const;

const session = (modelKey: string, priorTurnCount = 3): TaskFamilySessionRoute => ({
  family: 'code_execution',
  modelKey,
  priorTurnCount,
});

describe('first turn', () => {
  it('starts a session on the router candidate', () => {
    expect(
      decideTaskFamilyContinuity({
        session: null,
        nextFamily: 'code_execution',
        candidateModelKey: MID_MODEL_ID,
        ladder: [...LADDER],
      }),
    ).toEqual({
      action: 'start',
      reasonCode: 'session_started',
      modelKey: MID_MODEL_ID,
      rung: 1,
    });
  });

  it('does not price a cache reset when there was no prior route', () => {
    const decision = decideTaskFamilyContinuity({
      session: null,
      nextFamily: 'simple_chat',
      candidateModelKey: LOW_MODEL_ID,
      ladder: [...LADDER],
    });
    expect(decision.cache).toBeUndefined();
  });
});

describe('stickiness', () => {
  it('keeps the pin when nothing failed, even if the router preferred another model', () => {
    const decision = decideTaskFamilyContinuity({
      session: session(MID_MODEL_ID),
      nextFamily: 'code_execution',
      candidateModelKey: LOW_MODEL_ID,
      ladder: [...LADDER],
    });
    expect(decision).toMatchObject({
      action: 'pin',
      reasonCode: 'family_pinned',
      modelKey: MID_MODEL_ID,
    });
  });

  it('treats an empty or whitespace failure signal as no failure', () => {
    for (const failureSignal of ['', '   ', null, undefined]) {
      expect(
        decideTaskFamilyContinuity({
          session: session(MID_MODEL_ID),
          nextFamily: 'code_execution',
          candidateModelKey: HIGH_MODEL_ID,
          ladder: [...LADDER],
          failureSignal,
        }).action,
      ).toBe('pin');
    }
  });

  it('releases the pin when the family changes and prices the cache reset', () => {
    const decision = decideTaskFamilyContinuity({
      session: session(MID_MODEL_ID, 5),
      nextFamily: 'vision',
      candidateModelKey: VISION_HIGH_MODEL_ID,
      ladder: [VISION_LOW_MODEL_ID, VISION_HIGH_MODEL_ID],
    });
    expect(decision).toMatchObject({
      action: 'reclassify',
      reasonCode: 'family_changed',
      modelKey: VISION_HIGH_MODEL_ID,
    });
    expect(decision.cache).toMatchObject({ resetsCache: true, warn: true, reason: 'cache-reset' });
  });

  it('does not apply continuity to an unclassified turn', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session(MID_MODEL_ID),
        nextFamily: null,
        candidateModelKey: LOW_MODEL_ID,
        ladder: [...LADDER],
      }),
    ).toMatchObject({ action: 'reclassify', reasonCode: 'family_unclassified' });
  });
});

describe('escalation-only switching', () => {
  it('escalates on a failure signal and prices the cache reset', () => {
    const decision = decideTaskFamilyContinuity({
      session: session(LOW_MODEL_ID, 4),
      nextFamily: 'code_execution',
      candidateModelKey: HIGH_MODEL_ID,
      ladder: [...LADDER],
      failureSignal: `Insufficient credits for ${LOW_MODEL_ID}, switched to ${HIGH_MODEL_ID}`,
    });
    expect(decision).toMatchObject({
      action: 'escalate',
      reasonCode: 'escalated_on_failure',
      modelKey: HIGH_MODEL_ID,
      rung: 2,
    });
    expect(decision.cache?.resetsCache).toBe(true);
  });

  it('refuses a downgrade and keeps the pin', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session(HIGH_MODEL_ID),
        nextFamily: 'code_execution',
        candidateModelKey: LOW_MODEL_ID,
        ladder: [...LADDER],
        failureSignal: 'provider_error',
      }),
    ).toMatchObject({
      action: 'hold',
      reasonCode: 'ladder_exhausted',
      modelKey: HIGH_MODEL_ID,
    });
  });

  it('refuses a downgrade below a mid-ladder pin', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session(MID_MODEL_ID),
        nextFamily: 'code_execution',
        candidateModelKey: LOW_MODEL_ID,
        ladder: [...LADDER],
        failureSignal: 'timeout',
      }),
    ).toMatchObject({
      action: 'hold',
      reasonCode: 'downgrade_blocked',
      modelKey: MID_MODEL_ID,
    });
  });

  it('refuses a lateral move — it buys nothing and pays the full cache reset', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session(MID_MODEL_ID),
        nextFamily: 'code_execution',
        candidateModelKey: MID_MODEL_ID,
        ladder: [...LADDER],
        failureSignal: 'provider_error',
      }),
    ).toMatchObject({ action: 'hold', reasonCode: 'lateral_move_blocked' });
  });

  it('refuses a candidate that is not on the ladder at all', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session(LOW_MODEL_ID),
        nextFamily: 'code_execution',
        candidateModelKey: 'fixture-off-ladder-model',
        ladder: [...LADDER],
        failureSignal: 'provider_error',
      }),
    ).toMatchObject({ action: 'hold', reasonCode: 'candidate_off_ladder' });
  });

  it('reports an exhausted ladder rather than silently retrying the top rung', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session(HIGH_MODEL_ID),
        nextFamily: 'code_execution',
        candidateModelKey: HIGH_MODEL_ID,
        ladder: [...LADDER],
        failureSignal: 'verifier_fail',
      }),
    ).toMatchObject({ action: 'hold', reasonCode: 'ladder_exhausted' });
  });

  it('never returns a model the caller did not offer', () => {
    const offered = new Set([MID_MODEL_ID, LOW_MODEL_ID]);
    for (const failureSignal of [undefined, 'provider_error']) {
      const decision = decideTaskFamilyContinuity({
        session: session(MID_MODEL_ID),
        nextFamily: 'code_execution',
        candidateModelKey: LOW_MODEL_ID,
        ladder: [...LADDER],
        failureSignal,
      });
      expect(offered).toContain(decision.modelKey);
    }
  });

  it('walks the ladder one rung at a time across repeated failures', () => {
    let pin: TaskFamilySessionRoute | null = null;
    const trace: string[] = [];
    for (const candidate of [LOW_MODEL_ID, MID_MODEL_ID, HIGH_MODEL_ID, HIGH_MODEL_ID]) {
      const decision = decideTaskFamilyContinuity({
        session: pin,
        nextFamily: 'code_execution',
        candidateModelKey: candidate,
        ladder: [...LADDER],
        failureSignal: pin === null ? undefined : 'provider_error',
      });
      trace.push(`${decision.action}:${decision.modelKey}`);
      pin = applyTaskFamilyContinuity(pin, 'code_execution', decision);
    }
    expect(trace).toEqual([
      `start:${LOW_MODEL_ID}`,
      `escalate:${MID_MODEL_ID}`,
      `escalate:${HIGH_MODEL_ID}`,
      `hold:${HIGH_MODEL_ID}`,
    ]);
  });
});

describe('applyTaskFamilyContinuity', () => {
  it('keeps the existing pin on pin and hold', () => {
    const existing = session(MID_MODEL_ID, 6);
    for (const action of ['pin', 'hold'] as const) {
      expect(
        applyTaskFamilyContinuity(existing, 'code_execution', {
          action,
          reasonCode: 'family_pinned',
          modelKey: existing.modelKey,
          rung: 1,
        }),
      ).toBe(existing);
    }
  });

  it('resets the cached turn count when the model actually moves', () => {
    expect(
      applyTaskFamilyContinuity(session(LOW_MODEL_ID, 9), 'code_execution', {
        action: 'escalate',
        reasonCode: 'escalated_on_failure',
        modelKey: HIGH_MODEL_ID,
        rung: 2,
      }),
    ).toEqual({ family: 'code_execution', modelKey: HIGH_MODEL_ID, priorTurnCount: 0 });
  });

  it('leaves the pin alone for an unclassified turn', () => {
    const existing = session(LOW_MODEL_ID);
    expect(
      applyTaskFamilyContinuity(existing, null, {
        action: 'reclassify',
        reasonCode: 'family_unclassified',
        modelKey: LOW_MODEL_ID,
        rung: 0,
      }),
    ).toBe(existing);
  });
});
