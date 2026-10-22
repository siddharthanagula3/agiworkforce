import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultModelFor } from '@agiworkforce/types';

type PreambleModule = typeof import('@/app/api/llm/v1/chat/completions/lib/capability-preamble');

const mocks = vi.hoisted(() => ({
  classify: vi.fn((..._args: unknown[]) => ({ shouldRun: false, approvalMode: 'auto' })),
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
  classifyToolLoopInputs: mocks.classify,
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

const MODEL = getDefaultModelFor('pro', 'chat');

const OPERATOR_TOOL = {
  serverId: 'docs',
  toolName: 'lookup',
  qualifiedName: 'mcp__docs__lookup',
  origin: 'operator',
};

function slackTurn(channelTools: readonly ('web' | 'code' | 'apps')[] | null) {
  return runSlackAssistantTurn({
    db: { query: vi.fn(async () => []) } as never,
    userId: 'user-1',
    organizationId: null,
    runId: 'run-1',
    surface: 'channel',
    mode: 'answer',
    channelTools,
    conversation: [{ role: 'user', content: 'Summarise the thread.' }],
    channelContext: null,
    timeZone: null,
    signal: new AbortController().signal,
  });
}

function planInput(): { webAllowed: boolean; codeAllowed: boolean } {
  return mocks.buildPlan.mock.calls[0]![0] as { webAllowed: boolean; codeAllowed: boolean };
}

function offeredAppTools(): unknown[] {
  return mocks.classify.mock.calls[0]![0] as unknown[];
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
    mcpTools: [OPERATOR_TOOL],
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

describe('the Slack channel tool allow-list', () => {
  it('offers every tool group when the channel has no allow-list', async () => {
    await slackTurn(null);

    expect(planInput()).toMatchObject({ webAllowed: true, codeAllowed: true });
    expect(offeredAppTools()).toEqual([OPERATOR_TOOL]);
  });

  it('offers only the groups the admin allowed', async () => {
    await slackTurn(['web']);

    expect(planInput()).toMatchObject({ webAllowed: true, codeAllowed: false });
    expect(offeredAppTools()).toEqual([]);
  });

  it('keeps connected apps when they are allowed without web or code', async () => {
    await slackTurn(['apps']);

    expect(planInput()).toMatchObject({ webAllowed: false, codeAllowed: false });
    expect(offeredAppTools()).toEqual([OPERATOR_TOOL]);
  });

  it('offers no tools at all for an empty allow-list, the unreadable-policy answer', async () => {
    await slackTurn([]);

    expect(planInput()).toMatchObject({ webAllowed: false, codeAllowed: false });
    expect(offeredAppTools()).toEqual([]);
  });
});
