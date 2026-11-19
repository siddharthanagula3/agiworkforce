import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  drain: vi.fn(),
  stream: vi.fn(),
  resolveRoute: vi.fn(),
  routingRequest: vi.fn(),
  reserve: vi.fn(),
  started: vi.fn(),
  completed: vi.fn(),
  failed: vi.fn(),
  executeTool: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveAutoRoute: mocks.resolveRoute,
}));
vi.mock('@/lib/server/side-call-training-policy', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sideCallRoutingRequest: mocks.routingRequest,
}));
vi.mock('@/lib/services/aggregator-routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dispatchProviderForSelectedRoute: () => 'tool-provider',
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildServerProviderAdapter: () => ({ stream: mocks.stream }),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-providers', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveWireMode: () => 'legacy-web',
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  drainToLlmResponse: mocks.drain,
}));
vi.mock('@/lib/services/background-usage-lease', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveBackgroundUsage: mocks.reserve,
}));
vi.mock('@/lib/server/tools/memory-tools', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  executeProjectMemoryEditTool: mocks.executeTool,
}));

const {
  ProjectMemoryEditUnavailableError,
  projectMemoryEditReply,
  resolveProjectMemoryEditRoute,
  runProjectMemoryEdit,
} = await import('../project-memory-edit-service');
const { FORGET_MEMORY_TOOL_NAME, SAVE_MEMORY_TOOL_NAME, SEARCH_MEMORY_TOOL_NAME } =
  await import('@/lib/server/tools/memory-tools');

const PROJECT_ID = '0195f2a8-7c1d-7e3a-9b4f-2a6c8d0e1f23';
const ROUTE = {
  status: 'selected',
  provider: 'tool-vendor',
  providerModelId: 'provider-model',
  modelKey: 'tool-model',
  routeId: 'route-1',
};

function modelTurn(overrides: Record<string, unknown> = {}) {
  return {
    model: 'tool-model',
    content: '',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    providerElapsedMs: 1,
    ...overrides,
  };
}

function toolCall(id: string, name: string, args: Record<string, unknown>) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function input() {
  return {
    db: { query: vi.fn(async () => []) } as never,
    userId: 'user-1',
    organizationId: null,
    planTier: 'free',
    projectId: PROJECT_ID,
    message: 'Change the deadline to March',
    source: 'mobile',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.routingRequest.mockImplementation(async (_db, _user, request: unknown) => request);
  mocks.resolveRoute.mockReturnValue(ROUTE);
  mocks.stream.mockImplementation((request: unknown) => request);
  mocks.started.mockResolvedValue(undefined);
  mocks.completed.mockResolvedValue(undefined);
  mocks.failed.mockResolvedValue(undefined);
  mocks.reserve.mockResolvedValue({
    providerStarted: mocks.started,
    completed: mocks.completed,
    failed: mocks.failed,
  });
});

describe('runProjectMemoryEdit', () => {
  it('routes through the catalog with tool calling and offers only the three memory tools', async () => {
    mocks.drain.mockResolvedValueOnce(modelTurn({ content: 'Nothing was changed.' }));

    await runProjectMemoryEdit(input());

    expect(mocks.routingRequest).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({ selection: 'auto', requiredCapabilities: ['functionCalling'] }),
    );
    const request = mocks.stream.mock.calls[0]?.[0] as {
      model: string;
      tools: Array<{ name: string }>;
    };
    expect(request.model).toBe(ROUTE.providerModelId);
    expect(request.tools.map((tool) => tool.name).sort()).toEqual(
      [FORGET_MEMORY_TOOL_NAME, SAVE_MEMORY_TOOL_NAME, SEARCH_MEMORY_TOOL_NAME].sort(),
    );
  });

  it('runs the memory tools inside the project and returns the changes and the reply', async () => {
    mocks.executeTool.mockImplementation(
      async (
        name: string,
        _args: unknown,
        context: {
          projectId: string;
          changes: unknown[];
          removals: unknown[];
        },
      ) => {
        if (name === FORGET_MEMORY_TOOL_NAME) {
          context.removals.push({ id: 'memory-old', content: 'The deadline is February' });
        }
        if (name === SAVE_MEMORY_TOOL_NAME) {
          context.changes.push({ id: 'memory-new', action: 'added', content: 'Deadline is March' });
        }
        return { content: '{}', isError: false };
      },
    );
    mocks.drain
      .mockResolvedValueOnce(
        modelTurn({
          tool_calls: [
            toolCall('call-1', FORGET_MEMORY_TOOL_NAME, { subject: 'deadline' }),
            toolCall('call-2', SAVE_MEMORY_TOOL_NAME, { fact: 'Deadline is March' }),
          ],
        }),
      )
      .mockResolvedValueOnce(modelTurn({ content: 'Updated: deadline is March\nExtra line' }));

    const result = await runProjectMemoryEdit(input());

    expect(result).toEqual({
      changed: [{ id: 'memory-new', action: 'added', content: 'Deadline is March' }],
      removals: [{ id: 'memory-old', content: 'The deadline is February' }],
      reply: 'Updated: deadline is March',
    });
    for (const call of mocks.executeTool.mock.calls) {
      expect(call[2]).toMatchObject({ projectId: PROJECT_ID, userId: 'user-1', source: 'mobile' });
    }
    expect(mocks.completed).toHaveBeenCalledWith(
      expect.objectContaining({ usage: expect.objectContaining({ totalTokens: 30 }) }),
    );
  });

  it('never runs a tool the model was not given', async () => {
    mocks.drain
      .mockResolvedValueOnce(
        modelTurn({ tool_calls: [toolCall('call-1', 'web_search', { query: 'deadline' })] }),
      )
      .mockResolvedValueOnce(modelTurn({ content: 'Nothing was changed.' }));

    const result = await runProjectMemoryEdit(input());

    expect(mocks.executeTool).not.toHaveBeenCalled();
    expect(result.changed).toEqual([]);
    const second = mocks.stream.mock.calls[1]?.[0] as { messages: Array<{ content: unknown }> };
    expect(JSON.stringify(second.messages)).toContain('Unknown tool: web_search');
  });

  it('stops after a bounded number of model rounds', async () => {
    mocks.executeTool.mockResolvedValue({ content: '{}', isError: false });
    mocks.drain.mockResolvedValue(
      modelTurn({ tool_calls: [toolCall('call', SEARCH_MEMORY_TOOL_NAME, { query: 'x' })] }),
    );

    const result = await runProjectMemoryEdit(input());

    expect(mocks.drain).toHaveBeenCalledTimes(4);
    expect(result.reply).toBe('');
  });

  it('releases the reservation and fails when the model fails before changing anything', async () => {
    mocks.drain.mockRejectedValueOnce(new Error('provider down'));

    await expect(runProjectMemoryEdit(input())).rejects.toThrow('provider down');
    expect(mocks.failed).toHaveBeenCalledTimes(1);
    expect(mocks.completed).not.toHaveBeenCalled();
  });

  it('keeps what was already changed when the model fails afterwards', async () => {
    mocks.executeTool.mockImplementation(
      async (_name: string, _args: unknown, context: { changes: unknown[] }) => {
        context.changes.push({ id: 'memory-new', action: 'added', content: 'Deadline is March' });
        return { content: '{}', isError: false };
      },
    );
    mocks.drain
      .mockResolvedValueOnce(
        modelTurn({
          tool_calls: [toolCall('call-1', SAVE_MEMORY_TOOL_NAME, { fact: 'Deadline is March' })],
        }),
      )
      .mockRejectedValueOnce(new Error('provider down'));

    const result = await runProjectMemoryEdit(input());

    expect(result).toEqual({
      changed: [{ id: 'memory-new', action: 'added', content: 'Deadline is March' }],
      removals: [],
      reply: '',
    });
    expect(mocks.completed).toHaveBeenCalledTimes(1);
    expect(mocks.failed).not.toHaveBeenCalled();
  });

  it('refuses when no route can call tools', async () => {
    mocks.resolveRoute.mockReturnValue({ status: 'unavailable', code: 'no_route' });

    await expect(runProjectMemoryEdit(input())).rejects.toBeInstanceOf(
      ProjectMemoryEditUnavailableError,
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('finds no route when the training choice leaves no provider', async () => {
    mocks.routingRequest.mockResolvedValue(null);

    await expect(resolveProjectMemoryEditRoute(input().db, 'user-1')).resolves.toBeNull();
    expect(mocks.resolveRoute).not.toHaveBeenCalled();
  });
});

describe('projectMemoryEditReply', () => {
  it('keeps the first line and bounds its length', () => {
    expect(projectMemoryEditReply('\n  Added: likes tea  \nmore')).toBe('Added: likes tea');
    expect(projectMemoryEditReply('x'.repeat(300))).toHaveLength(200);
  });
});
