import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('../request-context-cache');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  openErasureTombstone: vi.fn(),
  advanceErasureTombstone: vi.fn(),
  closeErasureTombstone: vi.fn(),
  eraseUserAccountData: vi.fn(),
  eraseProfileRow: vi.fn(),
  deleteUser: vi.fn(),
  invalidateAccountStatusCache: vi.fn(),
  cancelLiveStripeSubscriptionsNow: vi.fn(),
  readStripeBillingOwner: vi.fn(),
  calls: [] as string[],
  identityRows: [] as Array<{ subject: string }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('../identity', () => ({
  getIdentityProvider: () => ({
    name: 'clerk',
    deleteUser: (...args: unknown[]) => mocks.deleteUser(...args),
  }),
}));
vi.mock('../request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  invalidateAccountStatusCache: (...args: unknown[]) => mocks.invalidateAccountStatusCache(...args),
}));
vi.mock('../payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  cancelLiveStripeSubscriptionsNow: (...args: unknown[]) => {
    mocks.calls.push('stripe');
    return mocks.cancelLiveStripeSubscriptionsNow(...args);
  },
}));
vi.mock('../account-erasure', () => ({
  openErasureTombstone: (...args: unknown[]) => {
    mocks.calls.push('open');
    return mocks.openErasureTombstone(...args);
  },
  advanceErasureTombstone: (...args: unknown[]) => {
    mocks.calls.push('advance');
    return mocks.advanceErasureTombstone(...args);
  },
  closeErasureTombstone: (...args: unknown[]) => {
    mocks.calls.push('close');
    return mocks.closeErasureTombstone(...args);
  },
  eraseUserAccountData: (...args: unknown[]) => {
    mocks.calls.push('erase');
    return mocks.eraseUserAccountData(...args);
  },
  eraseProfileRow: (...args: unknown[]) => {
    mocks.calls.push('profile');
    return mocks.eraseProfileRow(...args);
  },
  readStripeBillingOwner: (...args: unknown[]) => mocks.readStripeBillingOwner(...args),
}));

import { eraseScheduledAccount, reEraseTombstonedAccount } from '../scheduled-account-erasure';

function completeReport() {
  return { complete: true, tables: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.identityRows = [];
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('from public.identities')) return mocks.identityRows;
    return sql.includes('deletion_scheduled_for is not null')
      ? [{ due: true }]
      : [{ id: 'user-1' }];
  });
  mocks.openErasureTombstone.mockResolvedValue({ recorded: true });
  mocks.advanceErasureTombstone.mockResolvedValue({ recorded: true });
  mocks.closeErasureTombstone.mockResolvedValue({ recorded: true });
  mocks.eraseUserAccountData.mockResolvedValue(completeReport());
  mocks.eraseProfileRow.mockResolvedValue(undefined);
  mocks.deleteUser.mockResolvedValue(undefined);
  mocks.cancelLiveStripeSubscriptionsNow.mockResolvedValue([]);
  mocks.readStripeBillingOwner.mockResolvedValue({
    subscriptionReference: null,
    customerReference: null,
  });
});

function withStripeBilling() {
  mocks.readStripeBillingOwner.mockResolvedValue({
    subscriptionReference: 'sub_live1',
    customerReference: 'cus_live1',
  });
}

describe('scheduled erasure ends Stripe billing first', () => {
  it('cancels the live Stripe subscription before any row is touched', async () => {
    withStripeBilling();
    mocks.cancelLiveStripeSubscriptionsNow.mockResolvedValue(['sub_live1']);

    await expect(eraseScheduledAccount('user-1')).resolves.toEqual({
      status: 'purged',
      resurrected: false,
    });
    expect(mocks.cancelLiveStripeSubscriptionsNow).toHaveBeenCalledWith({
      subscriptionReference: 'sub_live1',
      customerReference: 'cus_live1',
    });
    expect(mocks.calls[0]).toBe('stripe');
  });

  it('erases nothing and keeps the billing linkage when Stripe cannot cancel', async () => {
    withStripeBilling();
    mocks.cancelLiveStripeSubscriptionsNow.mockRejectedValue(new Error('stripe unavailable'));

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'billing',
    });
    expect(mocks.calls).toEqual(['stripe']);
    expect(mocks.openErasureTombstone).not.toHaveBeenCalled();
    expect(mocks.eraseUserAccountData).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('skips Stripe for an account that never had a Stripe customer', async () => {
    await eraseScheduledAccount('user-1');

    expect(mocks.cancelLiveStripeSubscriptionsNow).not.toHaveBeenCalled();
  });
});

describe('eraseScheduledAccount', () => {
  it('tombstones before erasing, settles the tombstone, then deletes the identity and profile', async () => {
    await expect(eraseScheduledAccount('user-1')).resolves.toEqual({
      status: 'purged',
      resurrected: false,
    });

    expect(mocks.calls).toEqual(['open', 'erase', 'close', 'profile']);
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('drops the cached account status as soon as the tombstone is open, before anything is erased', async () => {
    await eraseScheduledAccount('user-1');

    expect(mocks.invalidateAccountStatusCache).toHaveBeenCalledWith('user-1');
    const invalidated = mocks.invalidateAccountStatusCache.mock.invocationCallOrder[0] ?? 0;
    const opened = mocks.openErasureTombstone.mock.invocationCallOrder[0] ?? 0;
    const erased = mocks.eraseUserAccountData.mock.invocationCallOrder[0] ?? 0;
    expect(invalidated).toBeGreaterThan(opened);
    expect(invalidated).toBeLessThan(erased);
  });

  it('does nothing for an account whose deletion was cancelled after the job was queued', async () => {
    mocks.query.mockResolvedValue([{ due: false }]);

    await expect(eraseScheduledAccount('user-1')).resolves.toEqual({ status: 'not_due' });
    expect(mocks.calls).toEqual([]);
  });

  it('erases NOTHING when the tombstone cannot be written', async () => {
    mocks.openErasureTombstone.mockResolvedValue({
      recorded: false,
      error: 'tombstone write failed',
    });

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'tombstone',
    });
    expect(mocks.calls).toEqual(['open']);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('names the tables that refused when the erasure is incomplete', async () => {
    mocks.eraseUserAccountData.mockResolvedValue({
      complete: false,
      tables: { web_conversations: { deleted: false, error: 'deadlock' } },
    });

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'erasure',
      detail: expect.stringContaining('web_conversations (deadlock)'),
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('names an anonymization failure instead of the deliberately retained profile', async () => {
    mocks.eraseUserAccountData.mockResolvedValue({
      complete: false,
      tables: { profiles: { deleted: false, retainedForRetry: true } },
      anonymized: {
        organization_usage_ledger: { updated: false, error: 'constraint rejected update' },
      },
      mediaObjectsFailed: 0,
      backupObjectsFailed: 0,
      knowledgeObjectsFailed: 0,
      exportObjectsDeleted: 0,
      exportObjectsFailed: 0,
      avatarObjectsFailed: 0,
      feedbackObjectsDeleted: 0,
      feedbackObjectsFailed: 0,
      cacheKeysFailed: 0,
    });

    const result = await eraseScheduledAccount('user-1');
    expect(result).toMatchObject({
      status: 'failed',
      stage: 'erasure',
      detail: expect.stringContaining('organization_usage_ledger (constraint rejected update)'),
    });
    expect(result).not.toMatchObject({ detail: expect.stringContaining('profiles') });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it('deletes the mapped provider subject instead of the account id', async () => {
    mocks.identityRows = [{ subject: 'user_clerk_mapped' }];

    await expect(eraseScheduledAccount('user-1')).resolves.toEqual({
      status: 'purged',
      resurrected: false,
    });

    const [lookupSql, lookupParams] = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('from public.identities'),
    )!;
    expect(String(lookupSql)).toContain('user_id = $1');
    expect(lookupParams).toEqual(['user-1', 'clerk']);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledWith('user_clerk_mapped');
    expect(mocks.eraseProfileRow).toHaveBeenCalledWith('user-1');
  });

  it('keeps the profile when the mapped subject is not deleted, so the mapping survives for the retry', async () => {
    mocks.identityRows = [{ subject: 'user_clerk_mapped' }];
    mocks.deleteUser.mockRejectedValue(new Error('clerk is down'));

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'identity',
    });
    expect(mocks.deleteUser).not.toHaveBeenCalledWith('user-1');
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();
  });

  it('deletes every mapped subject and stops at the first one the provider refuses', async () => {
    mocks.identityRows = [{ subject: 'user_a' }, { subject: 'user_b' }];
    mocks.deleteUser.mockRejectedValueOnce(new Error('clerk is down'));

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'identity',
    });
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledWith('user_a');
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();
  });

  it('keeps the profile when the mapping cannot be read', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.identities')) throw new Error('database unavailable');
      return sql.includes('deletion_scheduled_for is not null')
        ? [{ due: true }]
        : [{ id: 'user-1' }];
    });

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'identity',
      detail: 'database unavailable',
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();
  });

  it('keeps the profile row when the identity provider will not delete the account', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('clerk is down'));

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'identity',
    });
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign(new Error('User missing'), { status: 404 }),
    { status: 404, message: 'User missing' },
  ])('accepts a numeric missing-user response: %s', async (error) => {
    mocks.deleteUser.mockRejectedValue(error);

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({ status: 'purged' });
    expect(mocks.eraseProfileRow).toHaveBeenCalledWith('user-1');
  });

  it.each([
    new Error('Provider configuration not found'),
    new Error('Request failed with status 404'),
    Object.assign(new Error('Request 404 timed out'), { status: 503 }),
    Object.assign(new Error('Credential not found'), { status: 401 }),
    Object.assign(new Error('User missing'), { status: '404' }),
    Object.assign(new Error('User missing'), { statusCode: 404 }),
    'Request failed with status 404',
    null,
    undefined,
  ])('keeps ambiguous provider deletion failures unresolved: %s', async (error) => {
    mocks.deleteUser.mockRejectedValue(error);

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'identity',
      detail: error instanceof Error ? error.message : String(error),
    });
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();
  });

  it('retries provider deletion while the profile remains due after an ambiguous failure', async () => {
    let profilePresent = true;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.identities')) return [];
      return sql.includes('deletion_scheduled_for is not null')
        ? [{ due: profilePresent }]
        : profilePresent
          ? [{ id: 'user-1' }]
          : [];
    });
    mocks.eraseProfileRow.mockImplementation(async () => {
      profilePresent = false;
    });
    mocks.deleteUser.mockRejectedValueOnce(new Error('Provider configuration not found'));

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'identity',
    });
    expect(profilePresent).toBe(true);
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();

    await expect(eraseScheduledAccount('user-1')).resolves.toEqual({
      status: 'purged',
      resurrected: false,
    });
    expect(mocks.deleteUser).toHaveBeenCalledTimes(2);
    expect(mocks.eraseProfileRow).toHaveBeenCalledTimes(1);
    expect(profilePresent).toBe(false);
    await expect(eraseScheduledAccount('user-1')).resolves.toEqual({ status: 'not_due' });
    expect(mocks.deleteUser).toHaveBeenCalledTimes(2);
  });
});

describe('reEraseTombstonedAccount', () => {
  it('retains a resurrected profile when a provider failure merely mentions not found', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('Provider configuration not found'));

    await expect(reEraseTombstonedAccount('ghost-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'identity',
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith('ghost-1');
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();
  });

  it('re-erases a resurrected account and removes its identity and profile', async () => {
    await expect(reEraseTombstonedAccount('ghost-1')).resolves.toEqual({
      status: 'purged',
      resurrected: true,
    });

    expect(mocks.calls).toEqual(['open', 'erase', 'close', 'profile']);
    expect(mocks.deleteUser).toHaveBeenCalledWith('ghost-1');
  });

  it('re-erases returned rows without touching the identity when no profile came back', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(reEraseTombstonedAccount('ghost-1')).resolves.toEqual({
      status: 'purged',
      resurrected: false,
    });

    expect(mocks.calls).toEqual(['advance', 'erase', 'close']);
    expect(mocks.eraseUserAccountData).toHaveBeenCalledWith('ghost-1', {
      retainProfile: true,
      scope: 'tombstone',
    });
    expect(mocks.openErasureTombstone).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();
  });

  it('erases nothing for a profile-less subject that no tombstone records', async () => {
    mocks.query.mockResolvedValue([]);
    mocks.advanceErasureTombstone.mockResolvedValue({
      recorded: false,
      error: 'No erasure tombstone records this subject',
    });

    await expect(reEraseTombstonedAccount('stranger-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'tombstone',
    });
    expect(mocks.calls).toEqual(['advance']);
    expect(mocks.openErasureTombstone).not.toHaveBeenCalled();
  });
});

type ImportedModule0 = typeof import('../payments/stripe-provider');
