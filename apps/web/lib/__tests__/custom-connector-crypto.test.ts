import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONNECTOR_SECRET_PURPOSES } from '@/lib/crypto/connector-secret-reseal';
import { loadKeyRing, openEnvelope, sealEnvelope } from '@/lib/crypto/envelope';

const KEY_ENV = 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY';
const KEY_ONE = '11'.repeat(32);
const KEY_TWO = '22'.repeat(32);
const ENVIRONMENTS = ['development', 'production'] as const;

beforeEach(() => {
  vi.stubEnv('AGI_KEY_PROVIDER', 'env');
  vi.stubEnv(KEY_ENV, KEY_ONE);
  vi.stubEnv(`${KEY_ENV}_ID`, '1');
  vi.stubEnv(`${KEY_ENV}_RETIRED`, '');
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each(ENVIRONMENTS)('configured connector storage in %s', (environment) => {
  it.each([undefined, '', 'not-a-key', 'z'.repeat(64), '11'.repeat(31), '11'.repeat(33)])(
    'refuses missing or malformed key %j without creating process-local storage',
    async (key) => {
      vi.stubEnv('NODE_ENV', environment);
      vi.stubEnv(KEY_ENV, key);
      const api = await import('../custom-connector-crypto');

      expect(api.isConnectorTokenStorageAvailable()).toBe(false);
      expect(() => api.encryptConnectorToken('fixture-access', 'oauth-access-token')).toThrow(
        KEY_ENV,
      );
      expect(() => api.decryptConnectorToken('stored-ciphertext', 'oauth-access-token')).toThrow(
        KEY_ENV,
      );
    },
  );

  it('opens configured ciphertext after a fresh module instance loads', async () => {
    vi.stubEnv('NODE_ENV', environment);
    const writer = await import('../custom-connector-crypto');
    const sealed = writer.encryptConnectorToken('fixture-access', 'oauth-access-token');
    vi.resetModules();
    const reader = await import('../custom-connector-crypto');

    expect(reader).not.toBe(writer);
    expect(reader.isConnectorTokenStorageAvailable()).toBe(true);
    expect(reader.decryptConnectorToken(sealed, 'oauth-access-token')).toBe('fixture-access');
  });

  it.each([
    ['CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ID', 'invalid id'],
    ['CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_RETIRED', 'missing-material'],
    ['CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_RETIRED', `1:${KEY_TWO}`],
  ])('refuses an unusable configured ring (%s)', async (name, value) => {
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv(name, value);
    const api = await import('../custom-connector-crypto');
    expect(api.isConnectorTokenStorageAvailable()).toBe(false);
    expect(() => api.encryptConnectorToken('fixture-access', 'oauth-access-token')).toThrow();
  });
});

it('reflects configured storage availability without retaining an imported fallback', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv(KEY_ENV, undefined);
  const api = await import('../custom-connector-crypto');
  expect(api.isConnectorTokenStorageAvailable()).toBe(false);

  vi.stubEnv(KEY_ENV, KEY_ONE);
  expect(api.isConnectorTokenStorageAvailable()).toBe(true);
  const sealed = api.encryptConnectorToken('fixture-access', 'oauth-access-token');
  vi.stubEnv(KEY_ENV, undefined);
  expect(api.isConnectorTokenStorageAvailable()).toBe(false);
  expect(() => api.decryptConnectorToken(sealed, 'oauth-access-token')).toThrow(KEY_ENV);
});

it('keeps every connector secret purpose isolated after a module reload', async () => {
  const writer = await import('../custom-connector-crypto');
  const values = CONNECTOR_SECRET_PURPOSES.map((purpose) => ({
    purpose,
    sealed: writer.encryptConnectorToken(`fixture-${purpose}`, purpose),
  }));
  vi.resetModules();
  const reader = await import('../custom-connector-crypto');

  for (const { purpose, sealed } of values) {
    expect(reader.decryptConnectorToken(sealed, purpose)).toBe(`fixture-${purpose}`);
    for (const different of CONNECTOR_SECRET_PURPOSES.filter((value) => value !== purpose)) {
      expect(() => reader.decryptConnectorToken(sealed, different)).toThrow();
    }
  }
});

it('preserves retired-key reads and active-key writes across reloads', async () => {
  vi.stubEnv(`${KEY_ENV}_ID`, 'old');
  const writer = await import('../custom-connector-crypto');
  const legacy = writer.encryptConnectorToken('fixture-old', 'oauth-access-token');
  const versioned = sealEnvelope(
    loadKeyRing(KEY_ENV),
    'fixture-old',
    'versioned',
    'oauth-access-token',
  );

  vi.stubEnv(KEY_ENV, KEY_TWO);
  vi.stubEnv(`${KEY_ENV}_ID`, 'current');
  vi.stubEnv(`${KEY_ENV}_RETIRED`, `old:${KEY_ONE}`);
  vi.resetModules();
  const rotated = await import('../custom-connector-crypto');
  for (const sealed of [legacy, versioned]) {
    expect(rotated.decryptConnectorToken(sealed, 'oauth-access-token')).toBe('fixture-old');
  }
  const fresh = rotated.encryptConnectorToken('fixture-fresh', 'oauth-refresh-token');
  expect(
    openEnvelope(loadKeyRing(KEY_ENV), fresh, 'hex-triple', {
      value: 'oauth-refresh-token',
      acceptUnbound: false,
    }),
  ).toMatchObject({ plaintext: 'fixture-fresh', keyId: 'current', contextBound: true });

  vi.stubEnv(`${KEY_ENV}_RETIRED`, '');
  vi.resetModules();
  const retired = await import('../custom-connector-crypto');
  for (const sealed of [legacy, versioned]) {
    expect(() => retired.decryptConnectorToken(sealed, 'oauth-access-token')).toThrow();
  }
  expect(retired.decryptConnectorToken(fresh, 'oauth-refresh-token')).toBe('fixture-fresh');
});
