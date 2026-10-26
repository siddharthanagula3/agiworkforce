import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/mobile-intent-tokens');
type ScanModule1 = typeof import('@/lib/ip-allow-list-gate');
type ScanModule2 = typeof import('@/lib/mfa-policy-gate');

const { mockResolve, mockAnswer, mockAssertIp, mockAssertMfa } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockAnswer: vi.fn(),
  mockAssertIp: vi.fn(),
  mockAssertMfa: vi.fn(),
}));

vi.mock('@/lib/ip-allow-list-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  assertIpAllowList: (...args: unknown[]) => mockAssertIp(...args),
}));
vi.mock('@/lib/mfa-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  assertMfaPolicy: (...args: unknown[]) => mockAssertMfa(...args),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/server/mobile-intent', () => {
  class MobileIntentRefusal extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    MOBILE_INTENT_SIGN_IN_MESSAGE: 'Open AGI Mobile to sign in.',
    MobileIntentRefusal,
    answerMobileIntentAsk: (...args: unknown[]) => mockAnswer(...args),
  };
});

vi.mock('@/lib/server/mobile-intent-tokens', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  resolveMobileIntentToken: (...args: unknown[]) => mockResolve(...args),
}));

import { IpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { MfaRequiredError } from '@/lib/mfa-policy-gate';
import { POST } from '../route';

function ask(token: string | null, body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/mobile/intent/ask', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/mobile/intent/ask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertIp.mockResolvedValue(undefined);
    mockAssertMfa.mockResolvedValue(undefined);
  });

  const liveOwner = {
    tokenId: 'token-1',
    userId: 'user-1',
    organizationId: null,
    installId: 'install-1',
  };

  it('applies the workspace ip allow list to the token owner and answers nothing when refused', async () => {
    mockResolve.mockResolvedValueOnce(liveOwner);
    mockAssertIp.mockRejectedValueOnce(new IpNotAllowedError());
    const res = await POST(ask('agi_it_live', { prompt: 'Hello' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('ip_not_allowed');
    expect(mockAssertIp).toHaveBeenCalledWith('user-1', expect.anything());
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it('applies the workspace mfa policy to the token owner and answers nothing when refused', async () => {
    mockResolve.mockResolvedValueOnce(liveOwner);
    mockAssertMfa.mockRejectedValueOnce(new MfaRequiredError('Turn on two-step verification.'));
    const res = await POST(ask('agi_it_live', { prompt: 'Hello' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('mfa_required');
    expect(mockAssertMfa).toHaveBeenCalledWith('user-1');
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  const cookieCredentialHeaders: Record<string, string>[] = [
    {},
    { authorization: 'Basic cookie-session' },
  ];

  it.each(cookieCredentialHeaders)(
    'refuses a session cookie without a bearer token even with headers %j',
    async (headers) => {
      const res = await POST(
        ask(null, { prompt: 'Hello' }, { cookie: '__session=another-account', ...headers }),
      );
      expect(res.status).toBe(401);
      expect(mockResolve).not.toHaveBeenCalled();
      expect(mockAnswer).not.toHaveBeenCalled();
    },
  );

  it('fails closed without a live token and answers nothing', async () => {
    mockResolve.mockResolvedValueOnce(null);
    const res = await POST(ask('agi_it_revoked', { prompt: 'Hello' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'intent_token_invalid', message: 'Open AGI Mobile to sign in.' },
    });
    expect(mockAnswer).not.toHaveBeenCalled();
  });

  it('answers with plain text for a live token', async () => {
    mockResolve.mockResolvedValueOnce({
      tokenId: 'token-1',
      userId: 'user-1',
      organizationId: null,
      installId: 'install-1',
    });
    mockAnswer.mockResolvedValueOnce({ text: 'Paris.', conversationId: 'c1' });
    const res = await POST(
      ask('agi_it_live', { prompt: 'Capital of France?' }, { cookie: '__session=another-account' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'Paris.', conversationId: 'c1' });
    expect(mockResolve).toHaveBeenCalledWith('agi_it_live');
    expect(mockAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: expect.objectContaining({ userId: 'user-1', tokenId: 'token-1' }),
      }),
    );
  });

  it('refuses a prompt longer than the cap', async () => {
    mockResolve.mockResolvedValueOnce({
      tokenId: 'token-1',
      userId: 'user-1',
      organizationId: null,
      installId: 'install-1',
    });
    const res = await POST(ask('agi_it_live', { prompt: 'x'.repeat(2_001) }));
    expect(res.status).toBe(400);
    expect(mockAnswer).not.toHaveBeenCalled();
  });
});
