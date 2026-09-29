import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  userId: 'user-1',
  consume: vi.fn(
    async (..._args: unknown[]): Promise<{ installationId: number; codeVerifier: string } | null> =>
      null,
  ),
  link: vi.fn(async (..._args: unknown[]) => true),
  exchangeCode: vi.fn(async (..._args: unknown[]) => 'ghu_ephemeral'),
  findInstallation: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({
    installationId: 987654,
    accountLogin: 'verified-org',
    accountType: 'Organization',
    verifiedRepositories: [],
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  getClerkAuthUser: vi.fn(async () => ({ userId: mocks.userId })),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/github-app', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github-app')>()),
  exchangeGitHubOAuthCode: (...args: unknown[]) => mocks.exchangeCode(...args),
  findGitHubInstallationForUser: (...args: unknown[]) => mocks.findInstallation(...args),
}));
vi.mock('@/lib/github-install-app-return', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github-install-app-return')>()),
  consumeAppInstall: (...args: unknown[]) => mocks.consume(...args),
  linkVerifiedGitHubInstallation: (...args: unknown[]) => mocks.link(...args),
}));

import { POST } from './route';

const STATE = 'b'.repeat(64);

function completeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/github/install/complete', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function statusOf(response: Response): Promise<string> {
  return ((await response.json()) as { status: string }).status;
}

describe('POST /api/github/install/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({ installationId: 987654, codeVerifier: 'verifier-a' });
    mocks.exchangeCode.mockResolvedValue('ghu_ephemeral');
    mocks.link.mockResolvedValue(true);
    mocks.findInstallation.mockResolvedValue({
      installationId: 987654,
      accountLogin: 'verified-org',
      accountType: 'Organization',
      verifiedRepositories: [],
    });
  });

  it('links the installation after GitHub confirms the authorizing user can reach it', async () => {
    const response = await POST(completeRequest({ state: STATE, code: 'one-time-code' }));

    expect(await statusOf(response)).toBe('connected');
    expect(mocks.consume).toHaveBeenCalledWith('user-1', STATE);
    expect(mocks.exchangeCode).toHaveBeenCalledWith(
      'one-time-code',
      'http://localhost:3000/api/github/oauth/callback',
      'verifier-a',
    );
    expect(mocks.findInstallation).toHaveBeenCalledWith('ghu_ephemeral', 987654);
    expect(mocks.link).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ installationId: 987654 }),
    );
  });

  it('refuses an account that did not start the install and never touches the code', async () => {
    mocks.consume.mockResolvedValue(null);

    const response = await POST(completeRequest({ state: STATE, code: 'one-time-code' }));

    expect(await statusOf(response)).toBe('invalid_state');
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it('does not link when GitHub does not show the installation to the authorizing user', async () => {
    mocks.findInstallation.mockResolvedValue(null);

    const response = await POST(completeRequest({ state: STATE, code: 'one-time-code' }));

    expect(await statusOf(response)).toBe('ownership_failed');
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it('reports an installation another account already owns', async () => {
    mocks.link.mockResolvedValue(false);

    const response = await POST(completeRequest({ state: STATE, code: 'one-time-code' }));

    expect(await statusOf(response)).toBe('already_linked');
  });

  it('closes a denied authorization without exchanging anything', async () => {
    const response = await POST(completeRequest({ state: STATE, error: 'denied' }));

    expect(await statusOf(response)).toBe('denied');
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a malformed state', async () => {
    const response = await POST(completeRequest({ state: 'short', code: 'x' }));

    expect(response.status).toBe(400);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('cannot complete a code minted for another install, because its verifier does not match', async () => {
    const challengeOf = (verifier: string) =>
      createHash('sha256').update(verifier).digest('base64url');
    const codeChallenges = new Map([['victim-code', challengeOf('verifier-victim')]]);
    mocks.exchangeCode.mockImplementation(async (...args: unknown[]) => {
      const [code, , verifier] = args as [string, string, string | undefined];
      if (!verifier || codeChallenges.get(code) !== challengeOf(verifier)) {
        throw new Error('GitHub OAuth code exchange failed: 400');
      }
      return 'ghu_victim';
    });
    mocks.consume.mockResolvedValue({ installationId: 987654, codeVerifier: 'verifier-attacker' });

    const response = await POST(completeRequest({ state: STATE, code: 'victim-code' }));

    expect(await statusOf(response)).toBe('failed');
    expect(mocks.findInstallation).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });
});
