import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  openErasureTombstone: vi.fn(),
  closeErasureTombstone: vi.fn(),
  eraseUserAccountData: vi.fn(),
  eraseProfileRow: vi.fn(),
  deleteUser: vi.fn(),
  calls: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('../identity', () => ({
  getIdentityProvider: () => ({ deleteUser: (...args: unknown[]) => mocks.deleteUser(...args) }),
}));
vi.mock('../account-erasure', () => ({
  openErasureTombstone: (...args: unknown[]) => {
    mocks.calls.push('open');
    return mocks.openErasureTombstone(...args);
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
}));

import { eraseScheduledAccount, reEraseTombstonedAccount } from '../scheduled-account-erasure';

function completeReport() {
  return { complete: true, tables: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes('deletion_scheduled_for is not null') ? [{ due: true }] : [{ id: 'user-1' }],
  );
  mocks.openErasureTombstone.mockResolvedValue({ recorded: true });
  mocks.closeErasureTombstone.mockResolvedValue({ recorded: true });
  mocks.eraseUserAccountData.mockResolvedValue(completeReport());
  mocks.eraseProfileRow.mockResolvedValue(undefined);
  mocks.deleteUser.mockResolvedValue(undefined);
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

  it('keeps the profile row when the identity provider will not delete the account', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('clerk is down'));

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({
      status: 'failed',
      stage: 'identity',
    });
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();
  });

  it('treats an identity that is already gone as deleted', async () => {
    mocks.deleteUser.mockRejectedValue(new Error('Request failed with status 404'));

    await expect(eraseScheduledAccount('user-1')).resolves.toMatchObject({ status: 'purged' });
    expect(mocks.eraseProfileRow).toHaveBeenCalledWith('user-1');
  });
});

describe('reEraseTombstonedAccount', () => {
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

    expect(mocks.calls).toEqual(['open', 'erase', 'close']);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.eraseProfileRow).not.toHaveBeenCalled();
  });
});
