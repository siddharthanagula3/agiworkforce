import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/connector-policy-service');
type ScanModule1 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule2 = typeof import('./chat-attachment-hydration');
type ScanModule3 = typeof import('@/lib/services/managed-memory-context-service');
type ScanModule4 = typeof import('@/lib/server/user-identity');
type ScanModule5 = typeof import('@/lib/services/managed-usage-request-service');

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
  webDomains: vi.fn(),
}));

vi.mock('@/lib/services/connector-policy-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  readWorkspaceWebDomainPolicy: mocks.webDomains,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-pro',
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule1>();
  return { ...actual, enforceManagedContentSafetyPreference: mocks.enforceSafety };
});

vi.mock('./chat-attachment-hydration', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return { ...actual, hydrateChatAttachments: mocks.hydrate };
});

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule3>();
  return { ...actual, loadManagedMemoryPolicy: mocks.loadPolicy };
});

vi.mock('@/lib/server/user-identity', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return { ...actual, buildCustomInstructionsPreamble: mocks.customInstructions };
});

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule5>();
  return { ...actual, reserveManagedUsageRequest: mocks.reserveManagedUsage };
});

import { CreditService } from '@/lib/services/credit-service';
import { processRequest, resolveTurnWebDomainPolicy } from './request-processor';
import { nativeSearchToolName } from '@/lib/web-search/required-search';
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

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue(DISABLED_POLICY);
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
  mocks.webDomains.mockResolvedValue(null);
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: 'user-pro',
      idempotencyKey: 'web-domain-rules',
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
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
});

function searchTurn(key: string, extra: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      messages: [{ role: 'user', content: 'what changed in the news today?' }],
      stream: true,
      web_search: true,
      web_fetch: true,
      search_requested: true,
      ...extra,
    }),
  });
}

function nativeSearchTools(tools: unknown[] | undefined): string[] {
  return (tools ?? []).map((tool) => nativeSearchToolName(tool)).filter(Boolean);
}

describe('website rules for one chat turn', () => {
  it('lets the agent narrow the workspace and the request narrow the agent, never widen', () => {
    const result = resolveTurnWebDomainPolicy({
      workspace: { allow: ['example.com'], deny: ['ads.example.com'] },
      agent: { name: 'Docs bot', allow: ['docs.example.com', 'other.org'], deny: [] },
      request: { allow: ['api.docs.example.com'], deny: ['old.docs.example.com'] },
    });
    expect(result).toEqual({
      ok: true,
      policy: {
        allow: ['api.docs.example.com'],
        deny: ['ads.example.com', 'old.docs.example.com'],
      },
    });
  });

  it('keeps the agent block list when the request sets none', () => {
    const result = resolveTurnWebDomainPolicy({
      workspace: null,
      agent: { name: 'Docs bot', allow: [], deny: ['blocked.example'] },
      request: undefined,
    });
    expect(result).toEqual({ ok: true, policy: { allow: [], deny: ['blocked.example'] } });
  });

  it('refuses a request for sites outside what the agent reads, naming the agent', () => {
    const result = resolveTurnWebDomainPolicy({
      workspace: null,
      agent: { name: 'Docs bot', allow: ['docs.example.com'], deny: [] },
      request: { allow: ['news.example.org'] },
    });
    expect(result).toMatchObject({ ok: false, code: 'sites_outside_agent_policy' });
    if (!result.ok) expect(result.message).toContain('Docs bot only reads docs.example.com');
  });

  it('refuses an agent whose sites the workspace does not allow', () => {
    const result = resolveTurnWebDomainPolicy({
      workspace: { allow: ['example.com'], deny: [] },
      agent: { name: 'Docs bot', allow: ['other.org'], deny: [] },
      request: undefined,
    });
    expect(result).toMatchObject({ ok: false, code: 'sites_outside_workspace_policy' });
  });

  it('applies no rules when nobody set any', () => {
    expect(
      resolveTurnWebDomainPolicy({ workspace: null, agent: null, request: undefined }),
    ).toEqual({ ok: true, policy: null });
  });
});

describe('the provider built-in search under website rules', () => {
  it('is offered when no rules are set', async () => {
    const result = await processRequest(searchTurn('rules-none-1'), auth());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.webSearchDomainPolicy).toBeUndefined();
    expect(nativeSearchTools(result.llmRequest.tools).length).toBeGreaterThan(0);
  });

  it('is switched off when the request alone blocks a site', async () => {
    const result = await processRequest(
      searchTurn('rules-request-1', { research_sources: { deny_domains: ['blocked.example'] } }),
      auth(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.webSearchDomainPolicy).toEqual({ allow: [], deny: ['blocked.example'] });
    expect(nativeSearchTools(result.llmRequest.tools)).toEqual([]);
  });

  it('is switched off when the workspace blocks a site', async () => {
    mocks.webDomains.mockResolvedValue({ allow: [], deny: ['blocked.example'] });
    const result = await processRequest(searchTurn('rules-workspace-1'), auth());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(nativeSearchTools(result.llmRequest.tools)).toEqual([]);
  });
});
