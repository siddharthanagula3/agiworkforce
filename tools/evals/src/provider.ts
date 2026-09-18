/**
 * Live responder over the product's provider layer.
 *
 * The adapter is whatever `packages/ai/providers/factory` constructs for the
 * model's registry route, so a live eval dispatches on the same code the
 * product does. Usage and cost are what that adapter's stream metered; when the
 * adapter reports no cost, it is priced from the route's registry pricing and
 * labelled as such.
 *
 * @module evals/provider
 * @packageDocumentation
 */

import { DEFAULT_MAX_OUTPUT_TOKENS, buildRequest, type EvalRequest } from './request';
import type { EvalDataset, EvalToolCall, ModelResponse, Responder, ResponseUsage } from './types';

export interface StreamChunkLike {
  readonly type: string;
  readonly [field: string]: unknown;
}

export interface ProviderChatRequest extends EvalRequest {
  readonly model: string;
  /**
   * Correlation id of this attempt. Deliberately outside `EvalRequest`, which
   * is what the recording fingerprints: an id that changed every run would make
   * every recording stale.
   */
  readonly correlationId?: string;
}

/**
 * A stream that failed after the provider had already metered something.
 *
 * The tokens are spent whether or not the answer arrived, so the partial
 * response travels with the error and the run prices the retry from it.
 */
export class EvalStreamError extends Error {
  readonly partial: ModelResponse;

  constructor(message: string, partial: ModelResponse) {
    super(message);
    this.name = 'EvalStreamError';
    this.partial = partial;
  }
}

export function partialResponseOf(error: unknown): ModelResponse | null {
  return error instanceof EvalStreamError ? error.partial : null;
}

export interface StreamingAdapter {
  stream(request: ProviderChatRequest, signal: AbortSignal): AsyncIterable<StreamChunkLike>;
}

export interface PricingTier {
  readonly thresholdTokens: number;
  readonly inputPerMillion?: number;
  readonly outputPerMillion?: number;
  readonly cacheReadPerMillion?: number;
  readonly cacheWritePerMillion?: number;
}

export interface RoutePricing {
  readonly inputPerMillion?: number;
  readonly outputPerMillion?: number;
  readonly cacheReadPerMillion?: number;
  readonly cacheWritePerMillion?: number;
  readonly inputTokenPricingTiers?: readonly PricingTier[];
}

export const DEFAULT_CASE_TIMEOUT_MS = 180_000;
const TOKENS_PER_MILLION = 1_000_000;

function numberField(chunk: StreamChunkLike, field: string): number | undefined {
  const value = chunk[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function catalogCostUsd(usage: ResponseUsage, pricing: RoutePricing): number | null {
  if (pricing.inputPerMillion === undefined || pricing.outputPerMillion === undefined) return null;
  const inputTokens = usage.inputTokens ?? 0;
  const tier = [...(pricing.inputTokenPricingTiers ?? [])]
    .filter((entry) => inputTokens > entry.thresholdTokens)
    .sort((left, right) => right.thresholdTokens - left.thresholdTokens)[0];
  const input = tier?.inputPerMillion ?? pricing.inputPerMillion;
  const output = tier?.outputPerMillion ?? pricing.outputPerMillion;
  const cacheRead = tier?.cacheReadPerMillion ?? pricing.cacheReadPerMillion ?? input;
  const cacheWrite = tier?.cacheWritePerMillion ?? pricing.cacheWritePerMillion ?? input;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const uncachedInput = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  return (
    (uncachedInput * input +
      cacheReadTokens * cacheRead +
      cacheWriteTokens * cacheWrite +
      (usage.outputTokens ?? 0) * output) /
    TOKENS_PER_MILLION
  );
}

interface PendingCall {
  readonly id: string;
  readonly name: string;
  json: string;
}

export async function collectResponse(
  chunks: AsyncIterable<StreamChunkLike>,
  now: () => number,
  pricing: RoutePricing | null,
): Promise<ModelResponse> {
  const startedAt = now();
  let ttfbMs: number | undefined;
  let text = '';
  let stopReason: string | undefined;
  let providerCost: number | undefined;
  const usage: Record<string, number> = {};
  const calls = new Map<string, PendingCall>();

  const finalise = (): ModelResponse => {
    const latencyMs = Math.round(now() - startedAt);
    const toolCalls: EvalToolCall[] = [...calls.values()].map((call) => {
      let input: Record<string, unknown> = {};
      try {
        const parsed: unknown = call.json.trim().length === 0 ? {} : JSON.parse(call.json);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          input = parsed as Record<string, unknown>;
        }
      } catch {
        input = { __unparsedArguments: call.json };
      }
      return { id: call.id, name: call.name, input };
    });
    const responseUsage = usage as ResponseUsage;
    const hasUsage = Object.keys(usage).length > 0;
    const catalogCost =
      hasUsage && pricing !== null ? catalogCostUsd(responseUsage, pricing) : null;

    return {
      text,
      ...(stopReason === undefined ? {} : { stopReason }),
      ...(toolCalls.length === 0 ? {} : { toolCalls }),
      ...(hasUsage ? { usage: responseUsage } : {}),
      ...(providerCost !== undefined
        ? { costUsd: providerCost, costSource: 'provider' as const }
        : catalogCost !== null
          ? { costUsd: catalogCost, costSource: 'catalog' as const }
          : {}),
      latencyMs,
      ...(ttfbMs === undefined ? {} : { ttfbMs }),
    };
  };

  for await (const chunk of chunks) {
    switch (chunk.type) {
      case 'text-delta':
        ttfbMs ??= Math.round(now() - startedAt);
        text += typeof chunk['delta'] === 'string' ? chunk['delta'] : '';
        break;
      case 'thinking-delta':
        ttfbMs ??= Math.round(now() - startedAt);
        break;
      case 'tool-use-start': {
        ttfbMs ??= Math.round(now() - startedAt);
        const id = String(chunk['toolUseId']);
        calls.set(id, { id, name: String(chunk['name']), json: '' });
        break;
      }
      case 'tool-use-delta': {
        const pending = calls.get(String(chunk['toolUseId']));
        if (pending !== undefined && typeof chunk['deltaJson'] === 'string') {
          pending.json += chunk['deltaJson'];
        }
        break;
      }
      case 'usage':
        for (const field of [
          'inputTokens',
          'outputTokens',
          'reasoningTokens',
          'cacheReadTokens',
          'cacheWriteTokens',
        ]) {
          const value = numberField(chunk, field);
          if (value !== undefined) usage[field] = value;
        }
        providerCost =
          numberField(chunk, 'costUsd') ??
          numberField(chunk, 'providerReportedCostUsd') ??
          providerCost;
        break;
      case 'stop':
        stopReason = typeof chunk['reason'] === 'string' ? chunk['reason'] : stopReason;
        break;
      case 'error':
        throw new EvalStreamError(
          `provider error: ${String(chunk['message'] ?? 'unknown')}`,
          finalise(),
        );
      default:
        break;
    }
  }

  return finalise();
}

export interface ProviderResponderOptions {
  readonly adapter: StreamingAdapter;
  readonly providerModelId: string;
  readonly dataset: EvalDataset;
  readonly pricing: RoutePricing | null;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

export function providerResponder(options: ProviderResponderOptions): Responder {
  const now = options.now ?? (() => performance.now());
  return async (evalCase, context) => {
    const request = buildRequest(
      evalCase,
      options.dataset.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    );
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_CASE_TIMEOUT_MS,
    );
    try {
      return await collectResponse(
        options.adapter.stream(
          {
            ...request,
            model: options.providerModelId,
            ...(context === undefined ? {} : { correlationId: context.correlationId }),
          },
          controller.signal,
        ),
        now,
        options.pricing,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
