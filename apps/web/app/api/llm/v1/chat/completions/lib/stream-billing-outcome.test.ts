import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveBilledOutcome } from './stream-transform';

describe('resolveBilledOutcome', () => {
  it('bills a cancelled stream that produced tokens', () => {
    expect(resolveBilledOutcome({ outcome: 'failed', cancelled: true, totalTokens: 1_200 })).toBe(
      'completed',
    );
  });

  it('still refunds a cancelled stream that produced nothing', () => {
    expect(resolveBilledOutcome({ outcome: 'failed', cancelled: true, totalTokens: 0 })).toBe(
      'failed',
    );
  });

  it('refunds a genuine provider failure even when tokens were counted', () => {
    expect(resolveBilledOutcome({ outcome: 'failed', totalTokens: 1_200 })).toBe('failed');
  });

  it('leaves a normal completion alone', () => {
    expect(resolveBilledOutcome({ outcome: 'completed', totalTokens: 1_200 })).toBe('completed');
    expect(resolveBilledOutcome({ totalTokens: 1_200 })).toBe('completed');
  });
});
