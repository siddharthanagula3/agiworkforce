import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolve, mockAnswer } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockAnswer: vi.fn(),
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
    MOBILE_INTENT_SIGN_IN_MESSAGE: 'Open AGI Workforce to sign in.',
    MobileIntentRefusal,
    answerMobileIntentAsk: (...args: unknown[]) => mockAnswer(...args),
  };
});

vi.mock('@/lib/server/mobile-intent-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/mobile-intent-tokens')>()),
  resolveMobileIntentToken: (...args: unknown[]) => mockResolve(...args),
}));

import { POST } from '../route';

function ask(token: string | null, body: unknown) {
  return new Request('http://localhost:3000/api/mobile/intent/ask', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/mobile/intent/ask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed without a live token and answers nothing', async () => {
    mockResolve.mockResolvedValueOnce(null);
    const res = await POST(ask('agi_it_revoked', { prompt: 'Hello' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'intent_token_invalid', message: 'Open AGI Workforce to sign in.' },
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
    const res = await POST(ask('agi_it_live', { prompt: 'Capital of France?' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'Paris.', conversationId: 'c1' });
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
