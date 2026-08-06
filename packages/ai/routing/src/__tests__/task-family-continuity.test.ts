/**
 * Unit tests for task-family session stickiness and escalation-only switching.
 *
 * The two behaviours that must never regress:
 *   - a session stays pinned when nothing failed, even if this turn's router
 *     preferred someone else;
 *   - a switch may only move UP the ladder, and every refusal says which rule
 *     refused it.
 *
 * All inputs are fixed literals. No wall-clock value is read anywhere.
 */
import { describe, expect, it } from 'vitest';

import {
  applyTaskFamilyContinuity,
  decideTaskFamilyContinuity,
  type TaskFamilySessionRoute,
} from '../task-family-continuity';

/** Cheapest → most capable, exactly as `escalationLadder` is derived. */
const LADDER = ['glm-5.2', 'claude-sonnet-5', 'claude-opus-5'] as const;

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
        candidateModelKey: 'claude-sonnet-5',
        ladder: [...LADDER],
      }),
    ).toEqual({
      action: 'start',
      reasonCode: 'session_started',
      modelKey: 'claude-sonnet-5',
      rung: 1,
    });
  });

  it('does not price a cache reset when there was no prior route', () => {
    const decision = decideTaskFamilyContinuity({
      session: null,
      nextFamily: 'simple_chat',
      candidateModelKey: 'glm-5.2',
      ladder: [...LADDER],
    });
    expect(decision.cache).toBeUndefined();
  });
});

describe('stickiness', () => {
  it('keeps the pin when nothing failed, even if the router preferred another model', () => {
    const decision = decideTaskFamilyContinuity({
      session: session('claude-sonnet-5'),
      nextFamily: 'code_execution',
      candidateModelKey: 'glm-5.2',
      ladder: [...LADDER],
    });
    expect(decision).toMatchObject({
      action: 'pin',
      reasonCode: 'family_pinned',
      modelKey: 'claude-sonnet-5',
    });
  });

  it('treats an empty or whitespace failure signal as no failure', () => {
    for (const failureSignal of ['', '   ', null, undefined]) {
      expect(
        decideTaskFamilyContinuity({
          session: session('claude-sonnet-5'),
          nextFamily: 'code_execution',
          candidateModelKey: 'claude-opus-5',
          ladder: [...LADDER],
          failureSignal,
        }).action,
      ).toBe('pin');
    }
  });

  it('releases the pin when the family changes and prices the cache reset', () => {
    const decision = decideTaskFamilyContinuity({
      session: session('claude-sonnet-5', 5),
      nextFamily: 'vision',
      candidateModelKey: 'gemini-3.6-flash',
      ladder: ['gemini-3.5-flash-lite', 'gemini-3.6-flash'],
    });
    expect(decision).toMatchObject({
      action: 'reclassify',
      reasonCode: 'family_changed',
      modelKey: 'gemini-3.6-flash',
    });
    expect(decision.cache).toMatchObject({ resetsCache: true, warn: true, reason: 'cache-reset' });
  });

  it('does not apply continuity to an unclassified turn', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session('claude-sonnet-5'),
        nextFamily: null,
        candidateModelKey: 'glm-5.2',
        ladder: [...LADDER],
      }),
    ).toMatchObject({ action: 'reclassify', reasonCode: 'family_unclassified' });
  });
});

describe('escalation-only switching', () => {
  it('escalates on a failure signal and prices the cache reset', () => {
    const decision = decideTaskFamilyContinuity({
      session: session('glm-5.2', 4),
      nextFamily: 'code_execution',
      candidateModelKey: 'claude-opus-5',
      ladder: [...LADDER],
      failureSignal: 'Insufficient credits for glm-5.2, switched to claude-opus-5',
    });
    expect(decision).toMatchObject({
      action: 'escalate',
      reasonCode: 'escalated_on_failure',
      modelKey: 'claude-opus-5',
      rung: 2,
    });
    expect(decision.cache?.resetsCache).toBe(true);
  });

  it('refuses a downgrade and keeps the pin', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session('claude-opus-5'),
        nextFamily: 'code_execution',
        candidateModelKey: 'glm-5.2',
        ladder: [...LADDER],
        failureSignal: 'provider_error',
      }),
    ).toMatchObject({
      action: 'hold',
      reasonCode: 'ladder_exhausted',
      modelKey: 'claude-opus-5',
    });
  });

  it('refuses a downgrade below a mid-ladder pin', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session('claude-sonnet-5'),
        nextFamily: 'code_execution',
        candidateModelKey: 'glm-5.2',
        ladder: [...LADDER],
        failureSignal: 'timeout',
      }),
    ).toMatchObject({
      action: 'hold',
      reasonCode: 'downgrade_blocked',
      modelKey: 'claude-sonnet-5',
    });
  });

  it('refuses a lateral move — it buys nothing and pays the full cache reset', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session('claude-sonnet-5'),
        nextFamily: 'code_execution',
        candidateModelKey: 'claude-sonnet-5',
        ladder: [...LADDER],
        failureSignal: 'provider_error',
      }),
    ).toMatchObject({ action: 'hold', reasonCode: 'lateral_move_blocked' });
  });

  it('refuses a candidate that is not on the ladder at all', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session('glm-5.2'),
        nextFamily: 'code_execution',
        candidateModelKey: 'some-model-not-on-this-ladder',
        ladder: [...LADDER],
        failureSignal: 'provider_error',
      }),
    ).toMatchObject({ action: 'hold', reasonCode: 'candidate_off_ladder' });
  });

  it('reports an exhausted ladder rather than silently retrying the top rung', () => {
    expect(
      decideTaskFamilyContinuity({
        session: session('claude-opus-5'),
        nextFamily: 'code_execution',
        candidateModelKey: 'claude-opus-5',
        ladder: [...LADDER],
        failureSignal: 'verifier_fail',
      }),
    ).toMatchObject({ action: 'hold', reasonCode: 'ladder_exhausted' });
  });

  it('never returns a model the caller did not offer', () => {
    const offered = new Set(['claude-sonnet-5', 'glm-5.2']);
    for (const failureSignal of [undefined, 'provider_error']) {
      const decision = decideTaskFamilyContinuity({
        session: session('claude-sonnet-5'),
        nextFamily: 'code_execution',
        candidateModelKey: 'glm-5.2',
        ladder: [...LADDER],
        failureSignal,
      });
      expect(offered).toContain(decision.modelKey);
    }
  });

  it('walks the ladder one rung at a time across repeated failures', () => {
    let pin: TaskFamilySessionRoute | null = null;
    const trace: string[] = [];
    for (const candidate of ['glm-5.2', 'claude-sonnet-5', 'claude-opus-5', 'claude-opus-5']) {
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
      'start:glm-5.2',
      'escalate:claude-sonnet-5',
      'escalate:claude-opus-5',
      'hold:claude-opus-5',
    ]);
  });
});

describe('applyTaskFamilyContinuity', () => {
  it('keeps the existing pin on pin and hold', () => {
    const existing = session('claude-sonnet-5', 6);
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
      applyTaskFamilyContinuity(session('glm-5.2', 9), 'code_execution', {
        action: 'escalate',
        reasonCode: 'escalated_on_failure',
        modelKey: 'claude-opus-5',
        rung: 2,
      }),
    ).toEqual({ family: 'code_execution', modelKey: 'claude-opus-5', priorTurnCount: 0 });
  });

  it('leaves the pin alone for an unclassified turn', () => {
    const existing = session('glm-5.2');
    expect(
      applyTaskFamilyContinuity(existing, null, {
        action: 'reclassify',
        reasonCode: 'family_unclassified',
        modelKey: 'glm-5.2',
        rung: 0,
      }),
    ).toBe(existing);
  });
});
