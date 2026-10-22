import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyAppleAppTransaction } from './mobile-iap-store-verification';

vi.mock('server-only', () => ({}));

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

async function refusalMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no refusal';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('verifyAppleAppTransaction', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_APP_STORE_BUNDLE_ID', 'com.agiworkforce.app');
    vi.stubEnv('APPLE_APP_STORE_APP_ID', '1234567890');
    vi.stubEnv('APPLE_APP_STORE_ENVIRONMENT', 'production');
    vi.stubEnv(
      'APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON',
      JSON.stringify([
        Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64'),
      ]),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses an app transaction that does not chain to an Apple root', async () => {
    const forged = jwt.sign(
      {
        appTransactionId: 'app-tx-forged',
        bundleId: 'com.agiworkforce.app',
        appAppleId: 1234567890,
        receiptType: 'Production',
      },
      privateKey,
      { algorithm: 'ES256', header: { alg: 'ES256', x5c: ['bm90LWEtY2VydGlmaWNhdGU='] } },
    );

    await expect(refusalMessage(verifyAppleAppTransaction(forged))).resolves.toBe(
      'Apple could not verify this app transaction.',
    );
  });

  it('refuses a payload that is not a signed app transaction at all', async () => {
    await expect(
      refusalMessage(verifyAppleAppTransaction('not.a.signed-app-transaction')),
    ).resolves.toBe('Apple could not verify this app transaction.');
  });
});
