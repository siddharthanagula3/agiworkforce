import { beforeEach, describe, expect, it, vi } from 'vitest';

type FlagStoreModule = typeof import('../flag-store');
type SecurityAuditModule = typeof import('@/lib/security-audit');

const store = vi.hoisted(() => ({
  ensureFlagDefinition: vi.fn(),
  getFlagDefinition: vi.fn(),
  upsertFlagOverride: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../flag-store', async (importOriginal) => ({
  ...(await importOriginal<FlagStoreModule>()),
  ensureFlagDefinition: store.ensureFlagDefinition,
  getFlagDefinition: store.getFlagDefinition,
  upsertFlagOverride: store.upsertFlagOverride,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));

import { setFlagOverride } from '../flag-admin-service';
import type { FlagDefinition } from '../flag-definition';
import {
  STORE_TEST_PURCHASES_FLAG_KEY,
  storeTestPurchasesDefinition,
} from '../store-test-purchases';

const OPERATOR = {
  userId: 'operator-1',
  request: new Request('https://agiworkforce.com/api/admin/feature-flags'),
};
const ALLOW = {
  subject: 'user' as const,
  subjectId: 'review-account',
  variant: 'on',
  expiresAt: null,
};

function stored(): FlagDefinition {
  return {
    ...storeTestPurchasesDefinition(),
    version: 1,
    archivedAt: null,
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('allowing an account to receive store test purchases', () => {
  it('creates the flag, off for everyone, when nobody has defined it', async () => {
    store.ensureFlagDefinition.mockResolvedValue(stored());

    await setFlagOverride(OPERATOR, STORE_TEST_PURCHASES_FLAG_KEY, ALLOW);

    expect(store.ensureFlagDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        key: STORE_TEST_PURCHASES_FLAG_KEY,
        defaultVariant: 'off',
        rules: [],
      }),
    );
    expect(store.upsertFlagOverride).toHaveBeenCalledWith(STORE_TEST_PURCHASES_FLAG_KEY, ALLOW);
  });

  it('names nobody when the flag could not be prepared', async () => {
    store.ensureFlagDefinition.mockResolvedValue(null);

    await expect(
      setFlagOverride(OPERATOR, STORE_TEST_PURCHASES_FLAG_KEY, ALLOW),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(store.upsertFlagOverride).not.toHaveBeenCalled();
  });

  it('creates no definition for any other flag an operator names', async () => {
    store.getFlagDefinition.mockResolvedValue(null);

    await expect(setFlagOverride(OPERATOR, 'rollout.unknown', ALLOW)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(store.ensureFlagDefinition).not.toHaveBeenCalled();
    expect(store.upsertFlagOverride).not.toHaveBeenCalled();
  });
});
