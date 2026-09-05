import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor } from '@agiworkforce/types';
import { SKILL_TOOL_NAME, type Skill } from '@agiworkforce/skills';

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

import { CreditService } from '@/lib/services/credit-service';
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

const CATALOG = [
  catalogSkill('design-review', 'Review interface polish before a release.'),
  catalogSkill('sales-forecast', 'Model quarterly pipeline revenue.'),
];

function chatRequestFor(key: string, content: string, body: Record<string, unknown> = {}) {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      messages: [{ role: 'user', content }],
      stream: true,
      ...body,
    }),
  });
}

function auth(overrides: Partial<AuthGateSuccess> = {}): AuthGateSuccess {
  return {
    ok: true,
    userId: 'user-pro',
    token: 'session-token',
    subscription: proSubscription,
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
  mocks.managedSkillCatalog.mockResolvedValue(CATALOG);
  mocks.enabledPluginIds.mockResolvedValue(new Set<string>());
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: 'user-pro',
      idempotencyKey: 'skill-offer',
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

describe('progressive-disclosure skill offer', () => {
  it('offers a relevance-matched skill when the caller sent no skill_name', async () => {
    const result = await processRequest(
      chatRequestFor('skill-offer-1', 'Review the interface polish for this release.'),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.chatRequest.tools?.map((tool) => tool.function.name) ?? []).toContain(
      SKILL_TOOL_NAME,
    );
    const systemMessages = result.chatRequest.messages
      .filter((message) => message.role === 'system')
      .map((message) => String(message.content));
    expect(systemMessages.some((content) => content.includes('<name>design-review</name>'))).toBe(
      true,
    );
    expect(systemMessages.some((content) => content.includes('sales-forecast'))).toBe(false);
    expect(JSON.stringify(result.chatRequest.messages)).not.toContain('PRIVATE SKILL BODY');
    expect(result.chatRequest.tool_choice).toBeUndefined();
  });

  it('leaves an unrelated prompt untouched', async () => {
    const result = await processRequest(
      chatRequestFor('skill-offer-2', 'What time does the museum close tomorrow?'),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatRequest.tools?.map((tool) => tool.function.name) ?? []).not.toContain(
      SKILL_TOOL_NAME,
    );
  });

  it('does not inject an unrequested tool into a developer API request', async () => {
    const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'skill-offer-3',
        'x-agi-surface': 'cli',
      },
      body: JSON.stringify({
        model: PRO_CHAT_MODEL,
        messages: [{ role: 'user', content: 'Review the interface polish for this release.' }],
        stream: true,
      }),
    });

    const result = await processRequest(request, auth({ surfaceClass: 'developer' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatRequest.tools?.map((tool) => tool.function.name) ?? []).not.toContain(
      SKILL_TOOL_NAME,
    );
  });

  it('still forces the explicitly selected skill instead of the matched one', async () => {
    const result = await processRequest(
      chatRequestFor('skill-offer-4', 'Review the interface polish for this release.', {
        skill_name: 'sales-forecast',
      }),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatRequest.tool_choice).toEqual({
      type: 'function',
      function: { name: SKILL_TOOL_NAME },
    });
    expect(String(result.chatRequest.messages[0]?.content)).toContain(
      '<selected_skill>sales-forecast</selected_skill>',
    );
  });
});

describe('per-user skill install overrides', () => {
  it('hides an uninstalled skill from the implicit offer', async () => {
    mocks.scopedQuery.mockImplementation(async (sql: string) =>
      sql.includes('user_settings')
        ? [{ settings: { skills: { installs: { 'design-review': false } } } }]
        : [],
    );

    const result = await processRequest(
      chatRequestFor('skill-offer-overrides-1', 'Review the interface polish for this release.'),
      auth(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const systemMessages = result.chatRequest.messages
      .filter((message) => message.role === 'system')
      .map((message) => String(message.content));
    expect(systemMessages.some((content) => content.includes('<name>design-review</name>'))).toBe(
      false,
    );
    expect(result.chatRequest.tools?.map((tool) => tool.function.name) ?? []).not.toContain(
      SKILL_TOOL_NAME,
    );
  });

  it('refuses to load an uninstalled skill by explicit name with the standard not-found response', async () => {
    mocks.scopedQuery.mockImplementation(async (sql: string) =>
      sql.includes('user_settings')
        ? [{ settings: { skills: { installs: { 'design-review': false } } } }]
        : [],
    );

    const result = await processRequest(
      chatRequestFor('skill-offer-overrides-2', 'Review the interface polish for this release.', {
        skill_name: 'design-review',
      }),
      auth(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(422);
    const body = (await result.response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('skill_not_found');
    expect(body.error.message).toBe('The selected skill is not available.');
  });

  it('keeps a plugin-owned skill loadable even when the entry is overridden false', async () => {
    const pluginSkill: Skill = {
      name: 'plugin-review',
      description: 'Plugin-provided review helper.',
      body: 'PLUGIN SKILL BODY',
      contentHash: `sha256:${'1'.repeat(64)}`,
      filePath: '/srv/private/skills/plugin-review/SKILL.md',
      source: 'managed-local',
      metadata: {},
      frontmatter: { plugin: 'demo-plugin' },
    };
    mocks.managedSkillCatalog.mockResolvedValue([...CATALOG, pluginSkill]);
    mocks.scopedQuery.mockImplementation(async (sql: string) =>
      sql.includes('user_settings')
        ? [{ settings: { skills: { installs: { 'plugin-review': false } } } }]
        : [],
    );

    const result = await processRequest(
      chatRequestFor('skill-offer-overrides-3', 'Use the plugin review helper.', {
        skill_name: 'plugin-review',
      }),
      auth(),
    );

    expect(result.ok).toBe(true);
  });

  it('leaves a default-installed skill with no override entry unchanged', async () => {
    const result = await processRequest(
      chatRequestFor('skill-offer-overrides-4', 'Review the interface polish for this release.', {
        skill_name: 'design-review',
      }),
      auth(),
    );

    expect(result.ok).toBe(true);
  });
});
