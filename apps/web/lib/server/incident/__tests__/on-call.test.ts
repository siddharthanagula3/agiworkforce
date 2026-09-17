import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  levelForElapsedMinutes,
  resolveOnCallRotation,
  respondersForLevel,
  responderAt,
  ESCALATION_LEVELS,
  ONCALL_ESCALATE_AFTER_MINUTES_ENV,
  ONCALL_ROTATION_ENV,
  ONCALL_ROTATION_START_ENV,
  ONCALL_SHIFT_HOURS_ENV,
} from '../on-call';

const START = '2026-09-07T00:00:00.000Z';

const ENVIRONMENT = {
  [ONCALL_ROTATION_ENV]: 'ada:ada@agiworkforce.com, grace:grace@agiworkforce.com',
  [ONCALL_ROTATION_START_ENV]: START,
  [ONCALL_SHIFT_HOURS_ENV]: '168',
};

const rotation = () => resolveOnCallRotation(ENVIRONMENT);

describe('on-call rotation', () => {
  it('parses handle and address pairs and drops anything that is not an address', () => {
    const parsed = resolveOnCallRotation({
      [ONCALL_ROTATION_ENV]: 'ada:ada@agiworkforce.com,broken,grace@agiworkforce.com',
    });

    expect(parsed.responders).toEqual([
      { handle: 'ada', email: 'ada@agiworkforce.com' },
      { handle: 'grace@agiworkforce.com', email: 'grace@agiworkforce.com' },
    ]);
  });

  it('answers with nobody when no rotation is configured', () => {
    expect(responderAt(new Date(START), resolveOnCallRotation({}))).toBeNull();
    expect(
      respondersForLevel(ESCALATION_LEVELS.everyone, new Date(START), resolveOnCallRotation({})),
    ).toEqual([]);
  });

  it('hands the pager over on each shift boundary and wraps round', () => {
    expect(responderAt(new Date(START), rotation())?.handle).toBe('ada');
    expect(responderAt(new Date('2026-09-13T23:59:00.000Z'), rotation())?.handle).toBe('ada');
    expect(responderAt(new Date('2026-09-14T00:00:00.000Z'), rotation())?.handle).toBe('grace');
    expect(responderAt(new Date('2026-09-21T00:00:00.000Z'), rotation())?.handle).toBe('ada');
  });

  it('adds the next responder at level two and everyone at level three', () => {
    const at = new Date(START);

    expect(
      respondersForLevel(ESCALATION_LEVELS.primary, at, rotation()).map((r) => r.handle),
    ).toEqual(['ada']);
    expect(
      respondersForLevel(ESCALATION_LEVELS.secondary, at, rotation()).map((r) => r.handle),
    ).toEqual(['ada', 'grace']);
    expect(
      respondersForLevel(ESCALATION_LEVELS.everyone, at, rotation()).map((r) => r.handle),
    ).toEqual(['ada', 'grace']);
  });

  it('does not page the same person twice when the rotation holds one responder', () => {
    const single = resolveOnCallRotation({
      [ONCALL_ROTATION_ENV]: 'ada:ada@agiworkforce.com',
      [ONCALL_ROTATION_START_ENV]: START,
    });

    expect(respondersForLevel(ESCALATION_LEVELS.secondary, new Date(START), single)).toHaveLength(
      1,
    );
  });

  it('raises the level as the condition survives the escalation window', () => {
    const configured = resolveOnCallRotation({
      ...ENVIRONMENT,
      [ONCALL_ESCALATE_AFTER_MINUTES_ENV]: '10',
    });

    expect(levelForElapsedMinutes(0, configured)).toBe(ESCALATION_LEVELS.primary);
    expect(levelForElapsedMinutes(9.9, configured)).toBe(ESCALATION_LEVELS.primary);
    expect(levelForElapsedMinutes(10, configured)).toBe(ESCALATION_LEVELS.secondary);
    expect(levelForElapsedMinutes(20, configured)).toBe(ESCALATION_LEVELS.everyone);
    expect(levelForElapsedMinutes(600, configured)).toBe(ESCALATION_LEVELS.everyone);
  });

  it('clamps an absurd shift or escalation window to something a human can hold', () => {
    const clamped = resolveOnCallRotation({
      ...ENVIRONMENT,
      [ONCALL_SHIFT_HOURS_ENV]: '999999',
      [ONCALL_ESCALATE_AFTER_MINUTES_ENV]: '0',
    });

    expect(clamped.shiftHours).toBe(8_760);
    expect(clamped.escalateAfterMinutes).toBe(15);
  });
});
