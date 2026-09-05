import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  streamRequest: vi.fn(),
  resolvePolicy: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: mocks.streamRequest,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveSecretHandlingPolicy: mocks.resolvePolicy,
  resolveZeroDataRetentionPolicy: async () => ({ required: false, organizationId: null }),
}));

import { runToolLoop, applyToolResultSecretPolicy, type ConnectorToolExecutor } from './tool-loop';
import { connectorToolPermissionsFromEntries } from './connector-tool-permissions';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import type { ProcessedRequest } from './request-processor';

const STRIPE_KEY = `sk_live_${'a'.repeat(30)}`;
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

const CONNECTOR_SERVER_ID = 'fixtureserver';
const CONNECTOR_TOOL_NAME = 'lookup_record';
const CONNECTOR_TOOL = `mcp__${CONNECTOR_SERVER_ID}__${CONNECTOR_TOOL_NAME}`;

const connectorToolDef: WebMcpToolDef = {
  qualifiedName: CONNECTOR_TOOL,
  serverId: CONNECTOR_SERVER_ID,
  toolName: CONNECTOR_TOOL_NAME,
  description: 'fixture connector tool',
  origin: 'connector',
  inputSchema: { type: 'object', properties: {} },
};

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

function toolCallStream(name: string): ReadableStream<Uint8Array> {
  return sseStream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name, arguments: '{}' },
              },
            ],
          },
          index: 0,
        },
      ],
      model: 'test-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'test-model' },
  ]);
}

function finalAnswerStream(text: string): ReadableStream<Uint8Array> {
  return sseStream([
    { choices: [{ delta: { content: text }, index: 0 }], model: 'test-model' },
    { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'test-model' },
  ]);
}

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-secret-results',
    requestedModel: 'test-model',
    provider: 'openai',
    conversationId: undefined,
    llmRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'look up the record' }],
      max_tokens: 256,
      stream: true,
      tools: [],
    },
  } as unknown as ProcessedRequest;
}

async function collect(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const chunk of gen) out += decoder.decode(chunk);
  return out;
}

function toolResultEventContents(output: string): string[] {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map((line) => JSON.parse(line.slice('data: '.length)) as Record<string, unknown>)
    .flatMap((event) => {
      const choices = event['choices'] as Array<{ delta?: Record<string, unknown> }> | undefined;
      const toolResult = choices?.[0]?.delta?.['x_tool_result'] as { content?: string } | undefined;
      return toolResult?.content !== undefined ? [toolResult.content] : [];
    });
}

function secondRequestMessages(): Array<{ role: string; content: string; tool_call_id?: string }> {
  const request = mocks.streamRequest.mock.calls[1]?.[2] as {
    messages: Array<{ role: string; content: string; tool_call_id?: string }>;
  };
  return request.messages;
}

beforeEach(() => {
  mocks.streamRequest.mockReset();
  mocks.resolvePolicy.mockReset();
  mocks.recordAuditEvent.mockClear();
});

describe('applyToolResultSecretPolicy', () => {
  it('returns the content unchanged and never resolves a policy when nothing matches', async () => {
    const result = await applyToolResultSecretPolicy('user-1', 'url_fetch', 'hello there');

    expect(result).toBe('hello there');
    expect(mocks.resolvePolicy).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('redacts the high-confidence span under redact mode and audits the tool name', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: ORGANIZATION_ID });

    const result = await applyToolResultSecretPolicy('user-1', 'url_fetch', `key: ${STRIPE_KEY}`);

    expect(result).not.toContain(STRIPE_KEY);
    expect(result).toContain('[REDACTED]');
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      eventType: string;
      organizationId: string | null;
      detail: Record<string, unknown>;
    };
    expect(event.eventType).toBe('secret_detected');
    expect(event.organizationId).toBe(ORGANIZATION_ID);
    expect(event.detail['resourceType']).toBe('tool_result');
    expect(event.detail['resourceId']).toBe('url_fetch');
    expect(event.detail['status']).toBe('redacted');
    expect(JSON.stringify(event)).not.toContain(STRIPE_KEY);
  });

  it('replaces the content with a blocked notice naming the tool under block mode', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'block', organizationId: ORGANIZATION_ID });

    const result = await applyToolResultSecretPolicy(
      'user-1',
      'mcp__acme__export',
      `key: ${STRIPE_KEY}`,
    );

    expect(result).not.toContain(STRIPE_KEY);
    expect(result).toContain('mcp__acme__export');
    expect(result).toContain('blocked');
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      outcome: string;
      detail: Record<string, unknown>;
    };
    expect(event.outcome).toBe('denied');
    expect(event.detail['status']).toBe('blocked');
  });

  it('leaves the content untouched under warn mode but still audits it', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'warn', organizationId: ORGANIZATION_ID });

    const result = await applyToolResultSecretPolicy('user-1', 'url_fetch', `key: ${STRIPE_KEY}`);

    expect(result).toContain(STRIPE_KEY);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as { detail: Record<string, unknown> };
    expect(event.detail['status']).toBe('warned');
  });

  it('treats a low-confidence-only match as a warning under every mode, never blocking or redacting', async () => {
    const lowConfidenceJwt = `eyJ${'a'.repeat(24)}.${'b'.repeat(24)}`;
    for (const mode of ['warn', 'redact', 'block'] as const) {
      mocks.recordAuditEvent.mockClear();
      mocks.resolvePolicy.mockResolvedValue({ mode, organizationId: ORGANIZATION_ID });

      const result = await applyToolResultSecretPolicy(
        'user-1',
        'url_fetch',
        `token: ${lowConfidenceJwt}`,
      );

      expect(result).toContain(lowConfidenceJwt);
      const event = mocks.recordAuditEvent.mock.calls[0]![0] as { detail: Record<string, unknown> };
      expect(event.detail['status']).toBe('warned');
    }
  });

  it('falls back to the personal warn default and skips the policy lookup when there is no userId', async () => {
    const result = await applyToolResultSecretPolicy(undefined, 'url_fetch', `key: ${STRIPE_KEY}`);

    expect(result).toContain(STRIPE_KEY);
    expect(mocks.resolvePolicy).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });
});

describe('runToolLoop, secret handling policy applied to tool results before they are pushed', () => {
  it('redacts a secret a connector returns before the follow-up provider call ever sees it', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: ORGANIZATION_ID });
    mocks.streamRequest
      .mockResolvedValueOnce(toolCallStream(CONNECTOR_TOOL))
      .mockResolvedValueOnce(finalAnswerStream('Done.'));

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: `Here is the record: ${STRIPE_KEY}`,
      isError: false,
    }));

    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [connectorToolDef],
        connectorExecutor,
      }),
    );

    const toolMsg = secondRequestMessages().find((m) => m.role === 'tool');
    expect(toolMsg?.content).not.toContain(STRIPE_KEY);
    expect(toolMsg?.content).toContain('[REDACTED]');
    expect(output).not.toContain(STRIPE_KEY);
    expect(output).toContain('[REDACTED]');
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('drops a connector secret entirely under block mode, replacing it with a plain tool error in both the SSE event and the provider message', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'block', organizationId: ORGANIZATION_ID });
    mocks.streamRequest
      .mockResolvedValueOnce(toolCallStream(CONNECTOR_TOOL))
      .mockResolvedValueOnce(finalAnswerStream('Done.'));

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: `Here is the record: ${STRIPE_KEY}`,
      isError: false,
    }));

    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [connectorToolDef],
        connectorExecutor,
      }),
    );

    const toolMsg = secondRequestMessages().find((m) => m.role === 'tool');
    expect(toolMsg?.content).not.toContain(STRIPE_KEY);
    expect(toolMsg?.content).toContain(CONNECTOR_TOOL);
    expect(output).not.toContain(STRIPE_KEY);
    expect(output).toContain(CONNECTOR_TOOL);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      outcome: string;
      detail: Record<string, unknown>;
    };
    expect(event.outcome).toBe('denied');
    expect(event.detail['resourceId']).toBe(CONNECTOR_TOOL);
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('leaves both the SSE event and the provider-bound content alone under warn mode but still records the audit trail', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'warn', organizationId: ORGANIZATION_ID });
    mocks.streamRequest
      .mockResolvedValueOnce(toolCallStream(CONNECTOR_TOOL))
      .mockResolvedValueOnce(finalAnswerStream('Done.'));

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: `Here is the record: ${STRIPE_KEY}`,
      isError: false,
    }));

    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [connectorToolDef],
        connectorExecutor,
      }),
    );

    const toolMsg = secondRequestMessages().find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain(STRIPE_KEY);
    expect(output).toContain(STRIPE_KEY);
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('applies the same policy to a static permission-denied result, not only to live tool output', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: ORGANIZATION_ID });
    const secretQualifiedName = `mcp__${CONNECTOR_SERVER_ID}__${STRIPE_KEY}`;
    mocks.streamRequest
      .mockResolvedValueOnce(toolCallStream(secretQualifiedName))
      .mockResolvedValueOnce(finalAnswerStream('That tool is blocked.'));

    const output = await collect(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [
          {
            ...connectorToolDef,
            qualifiedName: secretQualifiedName,
            toolName: STRIPE_KEY,
          },
        ],
        connectorPermissions: connectorToolPermissionsFromEntries([
          { connectorId: CONNECTOR_SERVER_ID, toolName: STRIPE_KEY, level: 'deny' },
        ]),
      }),
    );

    expect(output).toContain('x_tool_result');
    const toolResultContents = toolResultEventContents(output);
    expect(toolResultContents).toHaveLength(1);
    expect(toolResultContents[0]).not.toContain(STRIPE_KEY);
    expect(toolResultContents[0]).toContain('[REDACTED]');
    const toolMsg = secondRequestMessages().find((m) => m.role === 'tool');
    expect(toolMsg?.content).not.toContain(STRIPE_KEY);
    expect(toolMsg?.content).toContain('[REDACTED]');
    expect(mocks.recordAuditEvent).toHaveBeenCalled();
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as { detail: Record<string, unknown> };
    expect(event.detail['status']).toBe('redacted');
  });
});
