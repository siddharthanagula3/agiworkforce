import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor } from '@agiworkforce/types';

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-pro',
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-content-safety-service')>();
  return { ...actual, enforceManagedContentSafetyPreference: mocks.enforceSafety };
});

vi.mock('./chat-attachment-hydration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./chat-attachment-hydration')>();
  return { ...actual, hydrateChatAttachments: mocks.hydrate };
});

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-memory-context-service')>();
  return { ...actual, loadManagedMemoryPolicy: mocks.loadPolicy };
});

vi.mock('@/lib/server/user-identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/user-identity')>();
  return { ...actual, buildCustomInstructionsPreamble: mocks.customInstructions };
});

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>();
  return { ...actual, reserveManagedUsageRequest: mocks.reserveManagedUsage };
});

import { CreditService } from '@/lib/services/credit-service';
import {
  DEVICE_HOST_HEADER,
  encodeDesktopHostDeclaration,
  type DesktopHostDeclaration,
} from '@agiworkforce/local-runtime-contract';
import { processRequest } from './request-processor';
import type { AuthGateSuccess } from './auth-gate';

const DISABLED_POLICY = {
  enabled: false,
  generateFromHistory: false,
  allowToolAssistedGeneration: false,
};

const proSubscription = {
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-09-01T00:00:00Z'),
  current_period_end: new Date('2026-10-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

const DECLARATION: DesktopHostDeclaration = {
  deviceId: 'device-abc',
  deviceName: 'Work MacBook',
  platform: 'darwin',
  appVersion: '1.2.3',
  capabilities: ['filesystem.read'],
  roots: [{ id: 'root-1', name: 'Documents', path: '/Users/qa/Documents' }],
};

function chatRequest(key: string, surface: string, declare: boolean): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': surface,
      ...(declare ? { [DEVICE_HOST_HEADER]: encodeDesktopHostDeclaration(DECLARATION) } : {}),
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      messages: [{ role: 'user', content: 'read notes.md in my Documents folder' }],
      stream: true,
    }),
  });
}

function auth(overrides: Partial<AuthGateSuccess> = {}): AuthGateSuccess {
  return {
    ok: true,
    userId: 'user-pro',
    token: 'session-token',
    subscription: proSubscription,
    boundSurface: 'web',
    ...overrides,
  };
}

function toolNames(tools: unknown[] | undefined): string[] {
  return (tools ?? []).flatMap((tool) => {
    const fn = (tool as { function?: { name?: unknown } }).function;
    return typeof fn?.name === 'string' ? [fn.name] : [];
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue(DISABLED_POLICY);
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: 'user-pro',
      idempotencyKey: 'device-tools',
      requestHash: 'hash',
      leaseToken: 'lease',
      estimatedCostCents,
    }),
  );

  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'acct-pro',
    credits_allocated_cents: 100_000,
    credits_remaining_cents: 90_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(true);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
});

describe('device tools are bound to a declared desktop host', () => {
  it('offers them to a desktop caller that declared its folders', async () => {
    const result = await processRequest(chatRequest('device-desktop-1', 'desktop', true), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('desktop');
    expect(result.deviceHost?.deviceId).toBe('device-abc');
    expect(toolNames(result.llmRequest.tools)).toContain('device_read_file');
  });

  it('offers none to a browser tab that sends the same declaration', async () => {
    const result = await processRequest(chatRequest('device-web-1', 'web', true), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('web');
    expect(result.deviceHost).toBeUndefined();
    expect(toolNames(result.llmRequest.tools)).not.toContain('device_read_file');
  });

  it.each(['mobile', 'chrome', 'vscode', 'cli'])(
    'offers none to a %s caller that sends the same declaration',
    async (surface) => {
      const result = await processRequest(
        chatRequest(`device-${surface}-1`, surface, true),
        auth(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.deviceHost).toBeUndefined();
      expect(toolNames(result.llmRequest.tools)).not.toContain('device_read_file');
    },
  );

  it('offers none to a desktop caller that declared nothing', async () => {
    const result = await processRequest(chatRequest('device-desktop-2', 'desktop', false), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deviceHost).toBeUndefined();
    expect(toolNames(result.llmRequest.tools)).not.toContain('device_read_file');
  });

  it('offers none to an api key, whatever header it sends', async () => {
    const result = await processRequest(
      chatRequest('device-api-1', 'desktop', true),
      auth({ token: 'sk_live_abc123' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('api');
    expect(result.deviceHost).toBeUndefined();
    expect(toolNames(result.llmRequest.tools)).not.toContain('device_read_file');
  });
});
