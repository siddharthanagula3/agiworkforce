import { beforeEach, describe, expect, it, vi } from 'vitest';

type ObjectBackupModule = typeof import('../object-backup');
type IdentityModule = typeof import('../identity');
type RequestContextCacheModule = typeof import('../request-context-cache');
type StripeProviderModule = typeof import('../payments/stripe-provider');

interface TombstoneRow {
  erasedAt: Date | null;
  sweeps: number;
}

const world = vi.hoisted(() => ({
  profiles: new Set<string>(),
  tombstones: new Map<string, TombstoneRow>(),
  residual: new Map<string, number>(),
  held: false,
  profileAppearsAtFence: false,
  deletedRows: 0,
  statements: [] as string[],
  deleteUser: vi.fn(async (_subject: string) => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim();
}

async function fakeQuery(sql: string, params: unknown[] = []): Promise<unknown[]> {
  const statement = normalize(sql);
  const subject = String(params[0]);
  world.statements.push(statement);
  if (statement.includes('public.legal_holds')) return [{ held: world.held }];
  if (statement.startsWith('select id from public.profiles where id = $1')) {
    return world.profiles.has(subject) ? [{ id: subject }] : [];
  }
  if (statement.includes('from public.erasure_tombstones as tombstone')) {
    if (world.profileAppearsAtFence) world.profiles.add(subject);
    return world.tombstones.has(subject) && !world.profiles.has(subject) ? [{ id: subject }] : [];
  }
  if (statement.startsWith('update public.erasure_tombstones set last_swept_at = now()')) {
    const tombstone = world.tombstones.get(subject);
    if (!tombstone) return [];
    tombstone.sweeps += 1;
    return [{ user_id: subject }];
  }
  if (statement.startsWith('update public.profiles set deletion_requested_at')) {
    return world.profiles.has(subject) ? [{ id: subject }] : [];
  }
  if (statement.includes('as video_blocking')) {
    return [{ video_blocking: false, image_blocking: false }];
  }
  return [];
}

async function fakeExecute(sql: string, params: unknown[] = []): Promise<number> {
  const statement = normalize(sql);
  const subject = String(params[0]);
  world.statements.push(statement);
  const deleted = /^delete from public\.(\w+) where/u.exec(statement);
  if (deleted) {
    const table = deleted[1]!;
    if (table === 'profiles') world.profiles.delete(subject);
    const count = world.residual.get(table) ?? 0;
    world.residual.delete(table);
    world.deletedRows += count;
    return count;
  }
  if (statement.startsWith('insert into public.erasure_tombstones')) {
    const existing = world.tombstones.get(subject);
    if (existing) existing.sweeps += 1;
    else world.tombstones.set(subject, { erasedAt: null, sweeps: 1 });
    return 1;
  }
  if (statement.startsWith('update public.erasure_tombstones set erased_at = now()')) {
    const tombstone = world.tombstones.get(subject);
    if (tombstone && tombstone.erasedAt === null) {
      tombstone.erasedAt = new Date();
      return 1;
    }
    return 0;
  }
  return 0;
}

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: fakeQuery,
    execute: fakeExecute,
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ query: fakeQuery, execute: fakeExecute }),
  }),
}));
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: vi.fn(async () => ({ deleted: 0, failedPathnames: [] })),
  extForMime: vi.fn(),
  streamStoredMedia: vi.fn(),
}));
vi.mock('@/lib/server/object-storage', () => ({
  copyPrivateObjectIfUnchanged: vi.fn(),
  createObjectCleanupPlan: vi.fn(),
  createPrivateObjectWriter: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
  deletePrivateObject: vi.fn(async () => undefined),
  isObjectStorageConfigured: () => true,
  isPrivateObjectStorageConfigured: () => true,
  objectKeyFromPublicUrl: () => null,
  objectKeyFromStorageUri: (value: string) => value,
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  getObject: vi.fn(),
  getObjectStream: vi.fn(),
  getPrivateObject: vi.fn(),
  getPrivateObjectStream: vi.fn(),
  putPrivateObject: vi.fn(),
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: vi.fn(async () => undefined),
  isProjectKnowledgeObjectStorageConfigured: () => true,
  getProjectKnowledgeObject: vi.fn(),
}));
vi.mock('@/lib/e2b/session-store', () => ({
  deleteE2BSessionsForUser: vi.fn(async () => ({ deleted: 0, failed: 0, reachable: true })),
}));
vi.mock('@/lib/connectors/oauth-access', () => ({
  revokeAllConnectorTokensAtProviders: vi.fn(async () => ({ attempted: 0, revoked: 0 })),
}));
vi.mock('@/lib/server/object-backup', async (importOriginal) => ({
  ...(await importOriginal<ObjectBackupModule>()),
  resolveObjectBackupTarget: () => null,
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<IdentityModule>()),
  getIdentityProvider: () => ({ name: 'clerk', deleteUser: world.deleteUser }),
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<RequestContextCacheModule>()),
  invalidateAccountStatusCache: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/payments/stripe-provider', async (importOriginal) => ({
  ...(await importOriginal<StripeProviderModule>()),
  cancelLiveStripeSubscriptionsNow: vi.fn(async () => []),
}));

import { eraseUserAccountData } from '../account-erasure';
import { reEraseTombstonedAccount } from '../scheduled-account-erasure';

const SUBJECT = 'erased-subject-1';

function dataWrites(): string[] {
  return world.statements.filter(
    (sql) =>
      /^(delete from|update|insert into) public\./u.test(sql) &&
      !sql.startsWith('update public.erasure_tombstones set last_swept_at'),
  );
}

function tombstone(): TombstoneRow | undefined {
  return world.tombstones.get(SUBJECT);
}

beforeEach(() => {
  world.profiles.clear();
  world.tombstones.clear();
  world.residual.clear();
  world.held = false;
  world.profileAppearsAtFence = false;
  world.deletedRows = 0;
  world.statements.length = 0;
  world.deleteUser.mockClear();
  world.tombstones.set(SUBJECT, { erasedAt: null, sweeps: 0 });
  world.residual.set('web_conversations', 3);
  world.residual.set('user_settings', 1);
  world.residual.set('usage_events', 2);
});

describe('resweep of a tombstoned subject whose profile is gone', () => {
  it('erases the residual rows, settles the tombstone and leaves the identity provider alone', async () => {
    await expect(reEraseTombstonedAccount(SUBJECT)).resolves.toEqual({
      status: 'purged',
      resurrected: false,
    });

    expect(world.residual.size).toBe(0);
    expect(world.deletedRows).toBe(6);
    expect(tombstone()?.sweeps).toBe(1);
    expect(tombstone()?.erasedAt).toBeInstanceOf(Date);
    expect(world.profiles.has(SUBJECT)).toBe(false);
    expect(world.deleteUser).not.toHaveBeenCalled();
    expect(world.statements.some((sql) => sql.startsWith('update public.profiles'))).toBe(false);
    expect(
      world.statements.some((sql) => sql.startsWith('insert into public.erasure_tombstones')),
    ).toBe(false);
  });

  it('erases nothing while a legal hold covers the subject', async () => {
    world.held = true;

    await expect(reEraseTombstonedAccount(SUBJECT)).resolves.toMatchObject({
      status: 'failed',
      stage: 'erasure',
      detail: expect.stringContaining('legal_holds'),
    });

    expect(world.deletedRows).toBe(0);
    expect(world.residual.get('web_conversations')).toBe(3);
    expect(dataWrites()).toEqual([]);
    expect(tombstone()?.erasedAt).toBeNull();
  });

  it('erases nothing when a profile is re-created under the same identifier before the fence', async () => {
    world.profileAppearsAtFence = true;

    await expect(reEraseTombstonedAccount(SUBJECT)).resolves.toMatchObject({
      status: 'failed',
      stage: 'erasure',
      detail: expect.stringContaining('erasure_tombstones'),
    });

    expect(world.profiles.has(SUBJECT)).toBe(true);
    expect(world.deletedRows).toBe(0);
    expect(world.residual.size).toBe(3);
    expect(dataWrites()).toEqual([]);
    expect(tombstone()?.erasedAt).toBeNull();
    expect(world.deleteUser).not.toHaveBeenCalled();
  });

  it('refuses the tombstone scope outright while a profile row exists', async () => {
    world.profiles.add(SUBJECT);

    const report = await eraseUserAccountData(SUBJECT, { retainProfile: true, scope: 'tombstone' });

    expect(report.complete).toBe(false);
    expect(report.tables['erasure_tombstones']?.error).toContain('profile row exists');
    expect(world.deletedRows).toBe(0);
    expect(dataWrites()).toEqual([]);
  });

  it('runs again without error and deletes nothing more', async () => {
    await expect(reEraseTombstonedAccount(SUBJECT)).resolves.toMatchObject({ status: 'purged' });
    const settledAt = tombstone()?.erasedAt;
    expect(world.deletedRows).toBe(6);

    await expect(reEraseTombstonedAccount(SUBJECT)).resolves.toEqual({
      status: 'purged',
      resurrected: false,
    });

    expect(world.deletedRows).toBe(6);
    expect(tombstone()?.sweeps).toBe(2);
    expect(tombstone()?.erasedAt).toBe(settledAt);
  });

  it('erases nothing and records no tombstone for a subject that was never erased', async () => {
    world.tombstones.clear();

    await expect(reEraseTombstonedAccount(SUBJECT)).resolves.toMatchObject({
      status: 'failed',
      stage: 'tombstone',
    });

    expect(world.tombstones.size).toBe(0);
    expect(world.deletedRows).toBe(0);
    expect(dataWrites()).toEqual([]);
  });
});
