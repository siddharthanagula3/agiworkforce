import { createCipheriv, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { openEnvelope, type KeyRing } from './envelope';
import {
  REENCRYPT_TARGETS,
  assertFormatSupported,
  reencryptTarget,
} from '../../../../scripts/reencrypt.mjs';

const OLD_KEY = 'b4d2f1a09c8e7d6b5a4938271605f4e3d2c1b0a998877665544332211ffee0011';
const NEW_KEY = '00'.repeat(40);

function legacyWebCryptoCiphertext(key: string, plaintext: string): string {
  const material = Buffer.from(key.slice(0, 32), 'utf8');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', material, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64');
}

function ring(): KeyRing {
  return {
    active: { id: '2', material: Buffer.from(NEW_KEY.slice(0, 32), 'utf8') },
    retired: [{ id: '1', material: Buffer.from(OLD_KEY.slice(0, 32), 'utf8') }],
  };
}

function fakeClient(rows: Record<string, unknown>[]) {
  let selectCount = 0;
  const updates: { sql: string; params: unknown[] }[] = [];
  return {
    updates,
    async query(sql: string, params: unknown[]) {
      if (sql.trim().toLowerCase().startsWith('select')) {
        selectCount += 1;
        return selectCount === 1 ? rows : [];
      }
      updates.push({ sql, params });
      return [];
    },
  };
}

describe('scripts/reencrypt.mjs two-factor target', () => {
  it('accepts --format=versioned now that the reader understands sealEnvelope/openEnvelope', () => {
    expect(() => assertFormatSupported(['two-factor'], 'versioned')).not.toThrow();
  });

  it('rotates a totp_secret_enc row sealed under a retired key to the active key', async () => {
    const sealedUnderOldKey = legacyWebCryptoCiphertext(OLD_KEY, 'JBSWY3DPEHPK3PXP');
    const client = fakeClient([
      { user_id: 'user_1', totp_secret_key_version: '1', totp_secret_enc: sealedUnderOldKey },
    ]);

    const outcome = await reencryptTarget({
      target: REENCRYPT_TARGETS['two-factor'],
      ring: ring(),
      client,
      apply: true,
      format: 'preserve',
    });

    expect(outcome.rewritten).toBe(1);
    expect(client.updates).toHaveLength(1);
    const sealedValue = (client.updates[0]!.params as string[])[1]!;
    const opened = openEnvelope(ring(), sealedValue, 'b64-iv-ct-tag');
    expect(opened.plaintext).toBe('JBSWY3DPEHPK3PXP');
    expect(opened.keyId).toBe('2');
  });

  it('moves a rotated row to the versioned layout under --format=versioned', async () => {
    const sealedUnderOldKey = legacyWebCryptoCiphertext(OLD_KEY, 'JBSWY3DPEHPK3PXP');
    const client = fakeClient([
      { user_id: 'user_1', totp_secret_key_version: '1', totp_secret_enc: sealedUnderOldKey },
    ]);

    await reencryptTarget({
      target: REENCRYPT_TARGETS['two-factor'],
      ring: ring(),
      client,
      apply: true,
      format: 'versioned',
    });

    const sealedValue = (client.updates[0]!.params as string[])[1]!;
    expect(sealedValue).toMatch(/^v1\.2\./);
  });

  it('leaves a pre-encryption plaintext Base32 secret alone', async () => {
    const client = fakeClient([
      { user_id: 'user_1', totp_secret_key_version: '1', totp_secret_enc: 'JBSWY3DPEHPK3PXP' },
    ]);

    const outcome = await reencryptTarget({
      target: REENCRYPT_TARGETS['two-factor'],
      ring: ring(),
      client,
      apply: true,
      format: 'preserve',
    });

    expect(outcome.plaintext).toBe(1);
    expect(client.updates).toHaveLength(0);
  });
});
