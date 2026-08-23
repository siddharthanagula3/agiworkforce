import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ENVELOPE_VERSION,
  envelopeKeyId,
  loadKeyRing,
  openEnvelope,
  sealEnvelope,
  type KeyRing,
} from './envelope';

const githubDb = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => githubDb }));

const KEY_ONE = '11'.repeat(32);
const KEY_TWO = '22'.repeat(32);
const KEY_THREE = '33'.repeat(32);

function ring(env: Record<string, string>): KeyRing {
  return loadKeyRing('TEST_KEY', { env });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('key ring', () => {
  it('labels an untouched deployment as key 1 so 0104 needs no backfill', () => {
    const loaded = ring({ TEST_KEY: KEY_ONE });
    expect(loaded.active.id).toBe('1');
    expect(loaded.retired).toEqual([]);
  });

  it('rejects a ring that declares one id twice', () => {
    expect(() =>
      ring({ TEST_KEY: KEY_ONE, TEST_KEY_ID: '2', TEST_KEY_RETIRED: `2:${KEY_TWO}` }),
    ).toThrow(/declares id "2" twice/);
  });

  it('rejects key material that would silently truncate through Buffer.from', () => {
    expect(() => ring({ TEST_KEY: 'z'.repeat(64) })).toThrow(/64 hex characters/);
  });

  it('reads a utf8 ring so TOTP_ENCRYPTION_KEY can be rotated at all', () => {
    const loaded = loadKeyRing('TEST_KEY', {
      encoding: 'utf8',
      env: { TEST_KEY: 'a'.repeat(40) },
    });
    expect(loaded.active.material).toHaveLength(32);
  });
});

describe('versioned envelope', () => {
  it('embeds the active key id and round-trips', () => {
    const loaded = ring({ TEST_KEY: KEY_ONE, TEST_KEY_ID: 'k7' });
    const sealed = sealEnvelope(loaded, 'super-secret');

    expect(sealed.startsWith(`${ENVELOPE_VERSION}.k7.`)).toBe(true);
    expect(envelopeKeyId(sealed)).toBe('k7');
    expect(openEnvelope(loaded, sealed, 'hex-triple').plaintext).toBe('super-secret');
  });

  it('resolves the key by the embedded id, not by the active key', () => {
    const oldRing = ring({ TEST_KEY: KEY_ONE, TEST_KEY_ID: 'k1' });
    const sealed = sealEnvelope(oldRing, 'grant-token');

    const rotated = ring({
      TEST_KEY: KEY_TWO,
      TEST_KEY_ID: 'k2',
      TEST_KEY_RETIRED: `k1:${KEY_ONE}`,
    });
    const opened = openEnvelope(rotated, sealed, 'hex-triple');
    expect(opened.plaintext).toBe('grant-token');
    expect(opened.keyId).toBe('k1');
  });

  it('names the missing key instead of failing as corrupt ciphertext', () => {
    const oldRing = ring({ TEST_KEY: KEY_ONE, TEST_KEY_ID: 'k1' });
    const sealed = sealEnvelope(oldRing, 'grant-token');
    const withoutK1 = ring({ TEST_KEY: KEY_TWO, TEST_KEY_ID: 'k2' });

    expect(() => openEnvelope(withoutK1, sealed, 'hex-triple')).toThrow(
      /names key "k1" but the ring holds only \[k2\]/,
    );
  });

  it('follows the embedded id even when another ring key would work', () => {
    const loaded = ring({
      TEST_KEY: KEY_ONE,
      TEST_KEY_ID: 'k1',
      TEST_KEY_RETIRED: `k2:${KEY_TWO}`,
    });
    const sealed = sealEnvelope(loaded, 'grant-token');
    const mislabelled = sealed.replace(`${ENVELOPE_VERSION}.k1.`, `${ENVELOPE_VERSION}.k2.`);

    expect(() => openEnvelope(loaded, mislabelled, 'hex-triple')).toThrow();
  });
});

describe('legacy layouts', () => {
  it('trial-decrypts an unversioned value across the ring', () => {
    const oldRing = ring({ TEST_KEY: KEY_ONE, TEST_KEY_ID: 'k1' });
    const sealed = sealEnvelope(oldRing, 'bearer-token', 'hex-triple');
    expect(envelopeKeyId(sealed)).toBeNull();

    const rotated = ring({
      TEST_KEY: KEY_TWO,
      TEST_KEY_ID: 'k2',
      TEST_KEY_RETIRED: `k1:${KEY_ONE}`,
    });
    const opened = openEnvelope(rotated, sealed, 'hex-triple');
    expect(opened.plaintext).toBe('bearer-token');
    expect(opened.keyId).toBe('k1');
  });

  it('reports the ring it tried when no key opens the value', () => {
    const oldRing = ring({ TEST_KEY: KEY_ONE, TEST_KEY_ID: 'k1' });
    const sealed = sealEnvelope(oldRing, 'bearer-token', 'hex-triple');
    const unrelated = ring({ TEST_KEY: KEY_THREE, TEST_KEY_ID: 'k9' });

    expect(() => openEnvelope(unrelated, sealed, 'hex-triple')).toThrow(
      /could not be opened by any ring key \[k9\]/,
    );
  });

  it('interoperates with lib/custom-connector-crypto (hex-triple)', async () => {
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', KEY_ONE);
    vi.resetModules();
    const { encryptConnectorToken, decryptConnectorToken } =
      await import('../custom-connector-crypto');
    const loaded = ring({ TEST_KEY: KEY_ONE });

    const sealed = encryptConnectorToken('mcp-bearer', 'custom-connector-auth-header');
    expect(
      openEnvelope(loaded, sealed, 'hex-triple', 'custom-connector-auth-header').plaintext,
    ).toBe('mcp-bearer');
    expect(
      decryptConnectorToken(
        sealEnvelope(loaded, 'mcp-bearer', 'hex-triple'),
        'custom-connector-auth-header',
      ),
    ).toBe('mcp-bearer');
  });

  it('refuses to open a secret under a different purpose than it was sealed for', () => {
    const loaded = ring({ TEST_KEY: KEY_ONE });
    const sealed = sealEnvelope(loaded, 'refresh-me', 'versioned', 'oauth-refresh-token');

    expect(openEnvelope(loaded, sealed, 'hex-triple', 'oauth-refresh-token')).toMatchObject({
      plaintext: 'refresh-me',
      contextBound: true,
    });
    expect(() => openEnvelope(loaded, sealed, 'hex-triple', 'oauth-access-token')).toThrow();
    expect(() => openEnvelope(loaded, sealed, 'hex-triple')).toThrow();
  });

  it('still opens a pre-context ciphertext and says so, so callers can re-seal it', () => {
    const loaded = ring({ TEST_KEY: KEY_ONE });
    const legacy = sealEnvelope(loaded, 'old-token', 'hex-triple');

    expect(openEnvelope(loaded, legacy, 'hex-triple', 'oauth-access-token')).toMatchObject({
      plaintext: 'old-token',
      contextBound: false,
    });
  });

  it('interoperates with lib/device-token-crypto (b64-iv-ct-tag)', async () => {
    vi.stubEnv('DEVICE_TOKEN_ENCRYPTION_KEY', KEY_ONE);
    vi.resetModules();
    const { encryptToken, decryptToken } = await import('../device-token-crypto');
    const loaded = ring({ TEST_KEY: KEY_ONE });

    expect(openEnvelope(loaded, encryptToken('device-session'), 'b64-iv-ct-tag').plaintext).toBe(
      'device-session',
    );
    expect(decryptToken(sealEnvelope(loaded, 'device-session', 'b64-iv-ct-tag'))).toBe(
      'device-session',
    );
  });

  it('interoperates with the WebCrypto TOTP layout (utf8 key, tag appended)', async () => {
    const passphrase = 'totp-passphrase-that-is-long-enough-x';
    const material = new TextEncoder().encode(passphrase.slice(0, 32));
    const key = await crypto.subtle.importKey(
      'raw',
      material as unknown as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode('JBSWY3DPEHPK3PXP'),
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    const loaded = loadKeyRing('TEST_KEY', { encoding: 'utf8', env: { TEST_KEY: passphrase } });
    const opened = openEnvelope(loaded, Buffer.from(combined).toString('base64'), 'b64-iv-ct-tag');
    expect(opened.plaintext).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('production readers survive a rotation', () => {
  it('decryptConnectorToken opens a value sealed under the retired key', async () => {
    const stored = sealEnvelope(ring({ TEST_KEY: KEY_ONE }), 'mcp-bearer', 'hex-triple');

    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', KEY_TWO);
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ID', 'k2');
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_RETIRED', `k1:${KEY_ONE}`);
    vi.resetModules();

    const { decryptConnectorToken, encryptConnectorToken } =
      await import('../custom-connector-crypto');
    expect(decryptConnectorToken(stored, 'custom-connector-auth-header')).toBe('mcp-bearer');
    expect(
      envelopeKeyId(encryptConnectorToken('fresh', 'custom-connector-auth-header')),
    ).toBeNull();
    expect(
      openEnvelope(
        ring({ TEST_KEY: KEY_TWO }),
        encryptConnectorToken('fresh', 'custom-connector-auth-header'),
        'hex-triple',
        'custom-connector-auth-header',
      ).plaintext,
    ).toBe('fresh');
  });

  it('decryptConnectorToken fails loudly, naming the ring, when the retired key was dropped', async () => {
    const stored = sealEnvelope(ring({ TEST_KEY: KEY_ONE }), 'mcp-bearer', 'hex-triple');

    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', KEY_TWO);
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ID', 'k2');
    vi.resetModules();

    const { decryptConnectorToken } = await import('../custom-connector-crypto');
    expect(() => decryptConnectorToken(stored, 'custom-connector-auth-header')).toThrow(
      /could not be opened by any ring key \[k2\]/,
    );
  });

  it('decryptConnectorToken resolves a versioned envelope by its embedded key id', async () => {
    const sweptRing = ring({ TEST_KEY: KEY_ONE, TEST_KEY_ID: 'k1' });
    const swept = sealEnvelope(sweptRing, 'mcp-bearer', 'versioned');
    expect(envelopeKeyId(swept)).toBe('k1');

    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', KEY_TWO);
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ID', 'k2');
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_RETIRED', `k1:${KEY_ONE}`);
    vi.resetModules();

    const { decryptConnectorToken } = await import('../custom-connector-crypto');
    expect(decryptConnectorToken(swept, 'custom-connector-auth-header')).toBe('mcp-bearer');
  });

  async function stubGitHubApp(extra: Record<string, string>) {
    for (const [name, value] of Object.entries({
      GITHUB_APP_ID: '12345',
      GITHUB_APP_PRIVATE_KEY_BASE64: 'unused-for-the-cached-token-branch',
      GITHUB_APP_SLUG: 'agiworkforce',
      GITHUB_APP_CLIENT_ID: 'client-id',
      GITHUB_APP_CLIENT_SECRET: 'client-secret',
      ...extra,
    })) {
      vi.stubEnv(name, value);
    }
    vi.resetModules();
    return import('../github-app');
  }

  function cachedInstallationRow(accessTokenEnc: string) {
    githubDb.query.mockReset();
    githubDb.query.mockResolvedValue([
      {
        access_token_enc: accessTokenEnc,
        access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        ownership_verified_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
  }

  it('getInstallationAccessToken returns a cached token sealed under the retired key', async () => {
    const stored = sealEnvelope(ring({ TEST_KEY: KEY_ONE }), 'ghs_cached_token', 'hex-triple');
    cachedInstallationRow(stored);

    const { getInstallationAccessToken } = await stubGitHubApp({
      GITHUB_TOKEN_ENCRYPTION_KEY: KEY_TWO,
      GITHUB_TOKEN_ENCRYPTION_KEY_ID: 'k2',
      GITHUB_TOKEN_ENCRYPTION_KEY_RETIRED: `k1:${KEY_ONE}`,
    });

    await expect(getInstallationAccessToken(4242)).resolves.toBe('ghs_cached_token');
  });

  it('getInstallationAccessToken surfaces the missing key rather than corrupt ciphertext', async () => {
    const stored = sealEnvelope(ring({ TEST_KEY: KEY_ONE }), 'ghs_cached_token', 'hex-triple');
    cachedInstallationRow(stored);

    const { getInstallationAccessToken } = await stubGitHubApp({
      GITHUB_TOKEN_ENCRYPTION_KEY: KEY_TWO,
      GITHUB_TOKEN_ENCRYPTION_KEY_ID: 'k2',
    });

    await expect(getInstallationAccessToken(4242)).rejects.toThrow(
      /could not be opened by any ring key \[k2\]/,
    );
  });
});

describe('scripts/reencrypt.mjs', () => {
  type Row = Record<string, string | null>;

  function fakeClient(rows: Row[], idColumn: string) {
    const writes: string[] = [];
    const matches = (row: Row, clause: string, params: unknown[]) =>
      clause
        .split(' and ')
        .map((predicate) => predicate.trim())
        .filter(Boolean)
        .every((predicate) => {
          const notEqual = /^(\w+) <> \$(\d+)$/.exec(predicate);
          if (notEqual) return row[notEqual[1] as string] !== params[Number(notEqual[2]) - 1];
          const after = /^(\w+) > \$(\d+)$/.exec(predicate);
          if (after) {
            return (row[after[1] as string] as string) > (params[Number(after[2]) - 1] as string);
          }
          throw new Error(`fakeClient cannot evaluate predicate: ${predicate}`);
        });

    return {
      writes,
      async query(sql: string, params: unknown[]) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (/^select/i.test(normalized)) {
          const clause = /where (.*) order by/.exec(normalized)?.[1] ?? '';
          const limit = params[1] as number;
          return rows
            .filter((row) => matches(row, clause, params))
            .sort((a, b) => (a[idColumn] as string).localeCompare(b[idColumn] as string))
            .slice(0, limit)
            .map((row) => ({ ...row }));
        }
        writes.push(normalized);
        const row = rows.find((candidate) => candidate[idColumn] === params[0]);
        const assigned = /set (.*) where/.exec(normalized)?.[1] ?? '';
        assigned.split(', ').forEach((assignment, index) => {
          const column = assignment.split(' = ')[0] as string;
          if (row) row[column] = params[index + 1] as string;
        });
        return [];
      },
    };
  }

  async function loadScript() {
    return import('../../../../scripts/reencrypt.mjs');
  }

  async function connectorTargetEntry() {
    const { REENCRYPT_TARGETS } = await loadScript();
    return REENCRYPT_TARGETS['custom-connectors'];
  }

  const oldRing = ring({ TEST_KEY: KEY_ONE, TEST_KEY_ID: 'k1' });
  const rotatedRing = ring({
    TEST_KEY: KEY_TWO,
    TEST_KEY_ID: 'k2',
    TEST_KEY_RETIRED: `k1:${KEY_ONE}`,
  });
  const newKeyOnly = ring({ TEST_KEY: KEY_TWO, TEST_KEY_ID: 'k2' });

  function connectorRows(): Row[] {
    return [
      {
        id: 'a',
        auth_header_key_version: 'k1',
        auth_header_enc: sealEnvelope(oldRing, 'token-a', 'hex-triple'),
      },
      {
        id: 'b',
        auth_header_key_version: 'k1',
        auth_header_enc: sealEnvelope(oldRing, 'token-b', 'hex-triple'),
      },
      { id: 'c', auth_header_key_version: 'k1', auth_header_enc: null },
    ];
  }

  it('moves every row onto the active key and is a no-op on the second run', async () => {
    const { reencryptTarget } = await loadScript();
    const connectorTarget = await connectorTargetEntry();
    const rows = connectorRows();
    const client = fakeClient(rows, 'id');

    const first = await reencryptTarget({
      target: connectorTarget,
      ring: rotatedRing,
      client,
      apply: true,
      batchSize: 2,
    });
    expect(first).toMatchObject({ scanned: 3, rewritten: 2, stamped: 1 });
    expect(rows.every((row) => row['auth_header_key_version'] === 'k2')).toBe(true);

    expect(
      openEnvelope(newKeyOnly, rows[0]?.['auth_header_enc'] as string, 'hex-triple').plaintext,
    ).toBe('token-a');

    const writesAfterFirst = client.writes.length;
    const second = await reencryptTarget({
      target: connectorTarget,
      ring: rotatedRing,
      client,
      apply: true,
      batchSize: 2,
    });
    expect(second).toMatchObject({ scanned: 0, rewritten: 0, stamped: 0 });
    expect(client.writes).toHaveLength(writesAfterFirst);
  });

  it('writes nothing without --apply', async () => {
    const { reencryptTarget } = await loadScript();
    const connectorTarget = await connectorTargetEntry();
    const rows = connectorRows();
    const client = fakeClient(rows, 'id');

    const outcome = await reencryptTarget({ target: connectorTarget, ring: rotatedRing, client });

    expect(outcome).toMatchObject({ scanned: 3, rewritten: 2 });
    expect(client.writes).toHaveLength(0);
    expect(rows.every((row) => row['auth_header_key_version'] === 'k1')).toBe(true);
  });

  it('emits the versioned layout on request', async () => {
    const { reencryptTarget } = await loadScript();
    const connectorTarget = await connectorTargetEntry();
    const rows = connectorRows();
    const client = fakeClient(rows, 'id');

    await reencryptTarget({
      target: connectorTarget,
      ring: rotatedRing,
      client,
      apply: true,
      format: 'versioned',
    });

    expect(envelopeKeyId(rows[0]?.['auth_header_enc'] as string)).toBe('k2');

    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', KEY_TWO);
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ID', 'k2');
    vi.resetModules();
    const { decryptConnectorToken } = await import('../custom-connector-crypto');
    expect(
      decryptConnectorToken(rows[0]?.['auth_header_enc'] as string, 'custom-connector-auth-header'),
    ).toBe('token-a');
  });

  it('refuses --format=versioned for a column whose reader cannot parse it', async () => {
    const { assertFormatSupported, REENCRYPT_TARGETS } = await loadScript();

    expect(() => assertFormatSupported(['two-factor'], 'versioned')).toThrow(
      /two-factor .* cannot take --format=versioned/,
    );
    expect(() => assertFormatSupported(Object.keys(REENCRYPT_TARGETS), 'versioned')).toThrow(
      /two-factor/,
    );
    expect(() => assertFormatSupported(Object.keys(REENCRYPT_TARGETS), 'preserve')).not.toThrow();
    expect(() =>
      assertFormatSupported(
        ['connector-grants', 'custom-connectors', 'github-installations'],
        'versioned',
      ),
    ).not.toThrow();
  });

  it('only claims a reader is ready where the module is actually imported', async () => {
    const { REENCRYPT_TARGETS } = await loadScript();
    const targets = REENCRYPT_TARGETS as Record<string, { versionedReaderReady: boolean }>;
    const readers: Record<string, string> = {
      'connector-grants': 'lib/custom-connector-crypto.ts',
      'custom-connectors': 'lib/custom-connector-crypto.ts',
      'github-installations': 'lib/github-app.ts',
    };

    for (const [name, file] of Object.entries(readers)) {
      expect(targets[name]?.versionedReaderReady).toBe(true);
      expect(readFileSync(join(process.cwd(), file), 'utf8')).toContain(
        "from '@/lib/crypto/envelope'",
      );
    }
    expect(targets['two-factor']?.versionedReaderReady).toBe(false);
    expect(
      readFileSync(join(process.cwd(), 'features/settings/services/user-preferences.ts'), 'utf8'),
    ).not.toContain('lib/crypto/envelope');
  });

  it('stamps a row production wrote under the active key without re-sealing it', async () => {
    const { reencryptTarget } = await loadScript();
    const connectorTarget = await connectorTargetEntry();
    const alreadyCurrent = sealEnvelope(rotatedRing, 'token-new', 'hex-triple');
    const rows: Row[] = [
      { id: 'a', auth_header_key_version: 'k1', auth_header_enc: alreadyCurrent },
    ];
    const client = fakeClient(rows, 'id');

    const outcome = await reencryptTarget({
      target: connectorTarget,
      ring: rotatedRing,
      client,
      apply: true,
    });

    expect(outcome).toMatchObject({ scanned: 1, rewritten: 0, stamped: 1 });
    expect(rows[0]?.['auth_header_enc']).toBe(alreadyCurrent);
    expect(rows[0]?.['auth_header_key_version']).toBe('k2');
  });

  it('leaves a pre-encryption plaintext TOTP secret unstamped', async () => {
    const { reencryptTarget, REENCRYPT_TARGETS } = await loadScript();
    const target = REENCRYPT_TARGETS['two-factor'];
    const utf8Ring = loadKeyRing('TEST_KEY', {
      encoding: 'utf8',
      env: { TEST_KEY: 'a'.repeat(40), TEST_KEY_ID: 'k2' },
    });
    const rows: Row[] = [
      { user_id: 'u1', totp_secret_key_version: 'k1', totp_secret_enc: 'JBSWY3DPEHPK3PXP' },
    ];
    const client = fakeClient(rows, 'user_id');

    const outcome = await reencryptTarget({ target, ring: utf8Ring, client, apply: true });

    expect(outcome).toMatchObject({ scanned: 1, plaintext: 1, rewritten: 0, stamped: 0 });
    expect(rows[0]?.['totp_secret_key_version']).toBe('k1');
    expect(client.writes).toHaveLength(0);
  });

  it('covers every durable secret column in migration 0104', async () => {
    const { REENCRYPT_TARGETS } = await loadScript();
    const migration = readFileSync(join(process.cwd(), 'db/neon/0104_key_version.sql'), 'utf8');

    for (const target of Object.values(REENCRYPT_TARGETS) as Array<{
      table: string;
      keyVersionColumn: string;
    }>) {
      expect(migration).toContain(`alter table ${target.table}`);
      expect(migration).toContain(target.keyVersionColumn);
    }
  });
});

describe('migration 0104_key_version', () => {
  const sql = readFileSync(join(process.cwd(), 'db/neon/0104_key_version.sql'), 'utf8');

  it.each([
    ['public.github_installations', 'access_token_key_version'],
    ['public.user_custom_connectors', 'auth_header_key_version'],
    ['public.connector_oauth_grants', 'token_key_version'],
    ['public.user_two_factor', 'totp_secret_key_version'],
  ])('gives %s a %s column', (table, column) => {
    expect(sql).toContain(`alter table ${table}\n  add column if not exists ${column}`);
  });

  it("defaults every column to '1' so existing rows need no backfill", () => {
    const defaults = sql.match(/text not null default '1'/g) ?? [];
    expect(defaults).toHaveLength(4);
    expect(loadKeyRing('TEST_KEY', { env: { TEST_KEY: KEY_ONE } }).active.id).toBe('1');
  });

  it('constrains ids to the shape the envelope can encode', () => {
    const checks = sql.match(/check \([a-z_]+ ~ '\^\[A-Za-z0-9_-\]\{1,32\}\$'\)/g) ?? [];
    expect(checks).toHaveLength(4);
  });
});
