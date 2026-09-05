import { describe, it, expect, vi, beforeEach } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
const mocks = vi.hoisted(() => ({
  resolvePolicy: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return {
    ...actual,
    fetch: (...args: unknown[]) =>
      (globalThis.fetch as unknown as (...a: unknown[]) => unknown)(...args),
  };
});

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: vi.fn(),
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idem-key'),
    deductCredits: vi.fn(async () => ({ success: true })),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: vi.fn(() => 7),
    calculateCostDollars: vi.fn(() => 0.07),
  },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveSecretHandlingPolicy: mocks.resolvePolicy,
  resolveZeroDataRetentionPolicy: async () => ({ required: false, organizationId: null }),
}));

import { buildToolLoopStream } from './tool-loop-anthropic';
import { runResearchLoop, READY_MARKER } from './research-loop';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

const streamRequestMock = vi.mocked(buildToolLoopStream);
const OPENAI_CHAT_MODEL = requireProviderDefaultModel('openai');
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const STRIPE_KEY = `sk_live_${'a'.repeat(30)}`;

function sseStream(events: unknown[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function contentEvent(text: string) {
  return { choices: [{ delta: { content: text }, index: 0 }] };
}

function finishEvent(reason = 'stop') {
  return { choices: [{ delta: {}, finish_reason: reason, index: 0 }] };
}

function toolCallsTurn(calls: Array<{ id: string; name: string; args: unknown }>): ReadableStream {
  return sseStream([
    {
      choices: [
        {
          delta: {
            tool_calls: calls.map((c, index) => ({
              index,
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          },
          index: 0,
        },
      ],
    },
    finishEvent('tool_calls'),
  ]);
}

function notesTurn(notes: string): ReadableStream {
  return sseStream([contentEvent(`${notes}\n${READY_MARKER}`), finishEvent()]);
}

function planStream() {
  return sseStream([contentEvent('["fetch the page"]'), finishEvent()]);
}

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-secret-results',
    requestedModel: OPENAI_CHAT_MODEL,
    provider: 'openai',
    estimatedCostCents: 2,
    quotaFeature: 'chat',
    isFlagshipRequest: false,
    chatRequest: { model: OPENAI_CHAT_MODEL },
    llmRequest: {
      model: OPENAI_CHAT_MODEL,
      messages: [{ role: 'user', content: 'research https://example.com/ in depth' }],
      max_tokens: 2048,
      tools: [{ type: 'web_search_preview' }, urlFetchToolDef()],
    },
  } as unknown as ProcessedRequest;
}

async function collectRaw(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let raw = '';
  for await (const chunk of gen) raw += decoder.decode(chunk);
  return raw;
}

function fetchToolMessages(): Array<{ role: string; content: string; tool_call_id?: string }> {
  const continuation = streamRequestMock.mock.calls[2]?.[2] as {
    messages: Array<{ role: string; content: string; tool_call_id?: string }>;
  };
  return continuation.messages.filter((m) => m.role === 'tool');
}

function mockFetchAndPlanAndSynthesis(): ReturnType<typeof vi.fn> {
  streamRequestMock
    .mockResolvedValueOnce(planStream())
    .mockResolvedValueOnce(
      toolCallsTurn([{ id: 'call_1', name: 'url_fetch', args: { url: 'https://example.com/' } }]),
    )
    .mockResolvedValueOnce(notesTurn('Notes gathered.'))
    .mockResolvedValueOnce(sseStream([contentEvent('Report.'), finishEvent()]));

  const pageWithSecret =
    `<html><head><title>Example</title></head><body><main>` +
    `<p>Support key: ${STRIPE_KEY}</p></main></body></html>`;
  const fetchMock = vi.fn(
    async () =>
      new Response(pageWithSecret, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('research loop, secret handling policy applied to url_fetch results', () => {
  it('redacts a secret a fetched page returns before it reaches the client stream or the provider', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: ORGANIZATION_ID });
    mockFetchAndPlanAndSynthesis();

    try {
      const raw = await collectRaw(
        runResearchLoop(makeProcessed(), { userId: 'user-1', token: 't' }),
      );

      expect(raw).not.toContain(STRIPE_KEY);
      expect(raw).toContain('[REDACTED]');

      const toolMsg = fetchToolMessages().find((m) => m.tool_call_id === 'call_1');
      expect(toolMsg?.content).not.toContain(STRIPE_KEY);
      expect(toolMsg?.content).toContain('[REDACTED]');
      expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('drops a fetched-page secret entirely under block mode, in both the client stream and the provider message', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'block', organizationId: ORGANIZATION_ID });
    mockFetchAndPlanAndSynthesis();

    try {
      const raw = await collectRaw(
        runResearchLoop(makeProcessed(), { userId: 'user-1', token: 't' }),
      );

      expect(raw).not.toContain(STRIPE_KEY);
      expect(raw).toContain('blocked');

      const toolMsg = fetchToolMessages().find((m) => m.tool_call_id === 'call_1');
      expect(toolMsg?.content).not.toContain(STRIPE_KEY);
      expect(toolMsg?.content).toContain('url_fetch');
      const event = mocks.recordAuditEvent.mock.calls[0]?.[0] as {
        outcome: string;
        detail: Record<string, unknown>;
      };
      expect(event.outcome).toBe('denied');
      expect(event.detail['status']).toBe('blocked');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
