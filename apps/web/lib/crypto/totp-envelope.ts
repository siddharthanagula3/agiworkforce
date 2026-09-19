import 'server-only';

import { openEnvelope, sealEnvelope, type KeyRing } from './envelope';
import {
  PlatformKeyProviderUnavailableError,
  platformKeyProviderId,
  platformKeyRing,
} from './platform-keys';
import { assertValidTotpKeysource } from './totp-keysource';

const TOTP_KEY_ENV = 'TOTP_ENCRYPTION_KEY';
const TOTP_LEGACY_LAYOUT = 'b64-iv-ct-tag';
const PLAINTEXT_BASE32_SECRET_RE = /^[A-Z2-7]+$/;

const TOTP_ENCRYPTION_UNAVAILABLE_MESSAGE =
  'TOTP secret encryption is not configured. Set TOTP_ENCRYPTION_KEY before enabling 2FA setup.';

// Under a KMS provider the environment holds an envelope, so the entropy checks
// would be measuring ciphertext and belong to the env-backed provider alone.
function totpKeyRing(): KeyRing {
  const raw = process.env[TOTP_KEY_ENV];
  if (!raw) {
    throw new Error(TOTP_ENCRYPTION_UNAVAILABLE_MESSAGE);
  }
  if (platformKeyProviderId() === 'env') assertValidTotpKeysource(raw);
  try {
    return platformKeyRing(TOTP_KEY_ENV, { encoding: 'utf8' });
  } catch (error) {
    if (error instanceof PlatformKeyProviderUnavailableError) throw error;
    throw new Error(
      `${TOTP_KEY_ENV} must start with 32 single-byte characters; a multi-byte character ` +
        'yields the wrong AES-256 key length. Use a 64-character hex key.',
      { cause: error },
    );
  }
}

export function sealTotpSecret(secret: string): string {
  return sealEnvelope(totpKeyRing(), secret, TOTP_LEGACY_LAYOUT);
}

export function openTotpSecret(encryptedSecret: string): string {
  if (PLAINTEXT_BASE32_SECRET_RE.test(encryptedSecret)) {
    throw new Error(
      'Stored TOTP secret is not encrypted. Refusing to accept a plaintext second-factor secret; ' +
        're-enroll the account in two-factor authentication.',
    );
  }
  return openEnvelope(totpKeyRing(), encryptedSecret, TOTP_LEGACY_LAYOUT).plaintext;
}
