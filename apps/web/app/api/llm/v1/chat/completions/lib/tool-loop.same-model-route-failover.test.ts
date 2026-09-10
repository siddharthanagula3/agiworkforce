import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { GATEWAY_BACKED_HARNESS_IDS, REGISTRY_HARNESS_IDS } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('workflow', () => ({
  FatalError: class FatalError extends Error {},
  RetryableError: class RetryableError extends Error {},
}));

const receipts = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
}));

vi.mock('@/lib/services/cloud-agent-execution-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/cloud-agent-execution-service')>();
  return {
    ...actual,
    claimCloudAgentExecutionOperation: receipts.claim,
    completeCloudAgentExecutionOperation: receipts.complete,
    failCloudAgentExecutionOperation: receipts.fail,
    renewCloudAgentExecutionOperationLease: vi.fn(async () => true),
    fingerprintCloudAgentOperation: () => 'a'.repeat(64),
  };
});

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (provider: string, model: string) => `${provider}/${model}`,
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>();
  return {
    ...actual,
    reserveManagedUsageProviderStep: vi.fn(),
    ManagedUsageRequestError: class ManagedUsageRequestError extends Error {},
  };
});

const mockRecordRouteOutcome = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  getCredentialCooldownSnapshot: vi.fn(async () => ({})),
  providerOfRouteId: (routeId: string) => routeId.split('/')[0],
  recordRouteOutcome: (...args: unknown[]) => mockRecordRouteOutcome(...args),
  recordServedRouteAffinity: vi.fn(async () => undefined),
  routeAffinityTtlMs: () => 3_600_000,
  getRouteHealthSnapshot: vi.fn(async () => ({})),
  getServedRouteAffinity: vi.fn(async () => null),
  getFreeLaneRuntimeState: vi.fn(async () => ({})),
}));

import { FatalError, RetryableError } from 'workflow';
import { executeCloudAgentOperation } from '@/lib/workflows/cloud-agent-operation-executor';
import {
  providerAttemptOperationKey,
  runToolLoop,
  type ToolLoopProviderExecution,
  type ToolLoopProviderStepResult,
} from './tool-loop';
import { createFailoverPlan } from './managed-failover';
import type { ProcessedRequest } from './request-processor';

const GATEWAY_HARNESS = GATEWAY_BACKED_HARNESS_IDS[0];
const VENDOR_HARNESS = REGISTRY_HARNESS_IDS.find(
  (harnessId) => !GATEWAY_BACKED_HARNESS_IDS.includes(harnessId),
);
if (!GATEWAY_HARNESS || !VENDOR_HARNESS) {
  throw new Error('The registry declares no gateway-backed and vendor harness pair to test with');
}

const PINNED_MODEL = 'pinned-model';
const GATEWAY_PROVIDER = 'cheaperinference';
const VENDOR_PROVIDER = 'google';

function gatewayRejection(): Error & { status: number } {
  return Object.assign(
    new Error(`${GATEWAY_PROVIDER} API error (400): This request could not be completed`),
    { status: 400 },
  );
}

function textStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [{ index: 0, delta: { content: text }, finish_reason: 'stop' }],
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });
}

/**
 * Erroring a controller discards whatever is still queued, so the delta has to
 * be pulled and delivered before the failure is raised, or the test proves
 * nothing about a client that has already read it.
 */
function streamThatBreaksAfter(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let delivered = false;
  return new ReadableStream({
    pull(controller) {
      if (!delivered) {
        delivered = true;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`,
          ),
        );
        return;
      }
      controller.error(gatewayRejection());
    },
  });
}

/** A model the user picked, dispatched on the cheapest route, which is a gateway. */
function pinnedOnGateway(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-same-model-route-1',
    chatRequest: { model: PINNED_MODEL, messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: PINNED_MODEL,
    provider: GATEWAY_PROVIDER,
    servingHarnessId: GATEWAY_HARNESS,
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: PINNED_MODEL,
    fallbackModels: [PINNED_MODEL],
    fallbackRoutes: [
      {
        modelKey: PINNED_MODEL,
        provider: VENDOR_PROVIDER,
        routeId: `${VENDOR_PROVIDER}/${PINNED_MODEL}`,
        harnessId: VENDOR_HARNESS as string,
      },
    ],
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: PINNED_MODEL,
      messages: [{ role: 'user', content: 'run this csv through code execution' }],
      max_tokens: 1000,
      stream: true,
    } as never,
  } as ProcessedRequest;
}

function realFailoverPlan(processed: ProcessedRequest) {
  return createFailoverPlan(processed, {
    signal: new AbortController().signal,
    isProviderDispatchable: (provider: string) => provider !== 'openrouter',
  });
}

async function drain(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of generator) out += decoder.decode(value);
  return out;
}

function streamErrorFrom(output: string): { message: string; code?: string } {
  const line = output.split('\n').find((entry) => entry.includes('x_stream_error'));
  expect(line).toBeDefined();
  return JSON.parse(line!.replace(/^data: /, '')).choices[0].delta.x_stream_error;
}

describe('runToolLoop, a gateway that refuses a pinned model before it says anything', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockRecordRouteOutcome.mockClear();
  });

  it('serves the turn from the next route of the same model', async () => {
    mockBuildToolLoopStream
      .mockRejectedValueOnce(gatewayRejection())
      .mockResolvedValueOnce(textStream('Answered on the direct route.'));

    const processed = pinnedOnGateway();
    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: realFailoverPlan(processed) }),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(mockBuildToolLoopStream.mock.calls[1]?.[0]).toBe(VENDOR_PROVIDER);
    expect(output).toContain('Answered on the direct route.');
    expect(output).not.toContain('x_stream_error');
  });

  it('records the outcome against the route that actually served', async () => {
    mockBuildToolLoopStream
      .mockRejectedValueOnce(gatewayRejection())
      .mockResolvedValueOnce(textStream('Answered on the direct route.'));

    const processed = pinnedOnGateway();
    await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: realFailoverPlan(processed) }),
    );

    expect(mockRecordRouteOutcome).toHaveBeenCalledWith(
      `${VENDOR_PROVIDER}/${PINNED_MODEL}`,
      expect.objectContaining({ class: 'success' }),
      expect.any(Number),
    );
  });

  it('never answers with a different model than the one the user picked', async () => {
    mockBuildToolLoopStream
      .mockRejectedValueOnce(gatewayRejection())
      .mockResolvedValueOnce(textStream('Answered on the direct route.'));

    const processed = pinnedOnGateway();
    await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: realFailoverPlan(processed) }),
    );

    const secondAttempt = mockBuildToolLoopStream.mock.calls[1]?.[2] as { model: string };
    expect(secondAttempt.model).toBe(PINNED_MODEL);
  });

  it('does not retry once a text delta has already reached the client', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      streamThatBreaksAfter('Half of an answer the user can already read.'),
    );

    const processed = pinnedOnGateway();
    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: realFailoverPlan(processed) }),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(output).toContain('Half of an answer the user can already read.');
    expect(streamErrorFrom(output).message).not.toBe('');
  });
});

/**
 * The durable transport's twin of the rotation above.
 *
 * `execute-cloud-agent-invocation.ts` wraps every provider step in a durable
 * operation, so a rotation there is not merely a second dispatch, it is a second
 * RECEIPT. Two things follow, and neither is visible from the inline path: the
 * rotated attempt needs an operation of its own, because the first one is
 * already recorded failed under a fingerprint that no longer matches; and a
 * replay has to read that recorded failure and reach the same next route rather
 * than surfacing it as a turn-ending fatal.
 *
 * The receipts below are in memory, everything above them is the real thing:
 * the real tool loop, the real failover plan, the real durable executor.
 */
type Receipt =
  | { status: 'running' }
  | { status: 'completed'; result: Record<string, unknown> }
  | { status: 'failed'; error: Record<string, unknown> };

function receiptLedger(seed: Record<string, Receipt> = {}) {
  const rows = new Map<string, Receipt>(Object.entries(seed));
  const keyOfOperation = new Map<string, string>();

  receipts.claim.mockImplementation(
    async (_db: unknown, { operationKey }: { operationKey: string }) => {
      const row = rows.get(operationKey);
      if (row?.status === 'completed') {
        return { disposition: 'completed', result: row.result, usage: null };
      }
      if (row?.status === 'failed') return { disposition: 'failed', error: row.error };
      rows.set(operationKey, { status: 'running' });
      const operationId = `operation-${keyOfOperation.size + 1}`;
      keyOfOperation.set(operationId, operationKey);
      return {
        disposition: 'acquired',
        operationId,
        leaseToken: `lease-${operationId}`,
        attempt: 1,
      };
    },
  );
  receipts.complete.mockImplementation(
    async (
      _db: unknown,
      { operationId, result }: { operationId: string; result: Record<string, unknown> },
    ) => {
      rows.set(keyOfOperation.get(operationId)!, { status: 'completed', result });
    },
  );
  receipts.fail.mockImplementation(
    async (
      _db: unknown,
      { operationId, error }: { operationId: string; error: Record<string, unknown> },
    ) => {
      rows.set(keyOfOperation.get(operationId)!, { status: 'failed', error });
    },
  );

  return {
    statusOf: (operationKey: string) => rows.get(operationKey)?.status,
    errorOf: (operationKey: string) => {
      const row = rows.get(operationKey);
      return row?.status === 'failed' ? row.error : undefined;
    },
  };
}

const ProviderStepReceiptSchema = z.custom<ToolLoopProviderStepResult>(
  (value) => typeof value === 'object' && value !== null,
);

function durableOptions(processed: ProcessedRequest) {
  return {
    approvalMode: 'auto' as const,
    failover: realFailoverPlan(processed),
    providerExecutor: ({ operationKey, step, request, execute }: ToolLoopProviderExecution) =>
      executeCloudAgentOperation<ToolLoopProviderStepResult>({} as never, {
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
        billingIdempotencyKey: 'agi.chat.web.send.same-model-route-1',
        operationKey,
        operationKind: 'provider' as const,
        retrySafety: 'unsafe' as const,
        payload: { step, request },
        resultSchema: ProviderStepReceiptSchema,
        execute,
      }),
    shouldPropagateExecutionError: (error: unknown) =>
      error instanceof FatalError || error instanceof RetryableError,
  };
}

describe('the durable transport rotates the same pinned model the inline one does', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockRecordRouteOutcome.mockClear();
    receipts.claim.mockReset();
    receipts.complete.mockReset();
    receipts.fail.mockReset();
  });

  it('gives the rotated attempt a durable operation of its own', async () => {
    const ledger = receiptLedger();
    mockBuildToolLoopStream
      .mockRejectedValueOnce(gatewayRejection())
      .mockResolvedValueOnce(textStream('Answered on the direct route.'));

    const processed = pinnedOnGateway();
    const output = await drain(runToolLoop(processed, durableOptions(processed)));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(mockBuildToolLoopStream.mock.calls[1]?.[0]).toBe(VENDOR_PROVIDER);
    expect(output).toContain('Answered on the direct route.');
    expect(output).not.toContain('x_stream_error');
    expect(ledger.statusOf(providerAttemptOperationKey(1, 0))).toBe('failed');
    expect(ledger.statusOf(providerAttemptOperationKey(1, 1))).toBe('completed');
  });

  it('records the failure with the status the rotation decision is taken from', async () => {
    const ledger = receiptLedger();
    mockBuildToolLoopStream
      .mockRejectedValueOnce(gatewayRejection())
      .mockResolvedValueOnce(textStream('Answered on the direct route.'));

    const processed = pinnedOnGateway();
    await drain(runToolLoop(processed, durableOptions(processed)));

    // A receipt carrying only prose cannot reproduce this decision: the same
    // message with no status classifies as `unknown` and never rotates.
    expect(ledger.errorOf(providerAttemptOperationKey(1, 0))).toMatchObject({ status: 400 });
  });

  it('reproduces the rotation from the recorded failure when the run replays', async () => {
    const recorded = gatewayRejection();
    const ledger = receiptLedger({
      [providerAttemptOperationKey(1, 0)]: {
        status: 'failed',
        error: { name: recorded.name, message: recorded.message, status: recorded.status },
      },
    });
    mockBuildToolLoopStream.mockResolvedValueOnce(textStream('Answered on the direct route.'));

    const processed = pinnedOnGateway();
    const output = await drain(runToolLoop(processed, durableOptions(processed)));

    // The refused route is not dispatched a second time: its verdict is on file.
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(mockBuildToolLoopStream.mock.calls[0]?.[0]).toBe(VENDOR_PROVIDER);
    expect(output).toContain('Answered on the direct route.');
    expect(output).not.toContain('x_stream_error');
    expect(ledger.statusOf(providerAttemptOperationKey(1, 1))).toBe('completed');
  });
});
