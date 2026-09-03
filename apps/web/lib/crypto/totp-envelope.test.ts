import { createCipheriv, randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

const STRONG_KEY = 'b4d2f1a09c8e7d6b5a4938271605f4e3d2c1b0a998877665544332211ffee0011';

async function loadTotpEnvelope() {
  return import('./totp-envelope');
}

function legacyWebCryptoCiphertext(key: string, plaintext: string): string {
  const material = Buffer.from(key.slice(0, 32), 'utf8');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', material, iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('TOTP secret storage', () => {
  it('refuses a stored plaintext Base32 secret instead of returning it as-is', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', STRONG_KEY);
    const { openTotpSecret } = await loadTotpEnvelope();

    expect(() => openTotpSecret('JBSWY3DPEHPK3PXP')).toThrow(/not encrypted/i);
  });

  it('round-trips a secret sealed and opened through the shared envelope', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', STRONG_KEY);
    const { sealTotpSecret, openTotpSecret } = await loadTotpEnvelope();

    const sealed = sealTotpSecret('JBSWY3DPEHPK3PXP');

    expect(sealed).not.toBe('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toMatch(/^v1\./);
    expect(openTotpSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('opens a secret written by the retired hand-rolled WebCrypto codec', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', STRONG_KEY);
    const legacy = legacyWebCryptoCiphertext(STRONG_KEY, 'JBSWY3DPEHPK3PXP');

    const { openTotpSecret } = await loadTotpEnvelope();

    expect(openTotpSecret(legacy)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('decrypts under a retired key after rotation, closing the maintenance-window gap', async () => {
    const oldKey = STRONG_KEY;
    const newKey = 'nQ7fT2pXvC9wL4bR'.repeat(5);
    const sealedUnderOldKey = legacyWebCryptoCiphertext(oldKey, 'JBSWY3DPEHPK3PXP');

    vi.stubEnv('TOTP_ENCRYPTION_KEY', newKey);
    vi.stubEnv('TOTP_ENCRYPTION_KEY_ID', '2');
    vi.stubEnv('TOTP_ENCRYPTION_KEY_RETIRED', `1:${oldKey}`);

    const { openTotpSecret, sealTotpSecret } = await loadTotpEnvelope();

    expect(openTotpSecret(sealedUnderOldKey)).toBe('JBSWY3DPEHPK3PXP');
    expect(openTotpSecret(sealTotpSecret('resealed'))).toBe('resealed');
  });
});

describe('TOTP_ENCRYPTION_KEY entropy gate', () => {
  it('rejects a 32-character passphrase that would become the AES key verbatim', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', 'correct-horse-battery-staple-1234');
    const { sealTotpSecret } = await loadTotpEnvelope();

    expect(() => sealTotpSecret('JBSWY3DPEHPK3PXP')).toThrow(/too short/i);
  });

  it('rejects a long but single-repeated-character key', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', 'a'.repeat(80));
    const { sealTotpSecret } = await loadTotpEnvelope();

    expect(() => sealTotpSecret('JBSWY3DPEHPK3PXP')).toThrow(/repeated character/i);
  });

  it('rejects a key whose first 32 characters are not 32 bytes', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', 'é'.repeat(70));
    const { sealTotpSecret } = await loadTotpEnvelope();

    expect(() => sealTotpSecret('JBSWY3DPEHPK3PXP')).toThrow(/single-byte/i);
  });

  it('reports an unset key as unconfigured rather than as weak', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', '');
    const { sealTotpSecret } = await loadTotpEnvelope();

    expect(() => sealTotpSecret('JBSWY3DPEHPK3PXP')).toThrow(/not configured/i);
  });
});
