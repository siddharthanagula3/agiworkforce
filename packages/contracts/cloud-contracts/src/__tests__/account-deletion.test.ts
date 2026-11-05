import { describe, expect, it } from 'vitest';
import {
  parseAccountDeletionStatus,
  parseAccountDeletionScheduleReceipt,
  parseAccountDeletionCancellationReceipt,
} from '../account-deletion';

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

const scheduleReceipt = {
  message: 'Account deletion scheduled.',
  scheduledFor: '2020-01-02T12:00:00.000Z',
  status: 'pending',
  statusReason: 'Deletion is scheduled and has not started.',
};

describe('account deletion mutation receipts', () => {
  it('accepts a complete scheduling receipt even after its deadline', () => {
    expect(parseAccountDeletionScheduleReceipt(scheduleReceipt)).toEqual(scheduleReceipt);
    expect(parseAccountDeletionScheduleReceipt({ ...scheduleReceipt, futureField: true }))
      .toEqual(scheduleReceipt);
    expect(parseAccountDeletionScheduleReceipt({ ...scheduleReceipt, scheduledFor: '2020-01-02T12:00:00+01:00' }))
      .toMatchObject({ status: 'pending' });
  });

  it.each([
    null, {}, [],
    { ...scheduleReceipt, message: '  ' },
    { ...scheduleReceipt, scheduledFor: null },
    { ...scheduleReceipt, scheduledFor: '' },
    { ...scheduleReceipt, scheduledFor: 'not-a-date' },
    { ...scheduleReceipt, scheduledFor: '2026-02-30T12:00:00.000Z' },
    { ...scheduleReceipt, scheduledFor: undefined },
    { ...scheduleReceipt, status: undefined },
    { ...scheduleReceipt, status: 'complete' },
    { ...scheduleReceipt, status: 'blocked' },
    { ...scheduleReceipt, statusReason: ' ' },
    { ...scheduleReceipt, statusReason: undefined },
    { ...scheduleReceipt, error: 'Nothing was scheduled.' },
    { ...scheduleReceipt, reason: 'active_subscription' },
  ].map((body) => ({ body })))('rejects an unconfirmed scheduling receipt: $body', ({ body }) => {
    expect(() => parseAccountDeletionScheduleReceipt(body)).toThrow();
  });

  it.each([true, false])('accepts cancellation/no-pending receipt with cancelled=%s', (cancelled) => {
    const receipt = { message: cancelled ? 'Account deletion cancelled.' : 'No account deletion is pending.', cancelled };
    expect(parseAccountDeletionCancellationReceipt({ ...receipt, futureField: true })).toEqual(receipt);
  });

  it.each([
    null, {}, [],
    { message: 'Account deletion cancelled.' },
    { message: 'Account deletion cancelled.', cancelled: 'true' },
    { message: 'Account deletion cancelled.', cancelled: null },
    { message: ' ', cancelled: true },
    { cancelled: false },
    { message: 'No account deletion is pending.', cancelled: false, reason: 'grace_window_expired' },
    { message: 'Account deletion cancelled.', cancelled: true, error: 'Nothing was restored.' },
  ].map((body) => ({ body })))('rejects an unconfirmed cancellation receipt: $body', ({ body }) => {
    expect(() => parseAccountDeletionCancellationReceipt(body)).toThrow();
  });
});
