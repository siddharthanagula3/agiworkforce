import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/db-pool-tuning', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SERVICE_POOL_TUNING: {},
}));
vi.mock('@/lib/server/db-connection-error', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reportDatabaseConnectionError: vi.fn(),
}));
vi.mock('@/lib/services/org-entitlements', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveOrganizationEntitlementPlan: vi.fn(async () => 'enterprise'),
}));

const key = vi.hoisted(() => ({ lastRotatedAt: null as string | null }));

/**
 * A reachable customer-managed key needs a KMS client, which no unit run has.
 * Only the status this service reads is replaced; everything else in the module
 * stays as it ships.
 */
vi.mock('@/lib/server/organization-encryption-keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/organization-encryption-keys')>()),
  readOrganizationKeyStatus: vi.fn(async () => ({
    availability: {
      state: 'customer_managed' as const,
      descriptor: {
        provider: 'aws_kms' as const,
        keyUri: 'arn:aws:kms:us-east-1:1:key/abc',
        region: 'us-east-1',
      },
      keyVersion: '3',
    },
    status: 'active' as const,
    lastRotatedAt: key.lastRotatedAt,
    revokedAt: null,
  })),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  KEY_ROTATION_ATTENTION_DAYS,
  readWorkspacePosture,
  type PostureSignal,
} from '../workspace-posture-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const DAY_MS = 24 * 60 * 60 * 1000;

function db(): DatabaseAdapter {
  return {
    query: vi.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from public.organizations')) {
        if (text.includes('data_region')) {
          return [
            { data_region: null, data_region_requested: null, data_region_requested_at: null },
          ];
        }
        return [{ name: 'Acme', licensed_seats: 25, seats_consumed: 4 }];
      }
      if (text.includes('from public.organization_members')) return [{ role: 'owner', count: 2 }];
      if (text.includes('count(*)')) return [{ count: 0 }];
      return [];
    }),
    execute: vi.fn(),
  } as unknown as DatabaseAdapter;
}

async function encryptionKeySignal(rotatedDaysAgo: number | null): Promise<PostureSignal> {
  key.lastRotatedAt =
    rotatedDaysAgo === null ? null : new Date(Date.now() - rotatedDaysAgo * DAY_MS).toISOString();
  const posture = await readWorkspacePosture(db(), ORG);
  const found = posture.groups
    .flatMap((group) => group.signals)
    .find((signal) => signal.id === 'encryption-key');
  if (!found) throw new Error('no encryption-key signal');
  return found;
}

describe('a workspace key that nobody has rotated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for attention once the rotation window has passed', async () => {
    const signal = await encryptionKeySignal(KEY_ROTATION_ATTENTION_DAYS + 1);

    expect(signal.state).toBe('attention');
    expect(signal.value).toMatch(/rotation overdue/);
    expect(signal.detail).toMatch(/past the/);
  });

  it('does not flag a key rotated inside the window', async () => {
    const signal = await encryptionKeySignal(KEY_ROTATION_ATTENTION_DAYS - 1);

    expect(signal.state).toBe('ok');
    expect(signal.value).not.toMatch(/overdue/);
  });

  it('treats a key that was never rotated as unmeasured rather than as fresh', async () => {
    const signal = await encryptionKeySignal(null);

    expect(signal.state).toBe('attention');
    expect(signal.detail).toMatch(/never been rotated/);
  });
});
