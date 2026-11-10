import { createPublicKey, generateKeyPairSync } from 'node:crypto';

import jwt from 'jsonwebtoken';
import { vi } from 'vitest';

const SIGNING_KEYS_PATH = '/v1/jwks';
const DEFAULT_KEY_ID = 'ins_local_signing_key';
const DEFAULT_AGE_SECONDS = 1;
const DEFAULT_LIFETIME_SECONDS = 60;

export interface SignedTokenOptions {
  ageSeconds?: number;
  lifetimeSeconds?: number;
}

export interface IdentityTokenSigner {
  sign(claims: Record<string, unknown>, options?: SignedTokenOptions): string;
  signingKey(): Record<string, unknown>;
}

/**
 * Signs tokens the way the identity provider does, with a key generated here.
 * Two signers given the same key id model a forged token: it names the
 * instance's key and is signed by another.
 */
export function createIdentityTokenSigner(keyId: string = DEFAULT_KEY_ID): IdentityTokenSigner {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    sign(claims, options = {}) {
      const issuedAt = Math.floor(Date.now() / 1000) - (options.ageSeconds ?? DEFAULT_AGE_SECONDS);
      return jwt.sign(
        {
          iat: issuedAt,
          exp: issuedAt + (options.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS),
          ...claims,
        },
        privateKey,
        { algorithm: 'RS256', keyid: keyId },
      );
    },
    signingKey: () => ({
      ...createPublicKey(publicKey).export({ format: 'jwk' }),
      kid: keyId,
      alg: 'RS256',
      use: 'sig',
    }),
  };
}

/**
 * Answers the provider's signing-key lookup with `signer`'s public key and
 * refuses every other request. The provider's own verifier then runs unchanged
 * over tokens signed here, so a test meets its real rules (signature, expiry,
 * authorized party) rather than a stand-in's. A stand-in returned whatever
 * claims it was handed, which hid that the provider refuses every token a
 * native app mints once it is given an allowlist.
 */
export function serveIdentitySigningKeys(signer: IdentityTokenSigner): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!url.pathname.endsWith(SIGNING_KEYS_PATH)) {
      throw new Error(`Unexpected request to ${url.origin}${url.pathname}`);
    }
    return new Response(JSON.stringify({ keys: [signer.signingKey()] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}
