import { beforeEach, describe, expect, it, vi } from 'vitest';

type McpExecutorModule = typeof import('@/lib/mcp-tool-executor');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type ToolAccessPolicyModule = typeof import('@/lib/server/tool-access-policy');
type ToolShortlistModule =
  typeof import('@/lib/services/semantic-decisions/consumers/tool-shortlist');

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

vi.mock('@/lib/mcp-tool-executor', async () => {
  const actual = await vi.importActual<McpExecutorModule>('@/lib/mcp-tool-executor');
  return { ...actual, executeWebMcpTool: vi.fn(), getWebMcpCatalog: vi.fn() };
});

const toolAccess = vi.hoisted(() => ({
  resolve: vi.fn(async (): Promise<'auto' | 'on_demand' | 'always'> => 'auto'),
}));
vi.mock('@/lib/server/tool-access-policy', async (importOriginal) => ({
  ...(await importOriginal<ToolAccessPolicyModule>()),
  resolveToolAccessMode: (...args: unknown[]) => toolAccess.resolve(...(args as [])),
}));

const shadow = vi.hoisted(() => ({ schedule: vi.fn() }));
vi.mock('@/lib/services/semantic-decisions/consumers/tool-shortlist', async (importOriginal) => ({
  ...(await importOriginal<ToolShortlistModule>()),
  scheduleToolShortlistShadow: (...args: unknown[]) => shadow.schedule(...args),
}));

import type { ToolShortlistShadowInput } from '@/lib/services/semantic-decisions/consumers/tool-shortlist';
import type { SemanticDecisionScope } from '@/lib/services/semantic-decisions/shadow';

import { connectorToolPermissionsFromEntries } from './connector-tool-permissions';
import type { ProcessedRequest } from './request-processor';
import { runToolLoop } from './tool-loop';
import { toolSchemaBudgetFor } from './tool-schema-loader';

const PULL_REQUEST_TOOL = 'mcp__github__get_pull_request_diff';
const SLACK_TOOL = 'mcp__slack__post_channel_message';
const JIRA_TOOL = 'mcp__jira__create_issue';

function connectorToolDefs() {
  return [
    {
      qualifiedName: PULL_REQUEST_TOOL,
      serverId: 'github',
      toolName: 'get_pull_request_diff',
      description: 'Read the diff of a pull request.',
      origin: 'connector' as const,
      inputSchema: {},
    },
    {
      qualifiedName: SLACK_TOOL,
      serverId: 'slack',
      toolName: 'post_channel_message',
      description: 'Post a message into a channel.',
      origin: 'connector' as const,
      inputSchema: {},
    },
    {
      qualifiedName: JIRA_TOOL,
      serverId: 'jira',
      toolName: 'create_issue',
      description: 'File a ticket on a board.',
      origin: 'connector' as const,
      inputSchema: {},
    },
  ];
}

const SCOPE = { requestId: 'req-shadow-1', userId: 'tool-access-user' } as SemanticDecisionScope;

function makeProcessed(decisionScope?: SemanticDecisionScope): ProcessedRequest {
  const messages = [{ role: 'user' as const, content: 'read the pull request diff for me' }];
  return {
    chatSurface: 'web' as const,
    requestId: 'req-shadow-1',
    chatRequest: { model: 'gpt-test', messages, stream: true } as never,
    conversationId: undefined,
    requestedModel: 'gpt-test',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gpt-test',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: { model: 'gpt-test', messages, max_tokens: 1000, stream: true },
    ...(decisionScope ? { decisionScope } : {}),
  } as ProcessedRequest;
}

function answer(): ReadableStream {
  const encoder = new TextEncoder();
  const lines = [
    { choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: null }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ].map((payload) => `data: ${JSON.stringify({ ...payload, model: 'test-model' })}\n\n`);
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

async function runTurn(
  processed: ProcessedRequest,
  options: Partial<Parameters<typeof runToolLoop>[1]> = {},
): Promise<void> {
  mockBuildToolLoopStream.mockResolvedValueOnce(answer());
  for await (const _value of runToolLoop(processed, {
    approvalMode: 'auto',
    mcpTools: connectorToolDefs(),
    userId: 'tool-access-user',
    ...options,
  })) {
    void _value;
  }
}

function scheduledInput(): ToolShortlistShadowInput {
  expect(shadow.schedule).toHaveBeenCalledTimes(1);
  return shadow.schedule.mock.calls[0]?.[0] as ToolShortlistShadowInput;
}

beforeEach(() => {
  mockBuildToolLoopStream.mockReset();
  shadow.schedule.mockReset();
  toolAccess.resolve.mockReset().mockResolvedValue('auto');
});

describe('the tool shortlist shadow measures the selection the turn really made', () => {
  it.each(['auto', 'on_demand', 'always'] as const)(
    'measures an account on %s against its own budget',
    async (mode) => {
      toolAccess.resolve.mockResolvedValue(mode);

      await runTurn(makeProcessed(SCOPE));

      const input = scheduledInput();
      expect(input.scope).toBe(SCOPE);
      expect(input.derive().budget).toEqual(toolSchemaBudgetFor(mode));
    },
  );

  it('leaves a denied tool out of what it measures, as the turn does', async () => {
    toolAccess.resolve.mockResolvedValue('always');

    await runTurn(makeProcessed(SCOPE), {
      connectorPermissions: connectorToolPermissionsFromEntries([
        { connectorId: 'slack', toolName: 'post_channel_message', level: 'deny' },
      ]),
    });

    const turn = scheduledInput().derive();
    expect(turn.candidates.map((candidate) => candidate.qualifiedName)).not.toContain(SLACK_TOOL);
    expect([...turn.baselineQualifiedNames].sort()).toEqual([JIRA_TOOL, PULL_REQUEST_TOOL].sort());
  });

  it('schedules nothing for a turn without a decision scope', async () => {
    await runTurn(makeProcessed());

    expect(shadow.schedule).not.toHaveBeenCalled();
  });

  it('schedules nothing for a turn without connector tools', async () => {
    await runTurn(makeProcessed(SCOPE), { mcpTools: [] });

    expect(shadow.schedule).not.toHaveBeenCalled();
  });
});
