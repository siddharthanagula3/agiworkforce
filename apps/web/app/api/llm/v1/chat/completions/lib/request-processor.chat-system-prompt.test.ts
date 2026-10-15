import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  DEFAULT_WORKSPACE_CONTROLS,
  getDefaultAutoRoutingProfile,
  getDefaultModelFor,
  getModelMetadataById,
  ROUTING_PROFILE_CHOICE_OPTIONS,
} from '@agiworkforce/types';
import type { Skill } from '@agiworkforce/skills';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';
import {
  CHAT_SYSTEM_PROMPT_ID,
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  chatSystemPromptSection,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';
import { PROMPT_FLAG_PREFIX, promptFlagKey, promptFlagVariant } from '@/lib/prompts/prompt-flags';
import type { FlagEvaluation } from '@/lib/feature-flags/evaluate-flags';
import { capabilityKillSwitchKey } from '@/lib/feature-flags/kill-switches';
type ScanModule0 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule1 = typeof import('./chat-attachment-hydration');
type ScanModule2 = typeof import('@/lib/services/managed-memory-context-service');
type ScanModule3 = typeof import('@/lib/server/user-identity');
type ScanModule4 = typeof import('@/lib/services/managed-usage-request-service');
type ScanModule5 = typeof import('@/lib/services/skill-catalog-service');
type ScanModule6 = typeof import('@/lib/services/plugin-installation-service');
type ScanModule7 = typeof import('@/lib/feature-flags/flag-evaluation-service');
type ScanModule8 = typeof import('@/lib/services/model-rollout/routing-decision-trace-service');
type ScanModule9 = typeof import('@/lib/services/turn-context-service');

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');
const CONVERSATION_ID = '9b1f3c2e-6d4a-4f7b-8c1e-2a3b4c5d6e7f';
const WORKSPACE_ID = '3c6f1d2a-8b4e-4f7a-9c1d-5e2b7a9f0c34';
const PRECEDENCE_VERSION = 2;
const IDENTITY_VERSION = 8;

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
  managedSkillCatalog: vi.fn(),
  enabledPluginIds: vi.fn(),
  promptFlags: vi.fn(),
  killSwitches: vi.fn(),
  persistRoutingDecision: vi.fn(),
  organizationId: vi.fn((): string | null => null),
  turnContext: vi.fn(),
}));

const turnContextService = vi.hoisted(() => ({
  resolve: null as ScanModule9['resolveInteractiveTurnContext'] | null,
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-pro',
    organizationId: mocks.organizationId(),
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, enforceManagedContentSafetyPreference: mocks.enforceSafety };
});

vi.mock('./chat-attachment-hydration', async (importOriginal) => {
  const actual = await importOriginal<ScanModule1>();
  return { ...actual, hydrateChatAttachments: mocks.hydrate };
});

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return { ...actual, loadManagedMemoryPolicy: mocks.loadPolicy };
});

vi.mock('@/lib/server/user-identity', async (importOriginal) => {
  const actual = await importOriginal<ScanModule3>();
  return { ...actual, buildCustomInstructionsPreamble: mocks.customInstructions };
});

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule4>();
  return { ...actual, reserveManagedUsageRequest: mocks.reserveManagedUsage };
});

vi.mock('@/lib/services/skill-catalog-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule5>();
  return {
    ...actual,
    getManagedSkillCatalog: mocks.managedSkillCatalog,
    getManagedSkillCatalogForPlugins: mocks.managedSkillCatalog,
    loadSelectableSkillCatalog: async (params: {
      loadEnabledPluginIds: () => Promise<ReadonlySet<string>>;
      loadInstallOverrides: () => Promise<ReadonlyMap<string, boolean>>;
    }) =>
      actual.filterSkillsByInstallOverrides(
        await mocks.managedSkillCatalog(await params.loadEnabledPluginIds()),
        await params.loadInstallOverrides(),
      ),
  };
});

vi.mock('@/lib/services/plugin-installation-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule6>();
  return { ...actual, listEnabledPluginIds: mocks.enabledPluginIds };
});

vi.mock('@/lib/feature-flags/flag-evaluation-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule7>();
  return {
    ...actual,
    evaluateFlagsForSubject: async (
      _subject: unknown,
      options?: { keyPrefix?: string; keyPrefixes?: readonly string[] },
    ): Promise<Record<string, FlagEvaluation>> =>
      options?.keyPrefix === PROMPT_FLAG_PREFIX
        ? mocks.promptFlags()
        : options?.keyPrefixes
          ? mocks.killSwitches()
          : {},
  };
});

vi.mock('@/lib/services/model-rollout/routing-decision-trace-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule8>();
  return { ...actual, persistRoutingDecision: mocks.persistRoutingDecision };
});

vi.mock('@/lib/services/turn-context-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule9>();
  turnContextService.resolve = actual.resolveInteractiveTurnContext;
  return { ...actual, resolveInteractiveTurnContext: mocks.turnContext };
});

const finalFit = vi.hoisted(() => ({
  sizing: null as null | {
    budgetTokens: number;
    measure: (message: { role: string; content: string }) => number;
  },
}));

vi.mock('./context-compaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./context-compaction')>();
  return {
    ...actual,
    compactContextWindow: (input: Parameters<typeof actual.compactContextWindow>[0]) =>
      actual.compactContextWindow(finalFit.sizing ? { ...input, sizing: finalFit.sizing } : input),
  };
});

import { CreditService } from '@/lib/services/credit-service';
import { processRequest } from './request-processor';
import type { AuthGateSuccess } from './auth-gate';

type RlsDbModule = typeof import('@/lib/server/rls-db');

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

const CATALOG: Skill[] = [];

function chatSystemFlag(version: number): Record<string, FlagEvaluation> {
  const key = promptFlagKey(CHAT_SYSTEM_PROMPT_ID);
  return {
    [key]: {
      key,
      variant: promptFlagVariant(version),
      enabled: true,
      reason: 'rule',
      ruleId: 'internal-staff',
      version: 1,
    },
  };
}

function chatRequestFor(
  key: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
      ...headers,
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      messages: [{ role: 'user', content: 'Who are you, and which model are you running on?' }],
      stream: true,
      ...body,
    }),
  });
}

function auth(): AuthGateSuccess {
  return { ok: true, userId: 'user-pro', token: 'session-token', subscription: proSubscription };
}

async function systemText(
  key: string,
  body: Record<string, unknown> = {},
  options: Parameters<typeof processRequest>[2] = {},
): Promise<string> {
  const result = await processRequest(chatRequestFor(key, body), auth(), options);
  expect(result.ok).toBe(true);
  if (!result.ok) return '';
  return result.llmRequest.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
}

function temporaryConversationRows(sql: string) {
  return sql.includes('from web_conversations')
    ? [
        {
          id: CONVERSATION_ID,
          project_id: null,
          is_temporary: true,
          selected_route_id: null,
          study_topic: null,
          study_mode: null,
          study_level: null,
        },
      ]
    : [];
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();
  finalFit.sizing = null;
  vi.stubEnv(PLATFORM_ADMIN_ENV_VAR, 'user-pro');

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue({
    enabled: true,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
    searchPastChats: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
  mocks.managedSkillCatalog.mockResolvedValue(CATALOG);
  mocks.enabledPluginIds.mockResolvedValue(new Set<string>());
  mocks.promptFlags.mockResolvedValue({});
  mocks.killSwitches.mockReturnValue({});
  mocks.organizationId.mockReturnValue(null);
  mocks.turnContext.mockImplementation(
    (...args: Parameters<ScanModule9['resolveInteractiveTurnContext']>) =>
      turnContextService.resolve!(...args),
  );
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: 'user-pro',
      idempotencyKey: 'chat-setup',
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the chat system prompt version a prompt flag selects', () => {
  it('serves a customer the pinned version when the flag selects one kept on internal', async () => {
    vi.stubEnv(PLATFORM_ADMIN_ENV_VAR, '');
    mocks.promptFlags.mockResolvedValue(chatSystemFlag(IDENTITY_VERSION));

    const joined = await systemText('chat-system-prompt-customer');

    expect(joined).toContain(
      chatSystemPromptSection(
        chatSystemPromptSections(CHAT_SYSTEM_PROMPT_PINNED_VERSION),
        'identity',
      ),
    );
    expect(mocks.persistRoutingDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIds: expect.arrayContaining([
          `${CHAT_SYSTEM_PROMPT_ID}@${CHAT_SYSTEM_PROMPT_PINNED_VERSION}`,
        ]),
      }),
    );
  });

  it('serves the flagged version and stamps it on the routing trace', async () => {
    mocks.promptFlags.mockResolvedValue(chatSystemFlag(PRECEDENCE_VERSION));

    const joined = await systemText('chat-system-prompt-1');

    expect(joined).toContain('Instruction precedence, highest first');
    expect(mocks.persistRoutingDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIds: expect.arrayContaining([`${CHAT_SYSTEM_PROMPT_ID}@${PRECEDENCE_VERSION}`]),
      }),
    );
  });

  it('serves and stamps the pinned version when no flag selects another', async () => {
    const joined = await systemText('chat-system-prompt-2');

    expect(joined).toContain('You are AGI Workforce, an AI assistant.');
    expect(joined).toContain(
      chatSystemPromptSection(
        chatSystemPromptSections(CHAT_SYSTEM_PROMPT_PINNED_VERSION),
        'identity',
      ),
    );
    expect(mocks.persistRoutingDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIds: expect.arrayContaining([
          `${CHAT_SYSTEM_PROMPT_ID}@${CHAT_SYSTEM_PROMPT_PINNED_VERSION}`,
        ]),
      }),
    );
  });
});

describe('the identity and chat setup the flagged identity version reports', () => {
  beforeEach(() => {
    mocks.promptFlags.mockResolvedValue(chatSystemFlag(IDENTITY_VERSION));
  });

  it('names the assistant AGI and the model serving the turn', async () => {
    const result = await processRequest(chatRequestFor('chat-system-prompt-3'), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const joined = result.llmRequest.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const servedName = getModelMetadataById(result.chatRequest.model)?.name;

    expect(servedName).toBeTruthy();
    expect(joined).toContain('You are AGI, the AI assistant in AGI Workforce');
    expect(joined).toContain(`This turn runs on ${servedName}`);
    expect(mocks.persistRoutingDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        promptIds: expect.arrayContaining([`${CHAT_SYSTEM_PROMPT_ID}@${IDENTITY_VERSION}`]),
      }),
    );
  });

  it('tells the model memory is on for an ordinary chat with memory switched on', async () => {
    const joined = await systemText('chat-system-prompt-4');

    expect(joined).toContain('- Memory is on.');
    expect(joined).not.toContain('- This is a temporary chat.');
  });

  it('replaces the memory text with the temporary chat promise in a temporary chat', async () => {
    mocks.scopedQuery.mockImplementation(async (sql: string) => temporaryConversationRows(sql));

    const joined = await systemText('chat-system-prompt-5', { conversation_id: CONVERSATION_ID });

    expect(joined).toContain('- This is a temporary chat.');
    expect(joined).not.toContain('- Memory is on.');
    expect(joined).not.toContain("saved in the user's chat history");
  });

  it('claims no connected app when the client reports none is on for the chat', async () => {
    const joined = await systemText('chat-system-prompt-6', { connector_tools_enabled: false });

    expect(joined).toContain('- No connected apps are on for this chat');
    expect(joined).not.toContain('reach you as tools named after each app');
  });

  it('claims no connected app when the connector switch is closed for the account', async () => {
    const key = capabilityKillSwitchKey('canUseConnectors');
    mocks.killSwitches.mockReturnValue({
      [key]: { key, variant: 'off', enabled: false, reason: 'rule', ruleId: 'cohort', version: 1 },
    });

    const result = await processRequest(chatRequestFor('chat-system-prompt-18'), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const joined = result.llmRequest.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    expect(result.connectorsAllowed).toBe(false);
    expect(joined).not.toContain('reach you as tools named after each app');
  });

  it('claims no connected app when the account turned lockdown mode on', async () => {
    mocks.scopedQuery.mockImplementation(async (sql: string) =>
      sql.includes('from public.user_settings')
        ? [{ settings: { lockdown: { enabled: true } } }]
        : [],
    );

    const joined = await systemText('chat-system-prompt-19');

    expect(joined).not.toContain('reach you as tools named after each app');
  });

  it('reports personalization switched off for an unpersonalized chat', async () => {
    mocks.customInstructions.mockResolvedValue('Call me Ada.');

    const joined = await systemText('chat-system-prompt-7', { personalization: false });

    expect(joined).toContain('- Personalization is off for this chat');
    expect(joined).toContain('- Memory is off for this chat');
    expect(joined).not.toContain('Call me Ada.');
  });

  it('reports applied personalization when the account has custom instructions', async () => {
    mocks.customInstructions.mockResolvedValue('Call me Ada.');

    const joined = await systemText('chat-system-prompt-8');

    expect(joined).toContain("- The user's personalization");
    expect(joined).toContain('Call me Ada.');
  });

  it('says memory could not be loaded, not that it is off, when the memory read fails', async () => {
    mocks.loadPolicy.mockRejectedValue(new Error('connection reset'));

    const joined = await systemText('chat-system-prompt-11');

    expect(joined).toContain('- Memory could not be loaded for this message');
    expect(joined).toContain("is not the user's setting, so do not tell them to change it");
    expect(joined).not.toContain('- Memory is off');
  });

  it.each([{ memory_enabled: false }, { personalization: false }])(
    'says memory is off for the chat, not that it failed to load, when the user switched it off (%o)',
    async (body) => {
      mocks.loadPolicy.mockRejectedValue(new Error('connection reset'));

      const joined = await systemText(`chat-system-prompt-16-${Object.keys(body).join('')}`, body);

      expect(joined).toContain('- Memory is off for this chat');
      expect(joined).not.toContain('- Memory could not be loaded for this message');
      expect(joined).not.toContain("is not the user's setting, so do not tell them to change it");
    },
  );

  it('says the workspace administrator turned memory off when the workspace closed it', async () => {
    mocks.organizationId.mockReturnValue(WORKSPACE_ID);
    mocks.loadPolicy.mockResolvedValue({
      enabled: false,
      generateFromHistory: false,
      allowToolAssistedGeneration: false,
      searchPastChats: false,
    });
    mocks.scopedQuery.mockImplementation(async (sql: string) =>
      sql.includes('from organization_admin_policies')
        ? [{ allow_memory: false, retention_days: null, retention_enforced: false }]
        : [],
    );

    const joined = await systemText('chat-system-prompt-12');

    expect(joined).toContain("- The user's workspace administrator has turned memory off");
    expect(joined).not.toContain('- Memory is off, so you cannot see or save memories');
  });

  it('says memory could not be loaded, not that the workspace closed it, when the workspace policy read fails', async () => {
    mocks.organizationId.mockReturnValue(WORKSPACE_ID);
    mocks.loadPolicy.mockResolvedValue({
      enabled: false,
      generateFromHistory: false,
      allowToolAssistedGeneration: false,
      searchPastChats: false,
    });
    mocks.scopedQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from organization_admin_policies')) throw new Error('connection reset');
      return [];
    });

    const joined = await systemText('chat-system-prompt-17');

    expect(joined).toContain('- Memory could not be loaded for this message');
    expect(joined).not.toContain('workspace administrator has turned memory off');
    expect(joined).not.toContain('- Memory is off, so you cannot see or save memories');
  });

  it('says personalization could not be loaded when the custom instructions read fails', async () => {
    mocks.customInstructions.mockRejectedValue(new Error('connection reset'));

    const joined = await systemText('chat-system-prompt-13');

    expect(joined).toContain("- The user's personalization could not be loaded for this message");
    expect(joined).not.toContain('- No custom instructions or other personalization apply');
  });

  it('gives a mobile turn the mobile Settings rows', async () => {
    const result = await processRequest(chatRequestFor('chat-system-prompt-14'), {
      ...auth(),
      boundSurface: 'mobile',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const joined = result.llmRequest.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    expect(joined).toContain('Personalization for their name, custom instructions');
    expect(joined).toContain('point them to Help Center in Settings');
  });

  it('sends a CLI turn to the web app Settings without picker or composer guidance', async () => {
    const result = await processRequest(
      chatRequestFor('chat-system-prompt-15', {}, { 'x-agi-surface': 'cli' }),
      { ...auth(), surfaceClass: 'developer' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const joined = result.llmRequest.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    expect(joined).toContain('in Settings in the AGI Workforce web app');
    expect(joined).not.toContain('model picker');
  });

  it('names the routing profile the user picked instead of calling it Auto', async () => {
    const auto = getDefaultAutoRoutingProfile();
    const best = ROUTING_PROFILE_CHOICE_OPTIONS.find((option) => option.choice === 'quality');
    if (!best) throw new Error('the quality routing profile has no picker option');

    const joined = await systemText('chat-system-prompt-9', {
      model: auto.id,
      routing_profile: best.choice,
    });

    expect(joined).toContain(
      `The user selected ${best.label}, which picks the model for each message`,
    );
    expect(joined).not.toContain(`The user selected ${auto.label},`);
  });

  it('says the workspace default answers a member who left the model on Auto', async () => {
    const auto = getDefaultAutoRoutingProfile();
    const workspaceDefault = getModelMetadataById(PRO_CHAT_MODEL);
    if (!workspaceDefault) throw new Error('the pro chat model is not in the catalog');

    const joined = await systemText(
      'chat-system-prompt-10',
      { model: auto.id },
      {
        workspaceControls: {
          ...DEFAULT_WORKSPACE_CONTROLS,
          appliedOverrideIds: [],
          defaultModelId: PRO_CHAT_MODEL,
        },
      },
    );

    expect(joined).toContain(`This turn runs on ${workspaceDefault.name}`);
    expect(joined).toContain(
      `which the workspace administrator set as the default model for the user's workspace; it answers whenever the user selects ${auto.label}.`,
    );
    expect(joined).not.toContain('which picks the model for each message');
  });
});

describe('the chat setup chat prompt v9 reports for the turn', () => {
  beforeEach(() => {
    mocks.promptFlags.mockResolvedValue(chatSystemFlag(9));
  });

  it('says connected apps are not available when the connector switch is closed', async () => {
    const key = capabilityKillSwitchKey('canUseConnectors');
    mocks.killSwitches.mockReturnValue({
      [key]: { key, variant: 'off', enabled: false, reason: 'rule', ruleId: 'cohort', version: 1 },
    });

    const joined = await systemText('chat-system-prompt-22');

    expect(joined).toContain(
      '- Connected apps are not available on this turn, even ones the user has connected',
    );
    expect(joined).not.toContain('reach you as tools named after each app');
  });

  it('says lockdown mode keeps connected apps out when the account turned it on', async () => {
    mocks.scopedQuery.mockImplementation(async (sql: string) =>
      sql.includes('from public.user_settings')
        ? [{ settings: { lockdown: { enabled: true } } }]
        : [],
    );

    const joined = await systemText('chat-system-prompt-23');

    expect(joined).toContain('- Lockdown mode is on for this account');
    expect(joined).not.toContain('reach you as tools named after each app');
  });

  it('says memory is off for the workspace without blaming an administrator who never acted', async () => {
    mocks.organizationId.mockReturnValue(WORKSPACE_ID);
    mocks.loadPolicy.mockResolvedValue({
      enabled: false,
      generateFromHistory: false,
      allowToolAssistedGeneration: false,
      searchPastChats: false,
    });
    mocks.scopedQuery.mockResolvedValue([]);

    const joined = await systemText('chat-system-prompt-24');

    expect(joined).toContain(
      "- Memory is off for the user's workspace, and only a workspace administrator can turn it on",
    );
    expect(joined).not.toContain('administrator has turned memory off');
  });
});

describe("the project's other chats a project chat receives under chat prompt v10", () => {
  const PROJECT_ID = '6a1d4c2e-7b3f-4e5a-9d8c-1f2e3a4b5c6d';
  const OTHER_CONVERSATION_ID = '2e4f6a8b-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
  const SIBLING_EXCERPT = 'My hotel budget is 300 dollars a night.';
  const SEARCH_PAST_CHATS_ON = {
    enabled: true,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
    searchPastChats: true,
  };

  function projectConversationRows(sql: string) {
    if (sql.includes('sibling_candidates')) {
      return [
        {
          id: OTHER_CONVERSATION_ID,
          title: 'Hotel budget',
          updated_at: '2026-10-01T00:00:00.000Z',
          role: 'user',
          content: SIBLING_EXCERPT,
          created_at: '2026-10-01T00:00:00.000Z',
        },
      ];
    }
    if (sql.includes('from web_conversations')) {
      return [
        {
          id: CONVERSATION_ID,
          project_id: PROJECT_ID,
          is_temporary: false,
          selected_route_id: null,
          study_topic: null,
          study_mode: null,
          study_level: null,
        },
      ];
    }
    if (sql.includes('from user_projects')) {
      return [
        {
          id: PROJECT_ID,
          name: 'Trip',
          description: null,
          instructions: null,
          organization_id: null,
        },
      ];
    }
    return [];
  }

  beforeEach(() => {
    mocks.promptFlags.mockResolvedValue(chatSystemFlag(10));
    mocks.scopedQuery.mockImplementation(async (sql: string) => projectConversationRows(sql));
  });

  it('gives a project chat its other chats when search past chats is on', async () => {
    mocks.loadPolicy.mockResolvedValue(SEARCH_PAST_CHATS_ON);

    const joined = await systemText('chat-system-prompt-20', { conversation_id: CONVERSATION_ID });

    expect(joined).toContain(SIBLING_EXCERPT);
    expect(joined).toContain(
      "- Excerpts from the user's other chats in this project appear further down.",
    );
    expect(joined).toContain('- Search past chats is on');
  });

  it('keeps them out when search past chats is off, as the setup line says', async () => {
    const joined = await systemText('chat-system-prompt-21', { conversation_id: CONVERSATION_ID });

    expect(joined).not.toContain(SIBLING_EXCERPT);
    expect(joined).not.toContain('in this project appear further down');
    expect(joined).toContain(
      "- Search past chats is off, so you cannot see the user's other chats.",
    );
  });

  it('keeps them out of a chat switched off from memory', async () => {
    mocks.loadPolicy.mockResolvedValue(SEARCH_PAST_CHATS_ON);

    const joined = await systemText('chat-system-prompt-25', {
      conversation_id: CONVERSATION_ID,
      memory_enabled: false,
    });

    expect(joined).not.toContain(SIBLING_EXCERPT);
    expect(joined).toContain(
      '- Memory is off for this chat, so saved memories and other chats are not used here',
    );
  });

  it('sends no model request when the turn context cannot be assembled', async () => {
    mocks.loadPolicy.mockResolvedValue(SEARCH_PAST_CHATS_ON);
    mocks.turnContext.mockRejectedValueOnce(new Error('context engine unavailable'));

    const result = await processRequest(
      chatRequestFor('chat-system-prompt-26', { conversation_id: CONVERSATION_ID }),
      auth(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
    expect((await result.response.json()).error.code).toBe('project_context_load_failed');
  });
});

describe('the product overview chat prompt v7 renders for the turn (PC-F05)', () => {
  const v7 = chatSystemPromptSections(7);
  const overviewLine = (capability: string) =>
    `- ${chatSystemPromptSection(v7, `product_capability.${capability}`)}`;

  beforeEach(() => {
    mocks.promptFlags.mockResolvedValue(chatSystemFlag(7));
    vi.stubEnv('AGI_E2B_EXECUTION', '1');
    vi.stubEnv('E2B_API_KEY', 'e2b-test-key');
  });

  it('lists Deep Research, web search and code runs when nothing switched them off', async () => {
    const joined = await systemText('chat-system-prompt-pcf05-open');

    for (const capability of ['canUseDeepResearch', 'canUseWebSearch', 'canUseCloudExecution']) {
      expect(joined).toContain(overviewLine(capability));
    }
  });

  it('leaves out a feature the workspace administrator turned off', async () => {
    const joined = await systemText(
      'chat-system-prompt-pcf05-workspace',
      {},
      {
        workspaceControls: {
          ...DEFAULT_WORKSPACE_CONTROLS,
          appliedOverrideIds: [],
          featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, research: false },
        },
      },
    );

    expect(joined).not.toContain(overviewLine('canUseDeepResearch'));
    expect(joined).toContain(overviewLine('canUseWebSearch'));
  });

  it('leaves out a capability an operator switched off', async () => {
    const key = capabilityKillSwitchKey('canUseWebSearch');
    mocks.killSwitches.mockReturnValue({
      [key]: { key, variant: 'off', enabled: false, reason: 'rule', ruleId: 'cohort', version: 1 },
    });

    const joined = await systemText('chat-system-prompt-pcf05-operator');

    expect(joined).not.toContain(overviewLine('canUseWebSearch'));
    expect(joined).toContain(overviewLine('canUseDeepResearch'));
  });

  it('leaves out code runs the account turned off in its own settings', async () => {
    mocks.scopedQuery.mockImplementation(async (sql: string) =>
      sql.includes('from public.user_settings')
        ? [{ settings: { capabilities: { cloudCodeExecution: false } } }]
        : [],
    );

    const joined = await systemText('chat-system-prompt-pcf05-user');

    expect(joined).not.toContain(overviewLine('canUseCloudExecution'));
    expect(joined).toContain(overviewLine('canUseDeepResearch'));
  });
});

describe('the past chats a turn shows after the final fit (PC-F08)', () => {
  it('shows only the past chats whose excerpt the fit still sent', async () => {
    const pastChatPrompt = [
      'Excerpts from the user’s other chats follow.',
      '<past_chats>',
      `[{"title":"A","role":"user","excerpt":"first ${'x '.repeat(1_000)}"},{"title":"B","role":"user","excerpt":"second"},{"title":"C","role":"user","excerpt":"third"}]`,
      '</past_chats>',
    ].join('\n');
    const pastChatSources = ['a', 'b', 'c'].map((id) => ({
      id: `source-${id}`,
      conversationId: `conversation-${id}`,
      messageId: `message-${id}`,
      title: id,
      createdAt: '2026-10-01T10:00:00.000Z',
    }));
    mocks.turnContext.mockResolvedValue({
      projectBlocks: [],
      projectCitations: [],
      pastChatPrompt,
      pastChatSources,
      memoryPrompt: null,
      memories: [],
      memoryCitations: [],
      manifest: null,
    });
    finalFit.sizing = {
      budgetTokens: 600,
      measure: (message) =>
        message.role === 'system' && message.content.startsWith(SYSTEM_PROMPT_CACHE_BOUNDARY)
          ? message.content.length
          : 0,
    };

    const result = await processRequest(chatRequestFor('chat-system-prompt-pcf08'), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contextTrim?.truncatedMessages).toBe(1);
    expect(result.pastChatSources?.map((source) => source.messageId)).toEqual(['message-a']);
  });
});
