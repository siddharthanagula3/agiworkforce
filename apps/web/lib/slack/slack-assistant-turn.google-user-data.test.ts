import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildPlan: vi.fn(),
  classify: vi.fn(),
  keepsOutOfTraining: vi.fn(),
  trainingOptOut: vi.fn(),
  sideCallRouting: vi.fn(),
  resolveAutoRoute: vi.fn(),
  moderate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/request-processor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveManagedUsageLeaseSeconds: vi.fn(() => 120),
}));
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
  MAX_OUTPUT_TOKENS: 4096,
  approvalToolCalls: vi.fn(),
  buildScheduledToolPlan: mocks.buildPlan,
  runScheduledCompletion: vi.fn(),
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
vi.mock('@/lib/services/model-policy-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readModelPolicy: vi.fn(),
}));
vi.mock('@/lib/services/aggregator-routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dispatchProviderForSelectedRoute: vi.fn(() => 'openai'),
}));
vi.mock('@/lib/server/provider-training-opt-out', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  modelKeepsInputsOutOfTraining: mocks.keepsOutOfTraining,
}));
vi.mock('@/lib/server/side-call-training-policy', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sideCallRoutingRequest: mocks.sideCallRouting,
  sideCallTrainingOptOut: mocks.trainingOptOut,
}));
vi.mock('@/lib/moderation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  moderateManagedPrompt: mocks.moderate,
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  evaluateModelAccess: vi.fn(() => ({ allowed: true })),
  resolveAutoRoute: mocks.resolveAutoRoute,
}));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  canUseBillingPlanCapability: vi.fn(() => true),
  getModelMetadataById: vi.fn(() => ({ capabilities: { tools: true } })),
}));

const { runSlackAssistantTurn } = await import('./slack-assistant-turn');
const { GMAIL_CONNECTOR_ID } = await import('@/lib/connectors/gmail-actions');
const { GOOGLE_USER_DATA_SLACK_RESUME_MESSAGE } =
  await import('@/lib/connectors/google-user-data-runs');

const ROUTE = {
  provider: 'openai',
  providerModelId: 'provider-model',
  modelKey: 'model-1',
  routeId: 'route-1',
};

function tool(serverId: string, toolName: string) {
  return {
    serverId,
    toolName,
    qualifiedName: `mcp__${serverId}__${toolName}`,
    origin: 'connector',
  };
}

function turn(overrides: Record<string, unknown> = {}) {
  return {
    db: {} as never,
    userId: 'user-1',
    organizationId: null,
    runId: 'run-1',
    surface: 'direct_message' as const,
    mode: 'answer' as const,
    conversation: [{ role: 'user' as const, content: 'What is in my inbox?' }],
    channelContext: null,
    timeZone: null,
    signal: new AbortController().signal,
    ...overrides,
  } as Parameters<typeof runSlackAssistantTurn>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sideCallRouting.mockImplementation(async (_db, _user, request) => request);
  mocks.resolveAutoRoute.mockReturnValue({ status: 'ok', harnessId: 'openai/chat', ...ROUTE });
  mocks.keepsOutOfTraining.mockReturnValue(false);
  mocks.trainingOptOut.mockResolvedValue(false);
  mocks.buildPlan.mockResolvedValue({
    tools: [],
    mcpTools: [
      tool(GMAIL_CONNECTOR_ID, 'search_threads'),
      tool('google-calendar', 'list_events'),
      { ...tool('orgmcp-docs', 'read_doc'), googleUserData: true },
      tool('custom-sheetsproxy', 'read_range'),
      tool('linear', 'list_issues'),
    ],
    connectorPermissions: {},
    toolApprovalPolicy: 'auto_approve_read_only',
    webSearch: false,
    webFetch: false,
    codeExecution: false,
    withheldTools: [],
  });
  mocks.classify.mockReturnValue({ shouldRun: true, approvalMode: 'auto' });
  // Stops the turn right after the plan, before any memory read or model call.
  mocks.moderate.mockReturnValue({ allowed: false, refusal: 'stopped for the test' });
});

describe('runSlackAssistantTurn and Google user data', () => {
  it('never offers a Google connector or Google-hosted tool in a Slack direct message', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes('from public.user_custom_connectors')
        ? [{ short_id: 'sheetsproxy', url: 'https://sheets.googleapis.com/mcp' }]
        : [],
    );
    await expect(runSlackAssistantTurn(turn({ db: { query } }))).resolves.toMatchObject({
      kind: 'refused',
      code: 'content_policy_violation',
    });

    expect(mocks.buildPlan).toHaveBeenCalledWith(expect.objectContaining({ connectors: null }));
    const [offered] = mocks.classify.mock.calls[0]!;
    expect(offered).toEqual([tool('linear', 'list_issues')]);
  });

  it('refuses to resume on a model that may train when the run already read Google data', async () => {
    const outcome = await runSlackAssistantTurn(
      turn({
        resume: {
          decision: 'approved',
          checkpoint: {
            route: ROUTE,
            completedSteps: 1,
            sensitiveContextPresent: false,
            messages: [
              { role: 'user', content: 'What is in my inbox?' },
              {
                role: 'assistant',
                tool_calls: [
                  { id: 'c1', function: { name: `mcp__${GMAIL_CONNECTOR_ID}__search_threads` } },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(outcome).toEqual({
      kind: 'refused',
      code: 'no_training_model_available',
      message: GOOGLE_USER_DATA_SLACK_RESUME_MESSAGE,
    });
    expect(mocks.trainingOptOut).not.toHaveBeenCalled();
    expect(mocks.buildPlan).not.toHaveBeenCalled();
  });

  it('resumes a run with no Google tool call under the account preference', async () => {
    mocks.classify.mockReturnValue({ shouldRun: false, approvalMode: 'auto' });

    const outcome = await runSlackAssistantTurn(
      turn({
        resume: {
          decision: 'approved',
          checkpoint: {
            route: ROUTE,
            completedSteps: 1,
            sensitiveContextPresent: false,
            messages: [{ role: 'user', content: 'What is on Linear?' }],
          },
        },
      }),
    );

    expect(mocks.trainingOptOut).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({ kind: 'refused', code: 'model_cannot_resume' });
  });
});
