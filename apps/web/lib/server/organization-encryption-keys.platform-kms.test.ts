import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { createLocalCmekProvider } from '@/lib/crypto/cmek';
import {
  deriveTenantKeyRing,
  envKeyProvider,
  openEnvelope,
  sealEnvelope,
  type KeyRing,
} from '@/lib/crypto/envelope';

const ORG = '11111111-1111-4111-8111-111111111111';
const ROOT_ENV = 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY';
const ACTIVE_ROOT = 'cd'.repeat(32);
const RETIRED_ROOT = 'ef'.repeat(32);
const DESCRIPTOR = {
  provider: 'local' as const,
  keyUri: 'local://platform/root',
  region: 'us-east-1',
};

const db = {
  query: vi.fn(async () => []),
  execute: vi.fn(async () => 0),
} as unknown as DatabaseAdapter;

function plaintextRing(): KeyRing {
  const ring = envKeyProvider.resolveKeyRing(ROOT_ENV, {
    env: {
      [ROOT_ENV]: ACTIVE_ROOT,
      [`${ROOT_ENV}_ID`]: '2',
      [`${ROOT_ENV}_RETIRED`]: `1:${RETIRED_ROOT}`,
    },
  });
  return deriveTenantKeyRing({ active: ring.active, retired: ring.retired }, ORG);
}

async function sealRootUnderPlatformKms() {
  const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
  const { wrapped, plaintext } = await provider.generateDataKey(DESCRIPTOR);
  const unsealing: KeyRing = { active: { id: '1', material: plaintext }, retired: [] };
  const seal = (value: string) =>
    sealEnvelope(unsealing, value, 'b64-iv-ct-tag', 'agi:platform-secret');
  vi.stubEnv('AGI_PLATFORM_KEY_PROVIDER', 'local');
  vi.stubEnv('AGI_PLATFORM_KMS_KEY_URI', DESCRIPTOR.keyUri);
  vi.stubEnv('AGI_PLATFORM_KMS_REGION', DESCRIPTOR.region);
  vi.stubEnv('AGI_PLATFORM_DATA_KEY', wrapped);
  vi.stubEnv('AGI_PLATFORM_DATA_KEY_ID', '1');
  vi.stubEnv(ROOT_ENV, seal(ACTIVE_ROOT));
  vi.stubEnv(`${ROOT_ENV}_ID`, '2');
  vi.stubEnv(`${ROOT_ENV}_RETIRED`, `1:${seal(RETIRED_ROOT)}`);
  return provider;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a workspace without its own key, under a platform KMS', () => {
  it('derives the same tenant ring from the enveloped root as from the plaintext one', async () => {
    const provider = await sealRootUnderPlatformKms();
    const { preloadPlatformKeys } = await import('@/lib/crypto/platform-keys');
    await preloadPlatformKeys({ local: provider });
    const { organizationKeyRing, readOrganizationKeyStatus } =
      await import('./organization-encryption-keys');

    const expected = plaintextRing();
    const resolved = await organizationKeyRing(db, ORG, { registry: {} });

    expect(resolved.source).toBe('platform_derived');
    expect(resolved.ring.active).toEqual(expected.active);
    expect(resolved.ring.retired).toEqual(expected.retired);
    const writtenBeforeTheMove = sealEnvelope(expected, 'signing secret', 'b64-iv-ct-tag');
    expect(openEnvelope(resolved.ring, writtenBeforeTheMove, 'b64-iv-ct-tag').plaintext).toBe(
      'signing secret',
    );
    await expect(readOrganizationKeyStatus(db, ORG, { registry: {} })).resolves.toMatchObject({
      availability: { state: 'platform_derived', keyId: '2' },
    });
    expect(process.env[ROOT_ENV]).not.toContain(ACTIVE_ROOT);
  });

  it('refuses rather than falling back when the platform key has not been unsealed', async () => {
    await sealRootUnderPlatformKms();
    const { organizationKeyRing, readOrganizationKeyStatus } =
      await import('./organization-encryption-keys');

    await expect(organizationKeyRing(db, ORG, { registry: {} })).rejects.toThrow(
      /has not unsealed it/,
    );
    await expect(readOrganizationKeyStatus(db, ORG, { registry: {} })).resolves.toMatchObject({
      availability: { state: 'platform_unconfigured' },
    });
  });
});

type ImportedModule1 = typeof import('@/lib/logger');
type ImportedModule0 = typeof import('@/lib/security-audit');
