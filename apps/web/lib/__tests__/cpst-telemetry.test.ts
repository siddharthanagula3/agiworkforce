import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  CPST_VERIFIER_RESULT_NO_SEAM,
  buildCpstUsageFields,
  buildInterimRoutePlanId,
  resolveCpstTaskOutcome,
} from '@/lib/cpst-telemetry';

/**
 * Stage-0 CPST telemetry contract
 * (docs/design/execution-plan-contract-and-cpst-2026-08-05.md §4.2/§4.3).
 *
 * The load-bearing property of phase 1 is that the `usage` jsonb column has NO
 * schema enforcement: every key is optional and absent-until-populated, so these
 * tests pin absence as hard as they pin presence.
 */
describe('resolveCpstTaskOutcome', () => {
  it('never reports success — billing success is not task success', () => {
    expect(resolveCpstTaskOutcome({ billingOutcome: 'completed' })).toBe('unknown');
  });

  it('maps a released (failed) charge to a task failure', () => {
    expect(resolveCpstTaskOutcome({ billingOutcome: 'failed' })).toBe('failure');
  });

  it('maps an explicit client cancellation to abandoned, not failure', () => {
    expect(resolveCpstTaskOutcome({ billingOutcome: 'failed', cancelled: true })).toBe('abandoned');
    expect(resolveCpstTaskOutcome({ billingOutcome: 'completed', cancelled: true })).toBe(
      'abandoned',
    );
  });

  it('treats a non-true cancelled flag as no cancellation signal', () => {
    expect(resolveCpstTaskOutcome({ billingOutcome: 'completed', cancelled: false })).toBe(
      'unknown',
    );
  });
});

describe('buildInterimRoutePlanId', () => {
  it('self-labels the id as interim so it is never mistaken for an ExecutionPlan id', () => {
    expect(
      buildInterimRoutePlanId({
        harnessId: 'anthropic/messages',
        routeId: 'anthropic:claude-sonnet-5',
        reason: 'preferred_slot',
      }),
    ).toBe('interim:anthropic/messages:anthropic:claude-sonnet-5:preferred_slot');
  });
});

describe('buildCpstUsageFields', () => {
  it('emits only the two always-knowable keys when nothing else is known', () => {
    const fields = buildCpstUsageFields({}, { billingOutcome: 'completed' });

    expect(fields).toEqual({
      taskOutcome: 'unknown',
      verifierResult: CPST_VERIFIER_RESULT_NO_SEAM,
    });
    // Absent-until-populated: every other key must be missing, not defaulted.
    expect('retries' in fields).toBe(false);
    expect('fallbackUsed' in fields).toBe(false);
    expect('fallbackReason' in fields).toBe(false);
    expect('routePlanId' in fields).toBe(false);
    expect('taskFamily' in fields).toBe(false);
    expect('taskFamilyConfidence' in fields).toBe(false);
  });

  it('records verifierResult as skipped rather than omitting it (no verifier seam exists)', () => {
    expect(buildCpstUsageFields({}, { billingOutcome: 'failed' }).verifierResult).toBe('skipped');
  });

  it('carries every populated signal through', () => {
    const fields = buildCpstUsageFields(
      {
        usedFallback: true,
        fallbackReason: 'managed_failover',
        routePlanId: 'interim:anthropic/messages:route-1:fallback_slot',
        resolvedTaskType: 'coding',
        classifierConfidence: 0.82,
        retries: 2,
      },
      { billingOutcome: 'completed' },
    );

    expect(fields).toEqual({
      taskOutcome: 'unknown',
      verifierResult: 'skipped',
      fallbackUsed: true,
      fallbackReason: 'managed_failover',
      retries: 2,
      routePlanId: 'interim:anthropic/messages:route-1:fallback_slot',
      taskFamily: 'coding',
      taskFamilyConfidence: 0.82,
    });
  });

  it('emits fallbackUsed:false without inventing a reason', () => {
    const fields = buildCpstUsageFields(
      { usedFallback: false, fallbackReason: 'stale reason' },
      { billingOutcome: 'completed' },
    );

    expect(fields.fallbackUsed).toBe(false);
    expect('fallbackReason' in fields).toBe(false);
  });

  it('omits retries entirely when no in-request rotation happened (unknown, not zero)', () => {
    const fields = buildCpstUsageFields(
      { usedFallback: false, resolvedTaskType: 'general' },
      { billingOutcome: 'completed' },
    );

    expect('retries' in fields).toBe(false);
  });

  it('rejects a non-integer or negative retry count instead of persisting it', () => {
    expect(
      'retries' in buildCpstUsageFields({ retries: 1.5 }, { billingOutcome: 'completed' }),
    ).toBe(false);
    expect(
      'retries' in buildCpstUsageFields({ retries: -1 }, { billingOutcome: 'completed' }),
    ).toBe(false);
    expect(
      'retries' in buildCpstUsageFields({ retries: Number.NaN }, { billingOutcome: 'completed' }),
    ).toBe(false);
    expect(buildCpstUsageFields({ retries: 0 }, { billingOutcome: 'completed' }).retries).toBe(0);
  });

  it('omits empty strings rather than persisting a blank identity', () => {
    const fields = buildCpstUsageFields(
      { routePlanId: '', resolvedTaskType: '', classifierConfidence: 0.5 },
      { billingOutcome: 'completed' },
    );

    expect('routePlanId' in fields).toBe(false);
    expect('taskFamily' in fields).toBe(false);
    expect('taskFamilyConfidence' in fields).toBe(false);
  });

  it('omits a non-finite classifier confidence but keeps the family', () => {
    const fields = buildCpstUsageFields(
      { resolvedTaskType: 'research', classifierConfidence: Number.POSITIVE_INFINITY },
      { billingOutcome: 'completed' },
    );

    expect(fields.taskFamily).toBe('research');
    expect('taskFamilyConfidence' in fields).toBe(false);
  });

  it('survives the jsonb round trip with no key added or dropped', () => {
    const fields = buildCpstUsageFields(
      {
        usedFallback: true,
        fallbackReason: 'openrouter_route_failover',
        routePlanId: 'interim:openai/responses:route-9:continuity',
        resolvedTaskType: 'reasoning',
        classifierConfidence: 0.61,
        retries: 1,
      },
      { billingOutcome: 'failed', cancelled: true },
    );

    // `finalize_managed_usage_request` receives JSON.stringify(usage) and stores
    // it as jsonb, so anything that does not survive this round trip is not
    // actually persistable.
    const roundTripped = JSON.parse(JSON.stringify(fields));

    expect(roundTripped).toEqual({
      taskOutcome: 'abandoned',
      verifierResult: 'skipped',
      fallbackUsed: true,
      fallbackReason: 'openrouter_route_failover',
      retries: 1,
      routePlanId: 'interim:openai/responses:route-9:continuity',
      taskFamily: 'reasoning',
      taskFamilyConfidence: 0.61,
    });
    expect(Object.keys(roundTripped).sort()).toEqual(Object.keys(fields).sort());
  });

  it('drops nothing but adds nothing either when the round trip starts empty', () => {
    const fields = buildCpstUsageFields({}, { billingOutcome: 'failed' });
    expect(JSON.parse(JSON.stringify(fields))).toEqual({
      taskOutcome: 'failure',
      verifierResult: 'skipped',
    });
  });
});
