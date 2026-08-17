// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn() }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn() }));

const STRONG_KEY = 'b4d2f1a09c8e7d6b5a4938271605f4e3d2c1b0a998877665544332211ffee0011';

async function loadCrypto() {
  return import('./user-preferences');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TOTP secret storage', () => {
  it('refuses a stored plaintext Base32 secret instead of returning it as-is', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', STRONG_KEY);
    const { decryptTOTPSecret } = await loadCrypto();

    await expect(decryptTOTPSecret('JBSWY3DPEHPK3PXP')).rejects.toThrow(/not encrypted/i);
  });

  it('still round-trips a secret encrypted under the configured key', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', STRONG_KEY);
    const { encryptTOTPSecret, decryptTOTPSecret } = await loadCrypto();

    const sealed = await encryptTOTPSecret('JBSWY3DPEHPK3PXP');

    expect(sealed).not.toBe('JBSWY3DPEHPK3PXP');
    await expect(decryptTOTPSecret(sealed)).resolves.toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('TOTP_ENCRYPTION_KEY entropy gate', () => {
  it('rejects a 32-character passphrase that would become the AES key verbatim', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', 'correct-horse-battery-staple-1234');
    const { encryptTOTPSecret } = await loadCrypto();

    await expect(encryptTOTPSecret('JBSWY3DPEHPK3PXP')).rejects.toThrow(/too short/i);
  });

  it('rejects a long but single-repeated-character key', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', 'a'.repeat(80));
    const { encryptTOTPSecret } = await loadCrypto();

    await expect(encryptTOTPSecret('JBSWY3DPEHPK3PXP')).rejects.toThrow(/repeated character/i);
  });

  it('rejects a key whose first 32 characters are not 32 bytes', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', 'é'.repeat(70));
    const { encryptTOTPSecret } = await loadCrypto();

    await expect(encryptTOTPSecret('JBSWY3DPEHPK3PXP')).rejects.toThrow(/single-byte/i);
  });

  it('reports an unset key as unconfigured rather than as weak', async () => {
    vi.stubEnv('TOTP_ENCRYPTION_KEY', '');
    const { encryptTOTPSecret } = await loadCrypto();

    await expect(encryptTOTPSecret('JBSWY3DPEHPK3PXP')).rejects.toThrow(/not configured/i);
  });
});
