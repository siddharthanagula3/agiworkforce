import { beforeEach, describe, expect, it, vi } from 'vitest';

type FlagStoreModule = typeof import('../flag-store');
type SecurityAuditModule = typeof import('@/lib/security-audit');

const store = vi.hoisted(() => ({
  archiveStaleFlagDefinition: vi.fn(),
  upsertFlagOverride: vi.fn(),
  getFlagDefinition: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../flag-store', async (importOriginal) => ({
  ...(await importOriginal<FlagStoreModule>()),
  archiveStaleFlagDefinition: store.archiveStaleFlagDefinition,
  upsertFlagOverride: store.upsertFlagOverride,
  getFlagDefinition: store.getFlagDefinition,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));

import { cleanUpStaleFlags, setFlagOverride } from '../flag-admin-service';
import type { FlagDefinition } from '../flag-definition';
import { killSwitchDefinition } from '../kill-switches';

const NOW = Date.parse('2026-11-08T12:00:00.000Z');
const DAY_MS = 86_400_000;
const OPERATOR = {
  userId: 'operator-1',
  request: new Request('https://agiworkforce.com/api/admin/feature-flags/stale'),
};

function stored(key: string, patch: Partial<FlagDefinition> = {}): FlagDefinition {
  return {
    ...killSwitchDefinition(key, `switch for ${key}`),
    version: 7,
    archivedAt: null,
    createdAt: new Date(NOW - 300 * DAY_MS).toISOString(),
    updatedAt: new Date(NOW - 200 * DAY_MS).toISOString(),
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cleaning up stale flags', () => {
  it('archives against the version it read and keeps overrides that still restrict someone', async () => {
    const dictation = stored('capability.dictation');
    store.archiveStaleFlagDefinition.mockResolvedValue({ ...dictation, archivedAt: 'now' });

    const result = await cleanUpStaleFlags(OPERATOR, [dictation], NOW);

    expect(store.archiveStaleFlagDefinition).toHaveBeenCalledWith('capability.dictation', {
      expectedVersion: 7,
      keepRestrictedSubjects: true,
    });
    expect(result.archived.map((flag) => flag.key)).toEqual(['capability.dictation']);
  });

  it('reports a flag as retained when it changed after the decision was made', async () => {
    const dictation = stored('capability.dictation');
    store.archiveStaleFlagDefinition.mockResolvedValue(null);

    const result = await cleanUpStaleFlags(OPERATOR, [dictation], NOW);

    expect(result.archived).toEqual([]);
    expect(result.retained.map((flag) => flag.key)).toEqual(['capability.dictation']);
  });

  it('does not hold an expired flag back for overrides its expiry already switched off', async () => {
    const expired = stored('capability.work', {
      expiresAt: new Date(NOW - DAY_MS).toISOString(),
      updatedAt: new Date(NOW - DAY_MS).toISOString(),
    });
    store.archiveStaleFlagDefinition.mockResolvedValue({ ...expired, archivedAt: 'now' });

    await cleanUpStaleFlags(OPERATOR, [expired], NOW);

    expect(store.archiveStaleFlagDefinition).toHaveBeenCalledWith('capability.work', {
      expectedVersion: 7,
      keepRestrictedSubjects: false,
    });
  });
});

describe('setting an override while the flag is being archived', () => {
  it('reports the flag as gone when the archive won the race', async () => {
    store.getFlagDefinition.mockResolvedValue(stored('capability.dictation'));
    store.upsertFlagOverride.mockResolvedValue(false);

    await expect(
      setFlagOverride(OPERATOR, 'capability.dictation', {
        subject: 'user',
        subjectId: 'user-1',
        variant: 'off',
        expiresAt: null,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
