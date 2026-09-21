import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
const transport = vi.hoisted(() => ({
  impl: (async () => new Response(null, { status: 500 })) as unknown as typeof fetch,
}));
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/egress-policy')>()),
  pinnedPublicFetch: (input: string | URL | Request, init?: RequestInit) =>
    transport.impl(input, init),
}));

import {
  ConnectorOAuthTokenError,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeTokenAtProvider,
} from '../oauth-client';
import type { ConnectorOAuthProvider } from '../oauth-registry';

const PUBLIC_ADDRESS = '93.184.216.34';
const CLIENT_SECRET = 'cs-do-not-leak-7f3a';
const AUTH_CODE = 'code-do-not-leak-91b2';
const REFRESH_TOKEN = 'rt-do-not-leak-55c4';
const SECRETS = [CLIENT_SECRET, AUTH_CODE, REFRESH_TOKEN];

const PROVIDER = {
  id: 'acme',
  clientId: 'client-abc',
  clientSecret: CLIENT_SECRET,
  tokenAuthMethod: 'client_secret_basic',
  tokenUrl: 'https://auth.acme.example/oauth/token',
  revocationUrl: 'https://auth.acme.example/oauth/revoke',
} as unknown as ConnectorOAuthProvider;

const POST_BODY_PROVIDER = {
  ...PROVIDER,
  tokenAuthMethod: 'client_secret_post',
} as unknown as ConnectorOAuthProvider;

interface Attempt {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Stands in for the transport, including the part that matters: a caller that
 * does not ask for manual redirects has the client follow the Location itself,
 * replaying method, headers and body on a 307 or a 308.
 */
function installFetch(plan: (call: number, url: string) => Response): Attempt[] {
  const attempts: Attempt[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    let current = typeof input === 'string' ? input : input.toString();
    for (let hop = 0; hop < 20; hop += 1) {
      attempts.push({
        url: current,
        headers: Object.fromEntries(new Headers(init.headers ?? {}).entries()),
        body: typeof init.body === 'string' ? init.body : String(init.body ?? ''),
      });
      const response = plan(attempts.length, current);
      if (response.status < 300 || response.status >= 400) return response;
      if (init.redirect === 'manual') return response;
      if (init.redirect === 'error') throw new TypeError('unexpected redirect');
      const location = response.headers.get('location');
      if (!location) return response;
      current = new URL(location, current).toString();
    }
    throw new TypeError('too many redirects');
  }) as unknown as typeof fetch;
  transport.impl = impl;
  vi.stubGlobal('fetch', impl);
  return attempts;
}

function tokenPage(): Response {
  return new Response(JSON.stringify({ access_token: 'at-1', token_type: 'Bearer' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

function everythingSaid(error: unknown): string {
  const parts = [String(error)];
  if (error instanceof Error) parts.push(error.message, error.stack ?? '');
  parts.push(JSON.stringify(loggerMocks.warn.mock.calls));
  parts.push(JSON.stringify(loggerMocks.error.mock.calls));
  parts.push(JSON.stringify(loggerMocks.info.mock.calls));
  return parts.join('\n');
}

async function exchange(provider: ConnectorOAuthProvider = PROVIDER): Promise<unknown> {
  return exchangeAuthorizationCode({
    provider,
    code: AUTH_CODE,
    codeVerifier: null,
    redirectUri: 'https://app.example/callback',
    requestedScopes: ['read'],
  }).catch((error: unknown) => error);
}

beforeEach(() => {
  dnsMocks.lookup.mockReset();
  dnsMocks.lookup.mockResolvedValue([{ address: PUBLIC_ADDRESS, family: 4 }]);
  loggerMocks.warn.mockReset();
  loggerMocks.error.mockReset();
  loggerMocks.info.mockReset();
  vi.unstubAllGlobals();
});

describe('a token exchange never follows a redirect', () => {
  it.each([301, 302, 303, 307, 308])(
    'treats %s from the token endpoint as a failed exchange and sends nothing onward',
    async (status) => {
      const attempts = installFetch((call) =>
        call === 1 ? redirect(status, 'https://attacker.example/collect') : tokenPage(),
      );

      const error = await exchange();

      expect(error).toBeInstanceOf(ConnectorOAuthTokenError);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]!.url).toBe(PROVIDER.tokenUrl);
      expect(attempts.some((attempt) => attempt.url.includes('attacker.example'))).toBe(false);
    },
  );

  it.each([307, 308])(
    'never lets the client replay the credential on a %s, whether it is in the header or the body',
    async (status) => {
      for (const provider of [PROVIDER, POST_BODY_PROVIDER]) {
        const attempts = installFetch((call) =>
          call === 1 ? redirect(status, 'https://attacker.example/collect') : tokenPage(),
        );

        await exchange(provider);

        const onward = attempts.slice(1);
        expect(onward).toEqual([]);
        for (const attempt of attempts) {
          expect(new URL(attempt.url).host).toBe('auth.acme.example');
        }
      }
    },
  );

  it('refuses a redirect to a private address without contacting it', async () => {
    const attempts = installFetch((call) =>
      call === 1 ? redirect(302, 'http://169.254.169.254/latest/meta-data/') : tokenPage(),
    );

    const error = await exchange();

    expect(error).toBeInstanceOf(ConnectorOAuthTokenError);
    expect(attempts).toHaveLength(1);
  });

  it('refuses a token endpoint whose host resolves private, before sending the secret', async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const attempts = installFetch(() => tokenPage());

    const error = await exchange();

    expect(error).toBeInstanceOf(ConnectorOAuthTokenError);
    expect(attempts).toEqual([]);
  });

  it('refuses a host that resolves public and then private, so the pin is what connects', async () => {
    dnsMocks.lookup
      .mockResolvedValueOnce([
        { address: PUBLIC_ADDRESS, family: 4 },
        { address: '127.0.0.1', family: 4 },
      ])
      .mockResolvedValue([{ address: PUBLIC_ADDRESS, family: 4 }]);
    const attempts = installFetch(() => tokenPage());

    const error = await exchange();

    expect(error).toBeInstanceOf(ConnectorOAuthTokenError);
    expect(attempts).toEqual([]);
  });

  it('still completes an ordinary exchange', async () => {
    const attempts = installFetch(() => tokenPage());

    const result = await exchangeAuthorizationCode({
      provider: PROVIDER,
      code: AUTH_CODE,
      codeVerifier: null,
      redirectUri: 'https://app.example/callback',
      requestedScopes: ['read'],
    });

    expect(result.accessToken).toBe('at-1');
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.headers['authorization']).toMatch(/^Basic /);
  });

  it('holds a refresh to the same rule', async () => {
    const attempts = installFetch((call) =>
      call === 1 ? redirect(308, 'https://attacker.example/collect') : tokenPage(),
    );

    const error = await refreshAccessToken({
      provider: PROVIDER,
      refreshToken: REFRESH_TOKEN,
      tokenEndpoint: PROVIDER.tokenUrl,
      grantedScopes: ['read'],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConnectorOAuthTokenError);
    expect(attempts).toHaveLength(1);
  });
});

describe('a revocation never follows a redirect', () => {
  it.each([301, 302, 307, 308])('reports %s as a failed revocation', async (status) => {
    const attempts = installFetch((call) =>
      call === 1
        ? redirect(status, 'https://attacker.example/collect')
        : new Response(null, { status: 200 }),
    );

    const revoked = await revokeTokenAtProvider(PROVIDER, REFRESH_TOKEN, 'refresh_token');

    expect(revoked).toBe(false);
    expect(attempts).toHaveLength(1);
  });

  it('refuses a revocation redirect to a private address', async () => {
    const attempts = installFetch((call) =>
      call === 1 ? redirect(302, 'http://127.0.0.1:9000/') : new Response(null, { status: 200 }),
    );

    expect(await revokeTokenAtProvider(PROVIDER, REFRESH_TOKEN, 'refresh_token')).toBe(false);
    expect(attempts).toHaveLength(1);
  });

  it('refuses a revocation host that resolves private', async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: '192.168.1.1', family: 4 }]);
    const attempts = installFetch(() => new Response(null, { status: 200 }));

    expect(await revokeTokenAtProvider(PROVIDER, REFRESH_TOKEN, 'refresh_token')).toBe(false);
    expect(attempts).toEqual([]);
  });

  it('still revokes normally', async () => {
    const attempts = installFetch(() => new Response(null, { status: 200 }));

    expect(await revokeTokenAtProvider(PROVIDER, REFRESH_TOKEN, 'refresh_token')).toBe(true);
    expect(attempts).toHaveLength(1);
  });
});

describe('a refusal says what happened and nothing more', () => {
  it.each([
    ['a redirect', () => redirect(307, 'https://attacker.example/collect')],
    ['a private redirect', () => redirect(302, 'http://10.0.0.5/')],
  ])('names the host but no secret when the exchange fails on %s', async (_label, plan) => {
    installFetch((call) => (call === 1 ? plan() : tokenPage()));

    const error = await exchange();
    const said = everythingSaid(error);

    expect(error).toBeInstanceOf(ConnectorOAuthTokenError);
    expect(said).toContain('auth.acme.example');
    for (const secret of SECRETS) expect(said).not.toContain(secret);
    expect(said).not.toContain('Basic ');
  });

  it('names no secret when the host itself is refused', async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    installFetch(() => tokenPage());

    const said = everythingSaid(await exchange());

    for (const secret of SECRETS) expect(said).not.toContain(secret);
  });

  it('names no secret when the endpoint answers an ordinary error', async () => {
    installFetch(
      () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const error = await exchange();
    const said = everythingSaid(error);

    expect((error as ConnectorOAuthTokenError).isInvalidGrant).toBe(true);
    for (const secret of SECRETS) expect(said).not.toContain(secret);
  });
});
