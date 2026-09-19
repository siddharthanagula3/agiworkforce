const TOTP_KEY_ENV = 'TOTP_ENCRYPTION_KEY';
const MIN_KEYSOURCE_BYTES = 64;
const HEX_32_BYTE_RE = /^[0-9a-fA-F]{64}$/;

function isSingleRepeatedCharacter(value: string): boolean {
  return value.length > 1 && new Set(value).size === 1;
}

export function totpKeysourceValidationError(value: string): string | null {
  if (HEX_32_BYTE_RE.test(value)) {
    return isSingleRepeatedCharacter(value)
      ? `${TOTP_KEY_ENV} appears to be a single repeated character`
      : null;
  }
  if (new TextEncoder().encode(value).length < MIN_KEYSOURCE_BYTES) {
    return (
      `${TOTP_KEY_ENV} too short: the first 32 characters are used verbatim as the AES-256 key, ` +
      `so it must be 64 hex characters or at least ${MIN_KEYSOURCE_BYTES} UTF-8 bytes. ` +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (new TextEncoder().encode(value.slice(0, 32)).length !== 32) {
    return (
      `${TOTP_KEY_ENV} must start with 32 single-byte characters; a multi-byte character ` +
      'yields the wrong AES-256 key length. Use a 64-character hex key.'
    );
  }
  if (isSingleRepeatedCharacter(value)) {
    return `${TOTP_KEY_ENV} appears to be a single repeated character`;
  }
  return null;
}

export function assertValidTotpKeysource(value: string): void {
  const error = totpKeysourceValidationError(value);
  if (error) throw new Error(error);
}
