
import { bytesToUtf8 } from './bytes';
import { LicenseClaims, LicenseClaimsSchema } from './claims';
import { verifySignedContainer } from './container';

export const LICENSE_CONTAINER_FORMAT = 'agilicense-v1';

const MS_PER_DAY = 86_400_000;

export type LicenseErrorCode =
  | 'malformed'
  /** Well-formed, but no root key verifies the signature. */
  | 'bad_signature'
  /** Signature valid, but the clock is before `issuedAt`. */
  | 'not_yet_valid'
  /** Signature valid, but now is past `expiresAt + graceDays`. Degrade to free. */
  | 'expired';

export interface LicenseError {
  code: LicenseErrorCode;
  message: string;
}

export type LicenseVerifyResult =
  | {
      ok: true;
      claims: LicenseClaims;
      graceActive: boolean;
    }
  | { ok: false; error: LicenseError };

/**
 * Verify an `.agilicense` file offline.
 *
 * @param fileBytes  raw bytes of the `.agilicense` file.
 * @param rootPublicKeys  base64 32-byte Ed25519 root public keys baked into the
 *   app build. Rotatable list — the signature must verify against any one of
 *   them, so a retired key can coexist with its replacement (design §2.1).
 * @param nowMs  the local clock in Unix epoch milliseconds (injected — keeps
 *   this pure and testable; offline verification uses the local clock).
 */
export function verifyLicense(
  fileBytes: Uint8Array,
  rootPublicKeys: readonly string[],
  nowMs: number,
): LicenseVerifyResult {
  const container = verifySignedContainer(fileBytes, rootPublicKeys, LICENSE_CONTAINER_FORMAT);
  if (!container.ok) {
    return { ok: false, error: { code: container.error.code, message: container.error.message } };
  }

  let claimsText: string;
  try {
    claimsText = bytesToUtf8(container.payload);
  } catch {
    return {
      ok: false,
      error: { code: 'malformed', message: 'license claims are not valid UTF-8' },
    };
  }

  let claimsJson: unknown;
  try {
    claimsJson = JSON.parse(claimsText);
  } catch {
    return {
      ok: false,
      error: { code: 'malformed', message: 'license claims are not valid JSON' },
    };
  }

  const result = LicenseClaimsSchema.safeParse(claimsJson);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: 'malformed',
        message: `license claims failed schema: ${result.error.message}`,
      },
    };
  }

  const claims = result.data;

  if (nowMs < claims.issuedAt) {
    return {
      ok: false,
      error: {
        code: 'not_yet_valid',
        message: 'license is not yet valid (clock is before issuedAt)',
      },
    };
  }

  const graceCutoff = claims.expiresAt + claims.graceDays * MS_PER_DAY;
  if (nowMs > graceCutoff) {
    return {
      ok: false,
      error: {
        code: 'expired',
        message: 'license is expired past its grace window; degrade to free tier',
      },
    };
  }

  return { ok: true, claims, graceActive: nowMs > claims.expiresAt };
}
