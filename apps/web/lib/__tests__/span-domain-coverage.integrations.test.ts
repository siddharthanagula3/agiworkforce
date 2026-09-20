import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';

const emitted: Array<Record<string, unknown>> = [];

const mocks = vi.hoisted(() => ({
  claimJobs: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  reapExpiredJobLeases: vi.fn(),
  pruneFinishedJobs: vi.fn(),
  readJobQueueStats: vi.fn(),
  connectMcpServer: vi.fn(),
  buildMcpToolCatalog: vi.fn(),
  assertResolvedPublicHostname: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: (record: Record<string, unknown>) => emitted.push(record),
    error: (record: Record<string, unknown>) => emitted.push(record),
    warn: (record: Record<string, unknown>) => emitted.push(record),
    debug: (record: Record<string, unknown>) => emitted.push(record),
  },
}));
vi.mock('@/lib/observability/error-capture', () => ({
  captureWorkerFailure: vi.fn(),
  captureModelFailure: vi.fn(),
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(),
  resolveProviderFromModel: vi.fn(() => 'anthropic'),
  toGenericUpstreamError: vi.fn(),
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: (...args: unknown[]) => mocks.assertResolvedPublicHostname(...args),
  pinnedPublicFetch: vi.fn(),
}));
vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: (...args: unknown[]) => mocks.buildMcpToolCatalog(...args),
  connectMcpServer: (...args: unknown[]) => mocks.connectMcpServer(...args),
}));
vi.mock('@/lib/server/incident/dispatch', () => ({
  notifyIncident: vi.fn(async () => null),
  clearIncident: vi.fn(async () => undefined),
}));
vi.mock('@/lib/jobs/job-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/jobs/job-service')>();
  return {
    ...actual,
    claimJobs: mocks.claimJobs,
    completeJob: mocks.completeJob,
    failJob: mocks.failJob,
    reapExpiredJobLeases: mocks.reapExpiredJobLeases,
    pruneFinishedJobs: mocks.pruneFinishedJobs,
    readJobQueueStats: mocks.readJobQueueStats,
  };
});
vi.mock('@/lib/jobs/cancellation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/jobs/cancellation')>();
  return {
    ...actual,
    watchJobCancellation: () => ({ stop: () => undefined }),
    reapAbandonedCancellations: async () => 0,
  };
});

import { drainBackgroundJobs } from '@/lib/jobs/job-drain';
import type { BackgroundJob } from '@/lib/jobs/job-service';
import { traceSandboxExecutor } from '@/lib/e2b/tracing';
import type { E2BExecutor } from '@/lib/e2b/types';
import { executeWebMcpTool } from '@/lib/mcp-tool-executor';
import { startProviderStream } from '@/app/api/llm/v1/chat/completions/lib/adapter-factory';

function spansFor(domain: string): Array<Record<string, unknown>> {
  return emitted.filter((record) => record['event'] === 'span' && record['span_domain'] === domain);
}

function backgroundJob(): BackgroundJob {
  return {
    id: 'job-1',
    queue: 'notifications',
    kind: 'notifications.schedule-completed',
    userId: 'user-1',
    organizationId: null,
    tenantKey: 'user:user-1',
    payload: {},
    priority: 0,
    status: 'running',
    attempts: 2,
    maxAttempts: 6,
    runAfter: '2026-09-17T00:00:00.000Z',
    leaseExpiresAt: '2026-09-17T00:00:30.000Z',
    workerId: 'worker-a',
    idempotencyKey: null,
    lastError: null,
    retryReason: null,
    deadReason: null,
    deadLetteredAt: null,
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    cancelReason: null,
  } as BackgroundJob;
}

function sandboxExecutor(): E2BExecutor {
  return {
    runCode: vi.fn(async () => ({ ok: true, output: '42' })),
    writeFile: vi.fn(async () => ({ ok: true, output: '' })),
    createFolder: vi.fn(async () => ({ ok: true, output: '' })),
    dispose: vi.fn(async () => undefined),
  };
}

function streamingAdapter(chunks: readonly StreamChunk[]): ProviderAdapter {
  return {
    id: 'anthropic',
    stream: () =>
      (async function* generate() {
        for (const chunk of chunks) yield chunk;
      })(),
  } as unknown as ProviderAdapter;
}

beforeEach(() => {
  emitted.length = 0;
  vi.clearAllMocks();
  delete process.env['WEB_MCP_SERVERS_JSON'];
  mocks.reapExpiredJobLeases.mockResolvedValue({ requeued: 0, deadLettered: 0 });
  mocks.pruneFinishedJobs.mockResolvedValue(0);
  mocks.readJobQueueStats.mockResolvedValue([]);
  mocks.completeJob.mockResolvedValue(true);
  mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
});

describe('span domain coverage for work handed to a dependency', () => {
  it('emits a queue span around every drained background job', async () => {
    mocks.claimJobs.mockResolvedValueOnce([backgroundJob()]).mockResolvedValue([]);

    const summary = await drainBackgroundJobs({
      db: {} as DatabaseAdapter,
      handlers: { 'notifications.schedule-completed': async () => ({ sent: 1 }) },
      budgetMs: 60_000,
      maxInFlight: 1,
    });

    expect(summary.succeeded).toBe(1);
    const spans = spansFor('queue');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['span_name']).toBe('background_job.run');
    expect(spans[0]!['span_kind']).toBe('consumer');
    expect(spans[0]!['messaging.destination.name']).toBe('notifications');
    expect(spans[0]!['messaging.message.id']).toBe('job-1');
    expect(spans[0]!['job.kind']).toBe('notifications.schedule-completed');
    expect(spans[0]!['job.attempt']).toBe(2);
    expect(spans[0]!['status']).toBe('ok');
  });

  it('records a failed job on its queue span rather than losing it to the drain summary', async () => {
    mocks.claimJobs.mockResolvedValueOnce([backgroundJob()]).mockResolvedValue([]);
    mocks.failJob.mockResolvedValue('retry');

    await drainBackgroundJobs({
      db: {} as DatabaseAdapter,
      handlers: {
        'notifications.schedule-completed': async () => {
          throw new Error('handler blew up');
        },
      },
      budgetMs: 60_000,
      maxInFlight: 1,
    });

    const spans = spansFor('queue');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['status']).toBe('error');
    expect(spans[0]!['error.type']).toBe('Error');
  });

  it('emits a sandbox span for each traced sandbox operation', async () => {
    const executor = traceSandboxExecutor(sandboxExecutor(), {
      sandboxId: 'sbx-1',
      template: 'code-interpreter',
      conversationId: 'conv-1',
    });

    await executor.runCode({ language: 'python', code: 'print(6 * 7)' });
    await executor.dispose();

    const spans = spansFor('sandbox');
    expect(spans.map((span) => span['span_name'])).toEqual(['sandbox.run_code', 'sandbox.dispose']);
    expect(spans[0]!['agi.sandbox.id']).toBe('sbx-1');
    expect(spans[0]!['agi.sandbox.template']).toBe('code-interpreter');
    expect(spans[0]!['agi.sandbox.operation']).toBe('run_code');
    expect(spans[0]!['agi.sandbox.language']).toBe('python');
    expect(spans[0]!['status']).toBe('ok');
  });

  it('carries the sandbox lifetime failure into the span when the sandbox rejects', async () => {
    const failing = sandboxExecutor();
    failing.runCode = vi.fn(async () => {
      throw new Error('sandbox went away');
    });
    const executor = traceSandboxExecutor(failing, { sandboxId: 'sbx-2' });

    await expect(executor.runCode({ language: 'python', code: '1' })).rejects.toThrow(
      'sandbox went away',
    );

    const spans = spansFor('sandbox');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['status']).toBe('error');
    expect(spans[0]!['agi.sandbox.id']).toBe('sbx-2');
  });

  it('emits a tool span around a connector tool call without recording its arguments', async () => {
    process.env['WEB_MCP_SERVERS_JSON'] = JSON.stringify({
      servers: [
        {
          id: 'search',
          name: 'Search',
          description: 'Search approved sources',
          transport: {
            type: 'http',
            url: 'https://mcp.example.com/mcp',
            headers: { Authorization: 'Bearer secret' },
          },
          enabled: true,
        },
      ],
    });
    const callTool = vi.fn(async () => ({ isError: false, content: [] }));
    mocks.connectMcpServer.mockResolvedValue({
      callTool,
      protocolEra: '2025-06-18',
      close: vi.fn(async () => undefined),
    });

    await executeWebMcpTool('search', 'web_search', { query: 'sk-live-should-not-be-a-label' });

    const spans = spansFor('tool');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['span_name']).toBe('mcp.call_tool');
    expect(spans[0]!['gen_ai.tool.name']).toBe('web_search');
    expect(spans[0]!['mcp.server.id']).toBe('search');
    expect(spans[0]!['mcp.tool.argument_count']).toBe(1);
    expect(spans[0]!['mcp.tool.is_error']).toBe(false);
    expect(JSON.stringify(spans[0])).not.toContain('sk-live-should-not-be-a-label');
  });

  it('emits a model span carrying the provider request id and no prompt text', async () => {
    const chatRequest = {
      model: 'claude-opus-5',
      messages: [{ role: 'user', content: 'my password is hunter2' }],
      tools: [],
    } as unknown as ChatRequest;

    await startProviderStream(
      streamingAdapter([
        { type: 'response-meta', id: 'req_abc123', model: 'claude-opus-5', provider: 'anthropic' },
        { type: 'text-delta', delta: 'hi' },
      ] as unknown as StreamChunk[]),
      chatRequest,
      new AbortController().signal,
      () => new Error('unused'),
    );

    const spans = spansFor('model');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['span_name']).toBe('gen_ai.stream.start');
    expect(spans[0]!['agi.provider.request_id']).toBe('req_abc123');
    expect(spans[0]!['gen_ai.provider.name']).toBe('anthropic');
    expect(spans[0]!['gen_ai.response.model']).toBe('claude-opus-5');
    expect(spans[0]!['status']).toBe('ok');
    expect(JSON.stringify(spans[0])).not.toContain('hunter2');
  });

  it('marks the model span errored and keeps the provider error code when the stream opens with one', async () => {
    const chatRequest = { model: 'claude-opus-5', messages: [] } as unknown as ChatRequest;

    await expect(
      startProviderStream(
        streamingAdapter([
          { type: 'error', code: '429', message: 'rate limited' },
        ] as unknown as StreamChunk[]),
        chatRequest,
        new AbortController().signal,
        () => new Error('upstream refused'),
      ),
    ).rejects.toThrow('upstream refused');

    const spans = spansFor('model');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['status']).toBe('error');
    expect(spans[0]!['gen_ai.response.error_code']).toBe('429');
  });
});
