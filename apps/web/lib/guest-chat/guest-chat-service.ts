import 'server-only';

import type { KeyValueStore } from '@agiworkforce/key-value';
import {
  OpenAIWireAssembler,
  openAIWireRequestToChatRequest,
  toProviderApiModelId,
} from '@agiworkforce/provider-protocol';
import {
  getDefaultModelFor,
  getGatewayHarness,
  getModelRegistryFacts,
  getRegistryRoute,
  type ChatRequest,
  type StreamChunk,
} from '@agiworkforce/types';

import { estimateTokens } from '@agiworkforce/routing';

import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { logger } from '@/lib/logger';
import {
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  chatSystemPromptSection,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';
import { openRouterFailoverSlugFor, openRouterSlugFor } from '@/lib/services/aggregator-routing';
import { LLMCostCalculator, normalizeProviderId } from '@/lib/services/llm-cost-calculator';
import {
  buildServerProviderAdapter,
  resolveProviderFromModel,
} from '@/lib/services/provider-adapter-service';

import type { GuestChatConfig } from './config';
import { GUEST_CHAT_ERROR_CODES, type GuestChatRequest } from './contract';

const GUEST_PLAN_TIER = 'free';
const OPENROUTER_PROVIDERS: ReadonlySet<string> = new Set(['openrouter', 'open_router']);
const SPEND_KEY_PREFIX = 'guest-chat:spend:';
const SPEND_KEY_TTL_SECONDS = 2 * 24 * 60 * 60;
const GLOBAL_SPEND_SCOPE = 'global';
const UPSTREAM_FAILURE_MESSAGE =
  'The model could not answer just now. Try again, or sign in to use more models.';

export interface GuestChatModel {
  modelKey: string;
  provider: string;
  wireModel: string;
  routeId: string | null;
  zeroDataRetention: boolean;
}

export interface GuestChatUsage {
  inputTokens: number;
  outputTokens: number;
}

function registeredRoute(provider: string, modelKey: string) {
  const candidates = [
    `${provider}/${modelKey}`,
    `${normalizeProviderId(provider) ?? provider}/${modelKey}`,
  ];
  for (const routeId of candidates) {
    const route = getRegistryRoute(routeId);
    if (route) return { routeId, route };
  }
  return null;
}

export function guestChatModel(): GuestChatModel {
  const modelKey = getDefaultModelFor(GUEST_PLAN_TIER, 'chat');
  const provider = resolveProviderFromModel(modelKey);
  const registered = registeredRoute(provider, modelKey);
  const apiModelId = toProviderApiModelId(modelKey);
  const gatewayUpstream =
    registered && (getGatewayHarness(registered.route.harnessId) || !registered.route.isDefault)
      ? registered.route.providerModelId
      : undefined;
  const wireModel =
    gatewayUpstream ??
    (OPENROUTER_PROVIDERS.has(provider)
      ? (openRouterSlugFor(apiModelId) ?? openRouterFailoverSlugFor(apiModelId) ?? apiModelId)
      : apiModelId);
  return {
    modelKey,
    provider,
    wireModel,
    routeId: registered?.routeId ?? null,
    zeroDataRetention: getModelRegistryFacts(modelKey)?.isRouter === true,
  };
}

export function buildGuestChatRequest(
  model: GuestChatModel,
  messages: GuestChatRequest['messages'],
  config: GuestChatConfig,
): ChatRequest {
  const request = openAIWireRequestToChatRequest({
    model: model.wireModel,
    messages: messages.map((message) => ({ role: message.role, content: message.content })),
    max_tokens: config.maxOutputTokens,
    stream: true,
  });
  return {
    ...request,
    system: chatSystemPromptSection(
      chatSystemPromptSections(CHAT_SYSTEM_PROMPT_PINNED_VERSION),
      'identity',
    ),
    ...(model.zeroDataRetention ? { zeroDataRetentionOnly: true } : {}),
  };
}

function withUsage(current: GuestChatUsage | null, chunk: StreamChunk): GuestChatUsage | null {
  if (chunk.type !== 'usage') return current;
  return {
    inputTokens: chunk.inputTokens ?? current?.inputTokens ?? 0,
    outputTokens: chunk.outputTokens ?? current?.outputTokens ?? 0,
  };
}

export function streamGuestChat(input: {
  model: GuestChatModel;
  chatRequest: ChatRequest;
  signal: AbortSignal;
  onSettled: (usage: GuestChatUsage | null) => Promise<void>;
}): ReadableStream<Uint8Array> {
  const adapter = buildServerProviderAdapter(input.model.provider);
  const assembler = new OpenAIWireAssembler({
    model: input.model.modelKey,
    wireMode: resolveWireMode(input.model.provider),
  });
  const encoder = new TextEncoder();
  const frame = (event: unknown) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let usage: GuestChatUsage | null = null;
      try {
        for await (const chunk of adapter.stream(input.chatRequest, input.signal)) {
          usage = withUsage(usage, chunk);
          for (const event of assembler.sseChunks(chunk)) controller.enqueue(frame(event));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        if (!input.signal.aborted) {
          logger.warn(
            { error, provider: input.model.provider, model: input.model.modelKey },
            '[guest-chat] the provider stream failed',
          );
          const failure = {
            type: 'error',
            code: GUEST_CHAT_ERROR_CODES.upstream,
            message: UPSTREAM_FAILURE_MESSAGE,
            retryable: true,
          } as StreamChunk;
          for (const event of assembler.sseChunks(failure)) controller.enqueue(frame(event));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        }
      } finally {
        await input.onSettled(usage).catch((error: unknown) => {
          logger.warn({ error }, '[guest-chat] settling the turn failed');
        });
        if (!input.signal.aborted) controller.close();
      }
    },
  });
}

export function guestSpendKey(now: Date, scope: string = GLOBAL_SPEND_SCOPE): string {
  const day = now.toISOString().slice(0, 10);
  return scope === GLOBAL_SPEND_SCOPE
    ? `${SPEND_KEY_PREFIX}${day}`
    : `${SPEND_KEY_PREFIX}${scope}:${day}`;
}

export type GuestSpendLimit = 'device' | 'ip' | 'global';

export interface GuestSpendHold {
  keys: readonly string[];
  reservedMicrousd: number;
}

export type GuestSpendAdmission =
  { ok: true; hold: GuestSpendHold } | { ok: false; limit: GuestSpendLimit };

function guestTurnCostMicrousd(model: GuestChatModel, usage: GuestChatUsage, now: Date): number {
  return LLMCostCalculator.calculateCostMicrousd(
    model.provider,
    model.modelKey,
    {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
    },
    now,
    model.routeId,
  );
}

/**
 * The most a turn can cost: every message it carries as input and the whole
 * output ceiling. Throws when the model cannot be priced, so an unpriced turn
 * is never admitted.
 */
export function estimateGuestTurnMicrousd(
  model: GuestChatModel,
  chatRequest: ChatRequest,
  now: Date,
): number {
  const text = [
    typeof chatRequest.system === 'string'
      ? chatRequest.system
      : JSON.stringify(chatRequest.system),
    ...chatRequest.messages.map((message) =>
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
    ),
  ].join('\n');
  return guestTurnCostMicrousd(
    model,
    {
      inputTokens: estimateTokens(text, model.modelKey),
      outputTokens: chatRequest.maxOutputTokens ?? 0,
    },
    now,
  );
}

/**
 * Holds a turn's most expensive outcome against the visitor's device, its
 * network and every guest together, before the provider is called. A turn
 * that would take any of the three past its daily cap is refused and nothing
 * is held.
 */
export async function reserveGuestSpend(input: {
  store: KeyValueStore;
  now: Date;
  visitorId: string;
  networkId: string;
  amountMicrousd: number;
  config: Pick<
    GuestChatConfig,
    'deviceSpendMicrousdPerDay' | 'ipSpendMicrousdPerDay' | 'globalSpendMicrousdPerDay'
  >;
}): Promise<GuestSpendAdmission> {
  const amount = Math.max(0, Math.ceil(input.amountMicrousd));
  const scopes: ReadonlyArray<{ limit: GuestSpendLimit; key: string; cap: number }> = [
    {
      limit: 'global',
      key: guestSpendKey(input.now),
      cap: input.config.globalSpendMicrousdPerDay,
    },
    {
      limit: 'ip',
      key: guestSpendKey(input.now, `ip:${input.networkId}`),
      cap: input.config.ipSpendMicrousdPerDay,
    },
    {
      limit: 'device',
      key: guestSpendKey(input.now, `device:${input.visitorId}`),
      cap: input.config.deviceSpendMicrousdPerDay,
    },
  ];
  const held: string[] = [];
  for (const scope of scopes) {
    const total = await input.store.increment(scope.key, amount);
    held.push(scope.key);
    await input.store.expire(scope.key, SPEND_KEY_TTL_SECONDS);
    if (total > scope.cap) {
      for (const key of held) await input.store.increment(key, -amount);
      return { ok: false, limit: scope.limit };
    }
  }
  return { ok: true, hold: { keys: held, reservedMicrousd: amount } };
}

/**
 * Replaces the held estimate with what the turn cost. A turn whose usage never
 * arrived, or whose cost cannot be computed, keeps its whole hold: the
 * provider may have billed it.
 */
export async function settleGuestSpend(input: {
  store: KeyValueStore;
  hold: GuestSpendHold;
  model: GuestChatModel;
  usage: GuestChatUsage | null;
  now: Date;
}): Promise<number> {
  if (!input.usage) return input.hold.reservedMicrousd;
  let cost: number;
  try {
    cost = guestTurnCostMicrousd(input.model, input.usage, input.now);
  } catch (error) {
    logger.error(
      { error, provider: input.model.provider, model: input.model.modelKey },
      '[guest-chat] the turn could not be priced; its whole hold stays spent',
    );
    return input.hold.reservedMicrousd;
  }
  const delta = Math.max(0, Math.ceil(cost)) - input.hold.reservedMicrousd;
  if (delta !== 0) {
    for (const key of input.hold.keys) await input.store.increment(key, delta);
  }
  return input.hold.reservedMicrousd + delta;
}
