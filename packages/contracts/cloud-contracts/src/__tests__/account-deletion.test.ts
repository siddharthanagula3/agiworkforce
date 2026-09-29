import { describe, expect, it } from 'vitest';
import { parseAccountDeletionStatus } from '../account-deletion';

describe('account deletion status', () => {
  it('accepts a pending cancellation window', () => {
    expect(
      parseAccountDeletionStatus({
        pending: true,
        canCancel: true,
        requestedAt: '2026-09-27T18:00:00.000Z',
        scheduledFor: '2026-09-28T18:00:00.000Z',
      }),
    ).toMatchObject({ pending: true, canCancel: true });
  });

  it('rejects a response that could hide a scheduled deletion', () => {
    expect(() =>
      parseAccountDeletionStatus({
        pending: false,
        canCancel: false,
        requestedAt: null,
        scheduledFor: '2026-09-28T18:00:00.000Z',
      }),
    ).toThrow();
    expect(() => parseAccountDeletionStatus({})).toThrow();
  });
});
