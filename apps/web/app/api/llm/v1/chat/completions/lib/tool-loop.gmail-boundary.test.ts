// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';
import { createVercelGatewayAdapter } from '@agiworkforce/providers-vercel-gateway';
import type { ChatRequest, ProviderAdapter } from '@agiworkforce/types';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import type { ConnectorExecOptions } from '@/lib/user-connector-tools';
import type { ProcessedRequest } from './request-processor';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  build: vi.fn(),
  fetch: vi.fn(),
  gmail: vi.fn(),
  other: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => ({ query: mocks.query, execute: vi.fn(async () => 1) }),
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/provider-adapter-service')>()),
  buildServerProviderAdapter: mocks.build,
  serverProviderHasEndpointOverride: () => false,
}));
vi.mock('@/lib/services/zero-data-retention-provider-overrides', () => ({
  resolveZeroDataRetentionProviderOverrides: () => new Set(),
}));
vi.mock('@/lib/e2b/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/e2b/runtime')>()),
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

import { bindGmailConnectorExecutor } from '@/lib/connectors/gmail-data-policy';
import { runToolLoop } from './tool-loop';

const model = Object.values(modelRegistry.routes).find(
  (route) => route.provider === 'vercel_gateway' && route.trustModes.includes('managed_cloud'),
)?.modelKey;
if (!model) throw new Error('Canonical managed gateway fixture unavailable');
const GMAIL_TOOL = 'mcp__gmail__get_message';
const OTHER_TOOL = 'mcp__github__get_pull_request_diff';
const tools: WebMcpToolDef[] = [
  {
    qualifiedName: GMAIL_TOOL,
    serverId: 'gmail',
    toolName: 'get_message',
    description: 'Read Gmail',
    origin: 'connector',
    inputSchema: { type: 'object' },
  },
  {
    qualifiedName: OTHER_TOOL,
    serverId: 'github',
    toolName: 'get_pull_request_diff',
    description: 'Read diff',
    origin: 'connector',
    inputSchema: { type: 'object' },
  },
];

function processed(): ProcessedRequest {
  return {
    chatSurface: 'web',
    requestId: 'gmail-loop',
    requestedModel: model,
    provider: 'vercel_gateway',
    chatRequest: { model, messages: [], stream: true },
    conversationId: 'conversation-1',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    originalModel: model,
    resolvedTaskType: 'general',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    gmailDataPresent: false,
    zeroDataRetentionOnly: false,
    gmailDataPolicy: { userId: 'user-1', conversationId: 'conversation-1', organizationId: null },
    llmRequest: {
      model,
      messages: [
        { role: 'system', content: 'Stable Gmail boundary system prefix.' },
        { role: 'user', content: 'Read my email' },
      ],
      max_tokens: 1000,
      stream: true,
      usePromptCache: true,
      promptCacheScope: { userId: 'user-1', privacyClass: 'standard' },
      tools: [{ type: 'web_search_preview' }],
    },
  } as unknown as ProcessedRequest;
}

function response(tool: boolean): Response {
  const delta = tool
    ? {
        tool_calls: [
          {
            index: 0,
            id: 'gmail-call',
            type: 'function',
            function: { name: GMAIL_TOOL, arguments: '{"message_id":"mail-1"}' },
          },
        ],
      }
    : { content: 'Finished' };
  return new Response(
    `data: ${JSON.stringify({ id: 'response-1', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'response-1', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
async function drain(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  let output = '';
  for await (const value of generator) output += new TextDecoder().decode(value);
  return output;
}
function executor(source: ProcessedRequest) {
  return bindGmailConnectorExecutor(
    async (serverId, _name, _args, options?: ConnectorExecOptions) => {
      if (serverId !== 'gmail') {
        mocks.other();
        return { handled: true, content: 'other', isError: false };
      }
      try {
        await options?.beforeGmailInvocation?.();
      } catch {
        return { handled: true, content: 'Gmail route restricted', isError: true };
      }
      mocks.gmail();
      return { handled: true, content: 'gmail-sentinel', isError: false };
    },
    source,
    'user-1',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  let protectedNow = false;
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith('update')) protectedNow = true;
    return [{ gmail_data_present: protectedNow }];
  });
  const real = createVercelGatewayAdapter({
    apiKey: 'unit-test-key',
    skipDiscovery: true,
    fetch: mocks.fetch,
  });
  let builds = 0;
  mocks.build.mockImplementation(() =>
    ++builds === 1
      ? ({
          ...real,
          async *stream(_request: ChatRequest) {
            yield* [];
            throw Object.assign(new Error('Transient failure'), { status: 503 });
          },
        } as ProviderAdapter)
      : real,
  );
  let requests = 0;
  mocks.fetch.mockImplementation(async () => response(++requests === 1));
});

describe('Gmail live serving and canonical SDK boundary', () => {
  it('upgrades a same-provider retry before Gmail and sends mandatory ZDR with no native tools or cache on continuation', async () => {
    const source = processed();
    const serving = { ...source, llmRequest: { ...source.llmRequest } };
    const next = vi
      .fn()
      .mockReturnValueOnce({ provider: serving.provider, processed: serving })
      .mockReturnValue(null);
    const output = await drain(
      runToolLoop(source, {
        userId: 'user-1',
        approvalMode: 'auto',
        mcpTools: tools,
        connectorExecutor: executor(source),
        failover: { next },
      }),
    );
    expect(output).toContain('Finished');
    expect(next).toHaveBeenCalledOnce();
    expect(mocks.gmail).toHaveBeenCalledOnce();
    expect(serving.zeroDataRetentionOnly).toBe(true);
    expect(serving.gmailDataPresent).toBe(true);
    const bodies = mocks.fetch.mock.calls.map((args) => JSON.parse(args[1].body as string));
    expect(bodies[0].prompt_cache_key).toEqual(expect.any(String));
    expect(bodies[0].tools).toEqual(expect.arrayContaining([{ type: 'web_search_preview' }]));
    expect(
      bodies[0].tools.some(
        (tool: { function?: { name: string } }) => tool.function?.name === OTHER_TOOL,
      ),
    ).toBe(true);
    const continuation = bodies.find((body) =>
      JSON.stringify(body.messages).includes('gmail-sentinel'),
    );
    expect(continuation).toBeDefined();
    expect(continuation.providerOptions.gateway.zeroDataRetention).toBe(true);
    expect(
      continuation.tools.map((tool: { function: { name: string } }) => tool.function.name),
    ).toEqual([GMAIL_TOOL]);
    expect(JSON.stringify(continuation)).not.toContain('web_search_preview');
    expect(continuation.prompt_cache_key).toBeUndefined();
    expect(continuation.prompt_cache_retention).toBeUndefined();
    expect(mocks.other).not.toHaveBeenCalled();
  });

  it('uses the unsafe actual failover view to refuse before marker storage or Gmail network', async () => {
    const source = processed();
    const serving = { ...source, provider: 'openrouter', llmRequest: { ...source.llmRequest } };
    const next = vi
      .fn()
      .mockReturnValueOnce({ provider: serving.provider, processed: serving })
      .mockReturnValue(null);
    await drain(
      runToolLoop(source, {
        userId: 'user-1',
        approvalMode: 'auto',
        mcpTools: tools,
        connectorExecutor: executor(source),
        failover: { next },
      }),
    );
    expect(next).toHaveBeenCalledOnce();
    expect(mocks.gmail).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some((args) => (args[0] as string).startsWith('update'))).toBe(
      false,
    );
    expect(JSON.stringify(mocks.fetch.mock.calls)).not.toContain('gmail-sentinel');
  });

  it('reloads a stale checkpoint before an approved non-Gmail tool can execute without any provider call', async () => {
    mocks.query.mockResolvedValue([{ gmail_data_present: true }]);
    const source = processed();
    source.provider = 'openrouter';
    source.llmRequest.messages = [
      { role: 'user', content: 'continue' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'pending-other',
            type: 'function',
            function: { name: OTHER_TOOL, arguments: '{"query":"gmail-sentinel"}' },
          },
        ],
      },
    ];
    await expect(
      drain(
        runToolLoop(source, {
          userId: 'user-1',
          approvalMode: 'manual',
          mcpTools: tools,
          connectorExecutor: executor(source),
          resume: { approvals: [{ toolCallId: 'pending-other', decision: 'approved' }] },
        }),
      ),
    ).rejects.toThrow('mandatory zero data retention');
    expect(source.gmailDataPresent).toBe(true);
    expect(mocks.other).not.toHaveBeenCalled();
    expect(mocks.gmail).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
