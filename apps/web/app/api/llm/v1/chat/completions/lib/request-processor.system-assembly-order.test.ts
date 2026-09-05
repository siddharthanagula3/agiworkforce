import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor } from '@agiworkforce/types';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';
import type { Skill } from '@agiworkforce/skills';

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
  managedSkillCatalog: vi.fn(),
  enabledPluginIds: vi.fn(),
  loadMcpContext: vi.fn(),
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

vi.mock('@/lib/services/skill-catalog-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/skill-catalog-service')>();
  return {
    ...actual,
    getManagedSkillCatalog: mocks.managedSkillCatalog,
    getManagedSkillCatalogForPlugins: mocks.managedSkillCatalog,
  };
});

vi.mock('@/lib/services/plugin-installation-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/plugin-installation-service')>();
  return { ...actual, listEnabledPluginIds: mocks.enabledPluginIds };
});

vi.mock('@/lib/connectors/mcp-context-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connectors/mcp-context-service')>();
  return { ...actual, loadSelectedMcpContext: mocks.loadMcpContext };
});

import { CreditService } from '@/lib/services/credit-service';
import { processRequest } from './request-processor';
import type { AuthGateSuccess } from './auth-gate';

const proSubscription = {
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-07-01T00:00:00Z'),
  current_period_end: new Date('2026-08-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

function catalogSkill(name: string, description: string): Skill {
  return {
    name,
    description,
    body: 'PRIVATE SKILL BODY',
    contentHash: `sha256:${'0'.repeat(64)}`,
    filePath: `/srv/private/skills/${name}/SKILL.md`,
    source: 'managed-local',
    metadata: {},
    frontmatter: {},
  };
}

const CATALOG = [catalogSkill('design-review', 'Review interface polish before a release.')];

function chatRequestFor(key: string, body: Record<string, unknown> = {}) {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      messages: [{ role: 'user', content: 'Review the interface polish for this release.' }],
      stream: true,
      ...body,
    }),
  });
}

function auth(): AuthGateSuccess {
  return {
    ok: true,
    userId: 'user-pro',
    token: 'session-token',
    subscription: proSubscription,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue({
    enabled: false,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
  mocks.managedSkillCatalog.mockResolvedValue(CATALOG);
  mocks.enabledPluginIds.mockResolvedValue(new Set<string>());
  mocks.loadMcpContext.mockResolvedValue('Connected tool: Linear. Workspace: agiworkforce.');
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: 'user-pro',
      idempotencyKey: 'assembly-order',
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
});

describe('managed system prompt assembly order', () => {
  it('keeps MCP context and an explicitly selected skill both ahead of the cache boundary', async () => {
    const result = await processRequest(
      chatRequestFor('assembly-order-1', {
        skill_name: 'design-review',
        mcp_context: { resources: [{ connectorId: 'linear', uri: 'linear://issue/AGI-1' }] },
      }),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const systemMessages = result.llmRequest.messages.filter(
      (message) => message.role === 'system',
    );
    const joined = systemMessages.map((message) => message.content).join('\n\n');

    const boundaryIndex = joined.indexOf(SYSTEM_PROMPT_CACHE_BOUNDARY);
    const mcpIndex = joined.indexOf('Connected tool: Linear.');
    const skillIndex = joined.indexOf('<name>design-review</name>');

    expect(boundaryIndex).toBeGreaterThan(-1);
    expect(mcpIndex).toBeGreaterThan(-1);
    expect(skillIndex).toBeGreaterThan(-1);
    expect(mcpIndex).toBeLessThan(boundaryIndex);
    expect(skillIndex).toBeGreaterThan(boundaryIndex);
  });

  it('keeps recalled memory after the boundary even when mcp_context sets the leading message', async () => {
    mocks.loadPolicy.mockResolvedValue({
      enabled: true,
      generateFromHistory: false,
      allowToolAssistedGeneration: false,
    });
    mocks.scopedQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from user_memories')) {
        return [
          { content: 'User prefers morning meetings.', category: 'preference', pinned: true },
        ];
      }
      return [];
    });

    const result = await processRequest(
      chatRequestFor('assembly-order-2', {
        mcp_context: { resources: [{ connectorId: 'linear', uri: 'linear://issue/AGI-1' }] },
      }),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const systemMessages = result.llmRequest.messages.filter(
      (message) => message.role === 'system',
    );
    const joined = systemMessages.map((message) => message.content).join('\n\n');

    const boundaryIndex = joined.indexOf(SYSTEM_PROMPT_CACHE_BOUNDARY);
    const mcpIndex = joined.indexOf('Connected tool: Linear.');
    const memoryIndex = joined.indexOf('User prefers morning meetings.');

    expect(boundaryIndex).toBeGreaterThan(-1);
    expect(mcpIndex).toBeGreaterThan(-1);
    expect(memoryIndex).toBeGreaterThan(-1);
    expect(mcpIndex).toBeLessThan(boundaryIndex);
    expect(memoryIndex).toBeGreaterThan(boundaryIndex);
  });
});
