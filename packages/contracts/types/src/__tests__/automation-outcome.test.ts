import { describe, expect, it } from 'vitest';
import {
  attemptedAutomationOutcome,
  automationOutcomeSuccessRate,
  isAutomationOutcomeStatus,
  settleAutomationAttempt,
  startAutomationAttempt,
  summarizeAutomationOutcomes,
  type AutomationOutcome,
} from '../automation-outcome';

function attempt(startedAtMs = 1_000) {
  return startAutomationAttempt({
    runId: 'run_1',
    action: 'browser.click',
    surface: 'extension',
    deviceId: 'device_1',
    sessionKind: 'user-chrome',
    startedAtMs,
  });
}

describe('settling an attempt', () => {
  it('records a success only when its check passed', () => {
    const outcome = settleAutomationAttempt(
      attempt(),
      { claim: 'succeeded', verification: { check: 'the cart shows one item', passed: true } },
      1_500,
    );
    expect(outcome.status).toBe('succeeded');
    expect(outcome.verified).toBe(true);
    expect(outcome.durationMs).toBe(500);
    expect(outcome.reason).toContain('the cart shows one item');
  });

  it('downgrades a success claim whose check did not pass', () => {
    const outcome = settleAutomationAttempt(attempt(), {
      claim: 'succeeded',
      verification: { check: 'the cart shows one item', passed: false },
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.verified).toBe(false);
    expect(outcome.verification?.check).toBe('the cart shows one item');
    expect(outcome.reason).toContain('never checked');
  });

  it('keeps a refusal distinct from a failure and carries its reason', () => {
    const refused = settleAutomationAttempt(attempt(), {
      claim: 'refused',
      reason: 'The site is not approved for automation.',
    });
    expect(refused.status).toBe('refused');
    expect(refused.verified).toBe(false);
    expect(refused.reason).toContain('not approved');
  });

  it('marks an in-flight action as attempted', () => {
    const outcome = attemptedAutomationOutcome(attempt(), 1_200);
    expect(outcome.status).toBe('attempted');
    expect(isAutomationOutcomeStatus(outcome.status)).toBe(true);
    expect(outcome.durationMs).toBe(200);
  });

  it('never reports a negative duration when the clock moves backwards', () => {
    const outcome = settleAutomationAttempt(
      attempt(5_000),
      { claim: 'failed', reason: 'timeout' },
      1,
    );
    expect(outcome.durationMs).toBe(0);
  });
});

describe('success rate', () => {
  const settled = (status: 'succeeded' | 'failed' | 'refused'): AutomationOutcome =>
    status === 'succeeded'
      ? settleAutomationAttempt(attempt(), {
          claim: 'succeeded',
          verification: { check: 'checked', passed: true },
        })
      : settleAutomationAttempt(attempt(), { claim: status, reason: 'reason' });

  it('leaves refusals out of the denominator', () => {
    const outcomes = [settled('succeeded'), settled('failed'), settled('refused')];
    expect(automationOutcomeSuccessRate(outcomes)).toBe(0.5);
  });

  it('is zero when nothing has settled', () => {
    expect(automationOutcomeSuccessRate([])).toBe(0);
    expect(automationOutcomeSuccessRate([attemptedAutomationOutcome(attempt())])).toBe(0);
  });

  it('counts an unverified success claim against the rate', () => {
    const unverified = settleAutomationAttempt(attempt(), {
      claim: 'succeeded',
      verification: { check: 'checked', passed: false },
    });
    const summary = summarizeAutomationOutcomes([settled('succeeded'), unverified]);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.unverified).toBe(1);
    expect(summary.successRate).toBe(0.5);
  });
});
