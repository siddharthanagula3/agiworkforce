import { createSign, generateKeyPairSync } from 'node:crypto';

import { verifyToken as clerkVerifyToken } from '@clerk/backend';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({}),
  clerkClient: async () => ({}),
  clerkMiddleware: () => () => undefined,
  createRouteMatcher: () => () => false,
}));

const { ClerkIdentityProvider } = await import('../adapters/clerk');
const { IdentityConfigError } = await import('../types');

const SECRET = 'sk_test_local_verification';
const WEB_ORIGIN = 'https://app.test';
const EXTENSION_ORIGIN = 'chrome-extension://abcdefghijklmnop';
const FOREIGN_ORIGIN = 'https://evil.test';
const PARTIES = [WEB_ORIGIN, EXTENSION_ORIGIN];
const SUBJECT = 'user_native_1';
const SESSION_ID = 'sess_native_1';
const TOKEN_LIFETIME_SECONDS = 60;
const CLOCK_SKEW_ALLOWANCE_SECONDS = 30;

function signingKeys() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

const instanceKeys = signingKeys();
const strangerKeys = signingKeys();

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signToken(
  claims: Record<string, unknown>,
  privateKey: string = instanceKeys.privateKey,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: 'ins_local' });
  const payload = encode({
    iss: 'https://clerk.app.test',
    iat: now - 1,
    nbf: now - 1,
    exp: now + TOKEN_LIFETIME_SECONDS,
    sub: SUBJECT,
    ...claims,
  });
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(privateKey)
    .toString('base64url');
  return `${header}.${payload}.${signature}`;
}

const verifierOptions: Array<Record<string, unknown>> = [];

/**
 * Clerk's own verifier, given the instance's public key so it needs no network.
 * Signature, expiry and the authorized-party rule are all Clerk's.
 */
const verifyWithInstanceKey: typeof clerkVerifyToken = (token, options) => {
  verifierOptions.push({ ...options });
  return clerkVerifyToken(token, { ...options, jwtKey: instanceKeys.publicKey });
};

const provider = new ClerkIdentityProvider({
  secretKey: SECRET,
  authorizedParties: PARTIES,
  verifyToken: verifyWithInstanceKey,
});

const DEFAULT = { authorizedParties: PARTIES };
const ADMITTING = { authorizedParties: PARTIES, admitMissingAuthorizedParty: true };

beforeEach(() => {
  verifierOptions.length = 0;
});

describe('verifySessionToken against Clerk itself: the default path', () => {
  it('refuses a token with no authorized party, which is what a native app mints', async () => {
    await expect(
      provider.verifySessionToken(signToken({ sid: SESSION_ID }), DEFAULT),
    ).resolves.toBeNull();
    expect(verifierOptions).toEqual([{ secretKey: SECRET, authorizedParties: PARTIES }]);
  });

  it.each([WEB_ORIGIN, EXTENSION_ORIGIN])(
    'accepts a token minted for the allowlisted party %s',
    async (azp) => {
      await expect(
        provider.verifySessionToken(signToken({ sid: SESSION_ID, azp }), DEFAULT),
      ).resolves.toMatchObject({ subject: SUBJECT, sessionId: SESSION_ID, raw: { azp } });
    },
  );

  it('refuses a token minted for a party off the allowlist', async () => {
    await expect(
      provider.verifySessionToken(signToken({ sid: SESSION_ID, azp: FOREIGN_ORIGIN }), DEFAULT),
    ).resolves.toBeNull();
  });

  it('treats an explicit false the same as leaving the option out', async () => {
    await expect(
      provider.verifySessionToken(signToken({ sid: SESSION_ID }), {
        authorizedParties: PARTIES,
        admitMissingAuthorizedParty: false,
      }),
    ).resolves.toBeNull();
    expect(verifierOptions).toEqual([{ secretKey: SECRET, authorizedParties: PARTIES }]);
  });
});

describe('verifySessionToken against Clerk itself: admitting a missing authorized party', () => {
  it('accepts a token with no authorized party and maps its claims', async () => {
    const claims = await provider.verifySessionToken(
      signToken({ sid: SESSION_ID, fva: [2, -1] }),
      ADMITTING,
    );

    expect(claims).toMatchObject({
      subject: SUBJECT,
      sessionId: SESSION_ID,
      factorAge: { firstFactorMinutes: 2, secondFactorMinutes: null },
    });
    expect(claims?.raw).not.toHaveProperty('azp');
  });

  it('verifies without the allowlist, so the claim check below is the adapter’s own', async () => {
    await provider.verifySessionToken(signToken({ sid: SESSION_ID }), ADMITTING);
    expect(verifierOptions).toEqual([{ secretKey: SECRET }]);
  });

  it('still accepts a token minted for an allowlisted party', async () => {
    await expect(
      provider.verifySessionToken(signToken({ sid: SESSION_ID, azp: WEB_ORIGIN }), ADMITTING),
    ).resolves.toMatchObject({ subject: SUBJECT, raw: { azp: WEB_ORIGIN } });
  });

  it('refuses a token minted for a party off the allowlist', async () => {
    await expect(
      provider.verifySessionToken(signToken({ sid: SESSION_ID, azp: FOREIGN_ORIGIN }), ADMITTING),
    ).resolves.toBeNull();
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
    ['a number', 1],
    ['true', true],
    ['an array holding an allowlisted party', [WEB_ORIGIN]],
    ['an object', { origin: WEB_ORIGIN }],
    ['an allowlisted party with surrounding space', ` ${WEB_ORIGIN} `],
    ['an allowlisted party in another case', WEB_ORIGIN.toUpperCase()],
  ])('refuses an authorized party that is present as %s', async (_label, azp) => {
    await expect(
      provider.verifySessionToken(signToken({ sid: SESSION_ID, azp }), ADMITTING),
    ).resolves.toBeNull();
  });

  it('refuses a token signed by a key that is not the instance’s', async () => {
    await expect(
      provider.verifySessionToken(
        signToken({ sid: SESSION_ID }, strangerKeys.privateKey),
        ADMITTING,
      ),
    ).resolves.toBeNull();
  });

  it('refuses an expired token', async () => {
    const expiredAt =
      Math.floor(Date.now() / 1000) - TOKEN_LIFETIME_SECONDS - CLOCK_SKEW_ALLOWANCE_SECONDS;
    await expect(
      provider.verifySessionToken(
        signToken({ sid: SESSION_ID, iat: expiredAt - 1, nbf: expiredAt - 1, exp: expiredAt }),
        ADMITTING,
      ),
    ).resolves.toBeNull();
  });

  it('refuses a token whose payload was altered after signing', async () => {
    const [header, , signature] = signToken({ sid: SESSION_ID }).split('.');
    const now = Math.floor(Date.now() / 1000);
    const forged = encode({
      sub: 'user_someone_else',
      sid: SESSION_ID,
      iat: now - 1,
      nbf: now - 1,
      exp: now + TOKEN_LIFETIME_SECONDS,
    });
    await expect(
      provider.verifySessionToken(`${header}.${forged}.${signature}`, ADMITTING),
    ).resolves.toBeNull();
  });

  it('still refuses to verify without an allowlist to hold a present party against', async () => {
    await expect(
      provider.verifySessionToken(signToken({ sid: SESSION_ID }), {
        authorizedParties: [],
        admitMissingAuthorizedParty: true,
      }),
    ).rejects.toBeInstanceOf(IdentityConfigError);
    expect(verifierOptions).toEqual([]);
  });

  it('refuses a verifier result that is not a claims object', async () => {
    const hollow = new ClerkIdentityProvider({
      secretKey: SECRET,
      verifyToken: (async () => undefined) as unknown as typeof clerkVerifyToken,
    });
    await expect(hollow.verifySessionToken('token', ADMITTING)).resolves.toBeNull();
  });
});
