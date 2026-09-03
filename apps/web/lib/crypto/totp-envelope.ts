import 'server-only';

import { loadKeyRing, openEnvelope, sealEnvelope, type KeyRing } from './envelope';

const TOTP_KEY_ENV = 'TOTP_ENCRYPTION_KEY';
const TOTP_LEGACY_LAYOUT = 'b64-iv-ct-tag';
const MIN_KEYSOURCE_BYTES = 64;
const HEX_LOOKALIKE_RE = /^[0-9a-fA-F]{64}$/;
const SINGLE_REPEATED_CHAR_RE = /^([\x20-\x7e])\1+$/;
const PLAINTEXT_BASE32_SECRET_RE = /^[A-Z2-7]+$/;

const TOTP_ENCRYPTION_UNAVAILABLE_MESSAGE =
  'TOTP secret encryption is not configured. Set TOTP_ENCRYPTION_KEY before enabling 2FA setup.';

function assertHighEntropyKeysource(value: string): void {
  if (HEX_LOOKALIKE_RE.test(value)) return;
  if (new TextEncoder().encode(value).length < MIN_KEYSOURCE_BYTES) {
    throw new Error(
      `${TOTP_KEY_ENV} too short: the first 32 characters are used verbatim as the AES-256 key, ` +
        `so it must be 64 hex characters or at least ${MIN_KEYSOURCE_BYTES} UTF-8 bytes. ` +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (SINGLE_REPEATED_CHAR_RE.test(value)) {
    throw new Error(`${TOTP_KEY_ENV} appears to be a single repeated character`);
  }
}

function totpKeyRing(): KeyRing {
  const raw = process.env[TOTP_KEY_ENV];
  if (!raw) {
    throw new Error(TOTP_ENCRYPTION_UNAVAILABLE_MESSAGE);
  }
  assertHighEntropyKeysource(raw);
  try {
    return loadKeyRing(TOTP_KEY_ENV, { encoding: 'utf8' });
  } catch (error) {
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
