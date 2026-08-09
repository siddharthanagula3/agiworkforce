import 'server-only';
import { randomBytes } from 'crypto';

import { loadKeyRing, openEnvelope, sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';

/**
 * AES-256-GCM encryption for user-supplied custom MCP connector bearer
 * tokens (`user_custom_connectors.auth_header_enc`) and for the settled OAuth
 * grants in `connector_oauth_grants` that lib/connectors/oauth-store.ts writes.
 *
 * Mirrors the encryptToken/decryptToken pattern in lib/github-app.ts, but
 * uses its own dedicated key so a compromise of one secret domain (GitHub
 * App installation tokens vs. user-supplied MCP bearer tokens) does not
 * expose the other.
 *
 * KEY ROTATION. Decryption goes through lib/crypto/envelope.ts against the
 * whole key ring, not a single env value, so a value sealed under a key that
 * now lives in `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_RETIRED` still opens
 * while scripts/reencrypt.mjs walks the rows onto the active key. New values
 * are sealed under the ACTIVE key in the historical `iv:ct:tag` hex layout, so
 * an instance of the previous build can still read them mid-deploy; the sweep's
 * `--format=versioned` is what moves the column to the self-describing form.
 */

const CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY = process.env['CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY'];

// Cache the dev fallback ring so encrypt/decrypt agree within a process.
let _devFallbackRing: KeyRing | null = null;

const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

function getKeyRing(): KeyRing {
  const keyHex = CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY;
  if (keyHex && HEX_64_RE.test(keyHex)) {
    return loadKeyRing('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY');
  }

  // AUDIT-FIX CON-12: fail closed outside development. A per-process random key
  // silently produces ciphertext that a sibling serverless instance — or this
  // instance after a restart — cannot decrypt. That surfaces as intermittent,
  // unreproducible connector auth failures instead of as a configuration error,
  // and every stored ciphertext becomes permanently unreadable after a redeploy.
  // A misconfigured production deploy must not look healthy.
  //
  // Note the check is now a hex-shape test, not a length test: a 64-character
  // non-hex value previously reached Buffer.from(_, 'hex'), which silently
  // truncates and yields a short key.
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY is missing or malformed (expected 64 hex characters). ' +
        'Custom connector bearer tokens cannot be encrypted or decrypted without it.',
    );
  }

  // Development-only fallback, cached so encrypt/decrypt agree within a process.
  if (!_devFallbackRing) {
    _devFallbackRing = { active: { id: '1', material: randomBytes(32) }, retired: [] };
  }
  return _devFallbackRing;
}

export function encryptConnectorToken(token: string): string {
  return sealEnvelope(getKeyRing(), token, 'hex-triple');
}

export function decryptConnectorToken(encryptedValue: string): string {
  return openEnvelope(getKeyRing(), encryptedValue, 'hex-triple').plaintext;
}
