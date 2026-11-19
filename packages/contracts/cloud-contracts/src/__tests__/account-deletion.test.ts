import { describe, expect, it } from 'vitest';
import {
  AccountDeletionScheduleCancellationRequestSchema,
  AccountDeletionScheduleTimestampSchema,
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH,
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
  parseAccountDeletionStatus,
  parseAccountDeletionScheduleReceipt,
  parseAccountDeletionCancellationReceipt,
} from '../account-deletion';

describe('account deletion status', () => {
  it.each([
    { pending: false, canCancel: false, requestedAt: null, scheduledFor: null },
    {
      pending: true,
      canCancel: false,
      requestedAt: null,
      scheduledFor: '2020-01-02T12:00:00.000Z',
    },
    {
      pending: true,
      canCancel: true,
      requestedAt: '2020-01-03T12:00:00+01:00',
      scheduledFor: '2020-01-02T12:00:00-05:00',
    },
  ])('preserves server status without clock or timestamp-order rules: %j', (status) => {
    expect(parseAccountDeletionStatus({ ...status, futureField: true })).toEqual(status);
  });

  it.each(['', ' ', 'not-a-date', '2026-02-30T12:00:00.000Z', '2026-11-05', '2026-11-05T12:00:00'])(
    'rejects malformed timestamps: %s',
    (timestamp) => {
      const status = {
        pending: true,
        canCancel: true,
        requestedAt: null,
        scheduledFor: '2026-11-06T12:00:00.000Z',
      };
      expect(() => parseAccountDeletionStatus({ ...status, requestedAt: timestamp })).toThrow();
      expect(() => parseAccountDeletionStatus({ ...status, scheduledFor: timestamp })).toThrow();
    },
  );

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
    expect(parseAccountDeletionScheduleReceipt({ ...scheduleReceipt, futureField: true })).toEqual(
      scheduleReceipt,
    );
    expect(
      parseAccountDeletionScheduleReceipt({
        ...scheduleReceipt,
        scheduledFor: '2020-01-02T12:00:00+01:00',
      }),
    ).toMatchObject({ status: 'pending' });
  });

  it.each(
    [
      null,
      {},
      [],
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
    ].map((body) => ({ body })),
  )('rejects an unconfirmed scheduling receipt: $body', ({ body }) => {
    expect(() => parseAccountDeletionScheduleReceipt(body)).toThrow();
  });

  it.each([true, false])(
    'accepts cancellation/no-pending receipt with cancelled=%s',
    (cancelled) => {
      const receipt = {
        message: cancelled ? 'Account deletion cancelled.' : 'No account deletion is pending.',
        cancelled,
      };
      expect(parseAccountDeletionCancellationReceipt({ ...receipt, futureField: true })).toEqual(
        receipt,
      );
    },
  );

  it.each(
    [
      null,
      {},
      [],
      { message: 'Account deletion cancelled.' },
      { message: 'Account deletion cancelled.', cancelled: 'true' },
      { message: 'Account deletion cancelled.', cancelled: null },
      { message: ' ', cancelled: true },
      { cancelled: false },
      {
        message: 'No account deletion is pending.',
        cancelled: false,
        reason: 'grace_window_expired',
      },
      { message: 'Account deletion cancelled.', cancelled: true, error: 'Nothing was restored.' },
    ].map((body) => ({ body })),
  )('rejects an unconfirmed cancellation receipt: $body', ({ body }) => {
    expect(() => parseAccountDeletionCancellationReceipt(body)).toThrow();
  });

  it('carries the store that keeps billing and its https management page', () => {
    const storeBilling = {
      store: 'apple',
      manageUrl: 'https://apps.apple.com/account/subscriptions',
    };
    expect(parseAccountDeletionScheduleReceipt({ ...scheduleReceipt, storeBilling })).toEqual({
      ...scheduleReceipt,
      storeBilling,
    });
    for (const invalid of [
      { ...storeBilling, store: 'stripe' },
      { ...storeBilling, manageUrl: 'http://apps.apple.com/account/subscriptions' },
      { ...storeBilling, manageUrl: 'javascript:alert(1)' },
    ]) {
      expect(() =>
        parseAccountDeletionScheduleReceipt({ ...scheduleReceipt, storeBilling: invalid }),
      ).toThrow();
    }
  });

  it('carries what undoing the deletion did to a plan renewal', () => {
    const receipt = { message: 'Account deletion cancelled.', cancelled: true };
    for (const planRenewal of ['restored', 'not_restored'] as const) {
      expect(parseAccountDeletionCancellationReceipt({ ...receipt, planRenewal })).toEqual({
        ...receipt,
        planRenewal,
      });
    }
    expect(() =>
      parseAccountDeletionCancellationReceipt({ ...receipt, planRenewal: 'unknown' }),
    ).toThrow();
  });
});

describe('schedule-pair cancellation contract', () => {
  const expectedSchedule = { scheduledFor: '2026-11-08T00:00:00.123456Z', requestedAt: null };

  it('keeps legacy and required-precondition paths distinct', () => {
    expect(MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH).toBe('/api/user/delete-account/cancel');
    expect(MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH).toBe(
      '/api/user/delete-account/cancel-schedule',
    );
  });

  it.each([
    '0001-01-01T00:00:00Z',
    '9999-12-31T23:59:59.999999Z',
    '2000-02-29T12:00:00.1Z',
    '2024-02-29T12:00:00.123Z',
  ])('accepts supported finite calendar UTC values unchanged: %s', (value) => {
    expect(AccountDeletionScheduleTimestampSchema.parse(value)).toBe(value);
  });

  it.each([
    null,
    0,
    {},
    '',
    ' ',
    'infinity',
    '-infinity',
    '0000-01-01T00:00:00Z',
    '10000-01-01T00:00:00Z',
    '1900-02-29T00:00:00Z',
    '2026-02-30T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-00-01T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-01-00T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:60:00Z',
    '2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00.1234567Z',
    '2026-01-01T00:00:00+00:00',
    '2026-01-01T00:00:00',
    '2026-01-01',
    ' 2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z\n',
  ])('rejects unsupported timestamps: %j', (value) => {
    expect(AccountDeletionScheduleTimestampSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    undefined,
    null,
    [],
    '',
    {},
    { expectedSchedule: {} },
    { expectedSchedule: { scheduledFor: expectedSchedule.scheduledFor } },
    { expectedSchedule: { requestedAt: null } },
    { expectedSchedule: { ...expectedSchedule, extra: true } },
    { expectedSchedule, extra: true },
  ])('requires both strict objects: %j', (body) => {
    expect(AccountDeletionScheduleCancellationRequestSchema.safeParse(body).success).toBe(false);
  });

  it('retains marker only for compatible pending snapshot values', () => {
    const status = {
      pending: true,
      canCancel: true,
      ...expectedSchedule,
      cancellationPrecondition: 'schedule-pair-v1',
    };
    expect(parseAccountDeletionStatus(status)).toEqual(status);
    expect(() =>
      parseAccountDeletionStatus({ ...status, scheduledFor: '2026-11-08T00:00:00+00:00' }),
    ).toThrow();
    expect(() =>
      parseAccountDeletionStatus({
        ...status,
        pending: false,
        canCancel: false,
        scheduledFor: null,
      }),
    ).toThrow();
  });
});
