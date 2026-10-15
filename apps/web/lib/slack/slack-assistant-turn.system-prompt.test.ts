import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultModelFor, getModelMetadataById } from '@agiworkforce/types';

import {
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  chatSystemPromptSection,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';

type PreambleModule = typeof import('@/app/api/llm/v1/chat/completions/lib/capability-preamble');

const mocks = vi.hoisted(() => ({
  buildPlan: vi.fn(),
  resolveAutoRoute: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/capability-preamble', async (importOriginal) => {
  const actual = await importOriginal<PreambleModule>();
  return { ...actual, buildCapabilityPreamble: vi.fn(actual.buildCapabilityPreamble) };
});
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-providers', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADAPTER_PROVIDERS: { openai: {} },
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop-routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  classifyToolLoopInputs: vi.fn(() => ({ shouldRun: false, approvalMode: 'auto' })),
}));
vi.mock('@/lib/services/scheduled-agent-executor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildScheduledToolPlan: mocks.buildPlan,
  runScheduledCompletion: mocks.complete,
  runScheduledToolLoop: vi.fn(),
  withheldToolsDirective: vi.fn(() => null),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEntitlementBundle: vi.fn(async () => ({ plan: 'pro', subscription: null })),
}));
vi.mock('@/lib/services/managed-compute-access', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  evaluateManagedComputeAccess: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/services/aggregator-routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dispatchProviderForSelectedRoute: vi.fn(() => 'openai'),
}));
vi.mock('@/lib/server/side-call-training-policy', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sideCallRoutingRequest: vi.fn(async (_db: unknown, _user: unknown, request: unknown) => request),
  sideCallTrainingOptOut: vi.fn(async () => false),
}));
vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  enforceManagedContentSafetyPreference: vi.fn(async () => ({ enabled: false, allowed: true })),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveManagedUsageRequest: mocks.reserve,
  markManagedUsageProviderStarted: vi.fn(async () => undefined),
  finalizeManagedUsageRequest: vi.fn(async () => undefined),
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  evaluateModelAccess: vi.fn(() => ({ allowed: true })),
  resolveAutoRoute: mocks.resolveAutoRoute,
}));

const { runSlackAssistantTurn } = await import('./slack-assistant-turn');
const { buildCapabilityPreamble, servingModelFor } =
  await import('@/app/api/llm/v1/chat/completions/lib/capability-preamble');

const MODEL = getDefaultModelFor('pro', 'chat');

function slackTurn(question: string) {
  return runSlackAssistantTurn({
    db: { query: vi.fn(async () => []) } as never,
    userId: 'user-1',
    organizationId: null,
    runId: 'run-1',
    surface: 'channel',
    mode: 'answer',
    conversation: [{ role: 'user', content: question }],
    channelContext: null,
    timeZone: null,
    signal: new AbortController().signal,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAutoRoute.mockReturnValue({
    status: 'selected',
    harnessId: 'openai/chat',
    provider: 'openai',
    providerModelId: 'provider-model',
    modelKey: MODEL,
    routeId: 'route-1',
  });
  mocks.buildPlan.mockResolvedValue({
    tools: [],
    mcpTools: [],
    connectorPermissions: {},
    toolApprovalPolicy: 'auto_approve_read_only',
    webSearch: false,
    webFetch: false,
    codeExecution: false,
    withheldTools: [],
  });
  mocks.reserve.mockResolvedValue({
    db: {},
    userId: 'user-1',
    idempotencyKey: 'slack-run:run-1',
    requestHash: 'request-hash',
    leaseToken: 'lease-1',
    estimatedCostMicrousd: 0,
  });
  mocks.complete.mockResolvedValue({
    text: 'An answer.',
    costMicrousd: 0,
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    toolsUsed: [],
  });
});

describe('the Slack answer system prompt', () => {
  it('tells the preamble which model the Slack route serves, picked by the app', async () => {
    const metadata = getModelMetadataById(MODEL);
    if (!metadata) throw new Error('the pro chat model is not in the catalog');

    const outcome = await slackTurn('Which model are you?');

    expect(outcome).toMatchObject({ kind: 'answered' });
    const servingModel = servingModelFor(MODEL, { kind: 'assigned' });
    expect(servingModel).toMatchObject({
      kind: 'model',
      name: metadata.name,
      choice: { kind: 'assigned' },
    });
    expect(vi.mocked(buildCapabilityPreamble)).toHaveBeenCalledWith(
      expect.objectContaining({ servingModel }),
    );
  });

  it('names the assistant once, through the chat system prompt', async () => {
    await slackTurn('Who are you?');

    const [{ messages }] = mocks.complete.mock.calls[0] as [{ messages: { content: string }[] }];
    const system = messages[0]?.content ?? '';
    const identity = chatSystemPromptSection(
      chatSystemPromptSections(CHAT_SYSTEM_PROMPT_PINNED_VERSION),
      'identity',
    );

    expect(system).toContain(identity);
    expect(system.match(/\bYou are\b/gu)).toHaveLength(
      identity.match(/\bYou are\b/gu)?.length ?? 0,
    );
  });
});
