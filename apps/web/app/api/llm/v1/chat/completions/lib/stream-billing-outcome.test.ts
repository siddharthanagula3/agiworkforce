import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveBilledOutcome } from './stream-transform';

/**
 * Guards the free-inference hole closed on 2026-08-08.
 *
 * A client abort settled as `failed`, and `finalizeManagedUsageRequest` forces
 * `actualCostCents` to 0 on failure, so "ask for something long, press Stop at
 * 95%" cost nothing while the provider had already billed us for every token.
 * It was unbounded: a zero settle records no cost, so neither the monthly
 * allowance nor the rolling 5h/weekly caps could see it.
 */
describe('resolveBilledOutcome', () => {
  it('bills a cancelled stream that produced tokens', () => {
    expect(resolveBilledOutcome({ outcome: 'failed', cancelled: true, totalTokens: 1_200 })).toBe(
      'completed',
    );
  });

  it('still refunds a cancelled stream that produced nothing', () => {
    // No tokens generated means nothing was bought from the provider, so the
    // full refund is correct — this is the case the zeroing rule exists for.
    expect(resolveBilledOutcome({ outcome: 'failed', cancelled: true, totalTokens: 0 })).toBe(
      'failed',
    );
  });

  it('refunds a genuine provider failure even when tokens were counted', () => {
    // route.ts refunds provider errors via refundFailedReservation without the
    // cancelled flag; a failure is only ever billed when the client abandoned it.
    expect(resolveBilledOutcome({ outcome: 'failed', totalTokens: 1_200 })).toBe('failed');
  });

  it('leaves a normal completion alone', () => {
    expect(resolveBilledOutcome({ outcome: 'completed', totalTokens: 1_200 })).toBe('completed');
    expect(resolveBilledOutcome({ totalTokens: 1_200 })).toBe('completed');
  });
});
