import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  deleteStoredMediaObjects: vi.fn(),
  deleteObject: vi.fn(),
  deleteE2BSessionsForUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        query: (...args: unknown[]) => mocks.query(...args),
        execute: (...args: unknown[]) => mocks.execute(...args),
      }),
  })),
}));
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: (...args: unknown[]) => mocks.deleteStoredMediaObjects(...args),
}));
vi.mock('@/lib/server/object-storage', () => ({
  deleteObject: (...args: unknown[]) => mocks.deleteObject(...args),
  isObjectStorageConfigured: () => true,
  objectKeyFromPublicUrl: () => null,
  objectKeyFromStorageUri: (value: string) => value,
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  deletePrivateObject: vi.fn(),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  getObject: vi.fn(),
  getObjectStream: vi.fn(),
  getPrivateObject: vi.fn(),
  getPrivateObjectStream: vi.fn(),
  isPrivateObjectStorageConfigured: vi.fn(() => true),
  putPrivateObject: vi.fn(),
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: (...args: unknown[]) => mocks.deleteObject(...args),
  isProjectKnowledgeObjectStorageConfigured: () => true,
}));
vi.mock('@/lib/e2b/session-store', () => ({
  deleteE2BSessionsForUser: (...args: unknown[]) => mocks.deleteE2BSessionsForUser(...args),
}));

process.env['JWT_SECRET'] = 'test-developer-jwt-secret-at-least-32-bytes';

import { USER_SCOPED_TABLES, eraseUserAccountData } from '../account-erasure';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([]);
  mocks.execute.mockResolvedValue(1);
  mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 0, failed: 0 });
  mocks.deleteE2BSessionsForUser.mockResolvedValue({ deleted: 0, failed: 0 });
});

// Applying to the beta does not require an account, so most beta_applications
// rows carry a null user_id and the applicant's email IS the identity. Erasure
// keyed only on user_id would leave their name and email in the intake table.
describe('beta applications are erased with the account', () => {
  it('is a classified user-scoped table, not an unaccounted-for one', () => {
    expect(USER_SCOPED_TABLES.map((entry) => entry.table)).toContain('beta_applications');
  });

  it('sweeps the intake table by the account email, not only by user_id', async () => {
    await eraseUserAccountData('user-1');

    const statements = mocks.execute.mock.calls.map(([sql]) => String(sql));
    const emailSweep = statements.find(
      (sql) => sql.includes('beta_applications') && sql.includes('lower(email)'),
    );

    expect(emailSweep).toBeDefined();
    expect(emailSweep).toContain('from public.profiles where id = $1');
    expect(
      statements.some((sql) => sql.includes('beta_applications') && sql.includes('user_id = $1')),
    ).toBe(true);
  });
});
