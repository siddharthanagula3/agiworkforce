import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  available: vi.fn(),
  rateLimit: vi.fn(),
  reserve: vi.fn(),
  estimate: vi.fn(),
  moderate: vi.fn(),
  settle: vi.fn(),
  human: vi.fn(),
  store: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(async () => ({ id: 'anon-visitor' })),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/guest-chat/guest-chat-access', () => ({
  isGuestChatAvailable: (...args: unknown[]) => mocks.available(...args),
}));
vi.mock('@/lib/security/bot-challenge', () => ({
  isPlatformBotProtectionAvailable: vi.fn(),
  verifyBotChallenge: vi.fn(),
  isBotChallengeEnforced: vi.fn(() => false),
  requireHumanCaller: (...args: unknown[]) => mocks.human(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: vi.fn(),
  acquireManagedTurnSlot: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  checkRateLimit: (...args: unknown[]) => mocks.rateLimit(...args),
  clientIpRateLimitIdentifier: () => 'ip:203.0.113.9',
  resolveRedisOutagePolicy: () => 'fail-closed',
}));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueProvider: vi.fn(),
  getKeyValueRateLimiter: vi.fn(() => null),
  getKeyValueStore: () => mocks.store(),
}));
vi.mock('@/lib/moderation', () => ({
  GENERATED_OUTPUT_REFUSAL: vi.fn(),
  GeneratedMediaModeration: vi.fn(),
  ImageStructureRejection: vi.fn(),
  OutputModerationReason: vi.fn(),
  PLATFORM_POLICY_REFUSAL: vi.fn(),
  UPLOADED_IMAGE_REFUSAL: vi.fn(),
  inspectImageBytes: vi.fn(),
  matchDenylistedUpload: vi.fn(),
  moderateGeneratedMedia: vi.fn(),
  moderateUploadedImage: vi.fn(),
  recordGeneratedMediaProviderRefusal: vi.fn(),
  recordModerationEvent: vi.fn(),
  moderateManagedPrompt: (...args: unknown[]) => mocks.moderate(...args),
}));
vi.mock('@/lib/guest-chat/guest-chat-service', async (importOriginal) => ({
  ...(await importOriginal<GuestChatServiceModule>()),
  guestSpendKey: vi.fn(),
  guestChatModel: () => ({
    modelKey: 'free-default',
    provider: 'openrouter',
    wireModel: 'free/default',
    routeId: null,
    zeroDataRetention: true,
  }),
  buildGuestChatRequest: () => ({ model: 'free/default', messages: [] }),
  estimateGuestTurnMicrousd: (...args: unknown[]) => mocks.estimate(...args),
  reserveGuestSpend: (...args: unknown[]) => mocks.reserve(...args),
  settleGuestSpend: (...args: unknown[]) => mocks.settle(...args),
  streamGuestChat: () =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'),
        );
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
}));

import { GUEST_CHAT_CONFIG } from '@/lib/guest-chat/config';
import { GUEST_CHAT_PATH } from '@/lib/guest-chat/contract';
import { GET, POST } from '../route';

type GuestChatServiceModule = typeof import('@/lib/guest-chat/guest-chat-service');

const URL_BASE = `https://agiworkforce.test${GUEST_CHAT_PATH}`;

function post(body: unknown) {
  return new NextRequest(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const HELLO = { messages: [{ role: 'user', content: 'Hello there' }] };

function allowed(remaining = 5) {
  return {
    success: true,
    limit: GUEST_CHAT_CONFIG.deviceMessagesPerDay,
    remaining,
    reset: Date.parse('2026-09-29T00:00:00Z'),
    headers: {},
    identifier: 'guest',
  };
}

describe(GUEST_CHAT_PATH, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available.mockResolvedValue(true);
    mocks.rateLimit.mockResolvedValue(allowed());
    mocks.store.mockReturnValue({ get: vi.fn(), increment: vi.fn(), expire: vi.fn() });
    mocks.estimate.mockReturnValue(500);
    mocks.reserve.mockResolvedValue({
      ok: true,
      hold: { keys: ['guest-chat:spend:2026-09-28'], reservedMicrousd: 500 },
    });
    mocks.settle.mockResolvedValue(500);
    mocks.moderate.mockReturnValue({ allowed: true, action: 'allow' });
    mocks.human.mockResolvedValue(undefined);
  });

  it('tells the signed-out page whether it can chat and the daily limit', async () => {
    const response = await GET(new NextRequest(URL_BASE));
    const body = await response.json();

    expect(body).toMatchObject({
      available: true,
      dailyLimit: GUEST_CHAT_CONFIG.deviceMessagesPerDay,
      signInPath: '/login',
    });
  });

  it('refuses every turn while the switch is off', async () => {
    mocks.available.mockResolvedValue(false);

    const response = await POST(post(HELLO));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('guest_chat_unavailable');
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it('takes text only and says how to get more', async () => {
    const response = await POST(
      post({ messages: [{ role: 'user', content: 'Read this', attachments: ['file'] }] }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({
      code: 'guest_text_only',
      signInPath: '/login',
    });
  });

  it('asks the visitor to sign in once the day is used up', async () => {
    mocks.rateLimit
      .mockResolvedValueOnce(allowed())
      .mockResolvedValueOnce({ ...allowed(0), success: false });

    const response = await POST(post(HELLO));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatchObject({ code: 'guest_limit_reached', signInPath: '/login' });
    expect(response.headers.get('x-guest-messages-remaining')).toBe('0');
  });

  it('stops every visitor once the day’s spend cap is reached', async () => {
    mocks.reserve.mockResolvedValue({ ok: false, limit: 'global' });

    const response = await POST(post(HELLO));

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('guest_capacity_reached');
  });

  it.each(['device', 'ip'] as const)(
    'asks a visitor past its %s spend cap to sign in, before any model call',
    async (limit) => {
      mocks.reserve.mockResolvedValue({ ok: false, limit });

      const response = await POST(post(HELLO));

      expect(response.status).toBe(429);
      expect((await response.json()).error).toMatchObject({
        code: 'guest_limit_reached',
        signInPath: '/login',
      });
      expect(mocks.settle).not.toHaveBeenCalled();
    },
  );

  it('holds the turn’s most expensive outcome per device, per network and for all guests', async () => {
    await POST(post(HELLO));

    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        visitorId: 'anon-visitor',
        networkId: 'ip:203.0.113.9',
        amountMicrousd: 500,
        config: GUEST_CHAT_CONFIG,
      }),
    );
  });

  it('refuses a turn it cannot price rather than running it unmetered', async () => {
    mocks.estimate.mockImplementation(() => {
      throw new Error('unpriced');
    });

    const response = await POST(post(HELLO));

    expect(response.status).toBe(503);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('refuses every turn when there is no shared store to count spend in', async () => {
    mocks.store.mockReturnValue(null);

    const response = await POST(post(HELLO));

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('guest_capacity_reached');
  });

  it('refuses what the platform policy blocks before any model call', async () => {
    mocks.moderate.mockReturnValue({
      allowed: false,
      action: 'block',
      refusal: 'Refused.',
      categories: [],
      ruleIds: [],
    });

    const response = await POST(post(HELLO));

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('content_policy_violation');
  });

  it('streams the answer and says how many messages are left today', async () => {
    const response = await POST(post(HELLO));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-guest-messages-remaining')).toBe('5');
    expect(await response.text()).toContain('data: [DONE]');
    expect(mocks.human).toHaveBeenCalled();
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });
});
