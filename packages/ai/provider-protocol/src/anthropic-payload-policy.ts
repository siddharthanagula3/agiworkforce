import { REGISTRY_ENDPOINT_HOST_RULES, type EndpointHostRule } from '@agiworkforce/types';

import { resolveProviderRequestCapabilities } from './provider-attribution';
import {
  splitSystemPromptCacheBoundary,
  stripSystemPromptCacheBoundary,
} from './system-prompt-cache-boundary';
import { isTurnContextText } from './turn-context';

export type AnthropicServiceTier = 'auto' | 'standard_only';

export interface AnthropicEphemeralCacheControl {
  type: 'ephemeral';
  ttl?: '1h';
}

export interface AnthropicPayloadPolicyInput {
  api?: string;
  baseUrl?: string;
  cacheRetention?: 'short' | 'long' | 'none';
  enableCacheControl?: boolean;
  provider?: string;
  serviceTier?: AnthropicServiceTier;
}

export interface AnthropicPayloadPolicy {
  allowsServiceTier: boolean;
  cacheControl: AnthropicEphemeralCacheControl | undefined;
  serviceTier: AnthropicServiceTier | undefined;
}

export interface AnthropicCacheBreakpointPlan {
  system: AnthropicEphemeralCacheControl | undefined;
  conversation: AnthropicEphemeralCacheControl | undefined;
}

const CONVERSATION_CACHE_CONTROL: AnthropicEphemeralCacheControl = { type: 'ephemeral' };

/**
 * The stable system prefix is the one entry every later turn reads, so it alone
 * takes the policy's TTL, an hour when the turn carries tools. The conversation
 * entry is read only by the next request of a live exchange, seconds or minutes
 * later, so a five-minute write (1.25x input) beats an hour-long one (2x); the
 * ordering rule that an hour-long entry precede every five-minute one holds
 * because the system renders first. A request with no tools and no prior reply
 * ends the exchange, so its conversation entry could never be read.
 */
export function planAnthropicCacheBreakpoints(
  policy: Pick<AnthropicPayloadPolicy, 'cacheControl'>,
  request: { hasTools: boolean; hasAssistantTurn: boolean },
): AnthropicCacheBreakpointPlan {
  if (!policy.cacheControl) return { system: undefined, conversation: undefined };
  return {
    system: policy.cacheControl,
    conversation:
      request.hasTools || request.hasAssistantTurn ? CONVERSATION_CACHE_CONTROL : undefined,
  };
}

function payloadHasTools(payloadObj: Record<string, unknown>): boolean {
  const tools = payloadObj['tools'];
  return Array.isArray(tools) && tools.length > 0;
}

function payloadHasAssistantTurn(payloadObj: Record<string, unknown>): boolean {
  const messages = payloadObj['messages'];
  return (
    Array.isArray(messages) &&
    messages.some(
      (message: unknown) =>
        !!message &&
        typeof message === 'object' &&
        (message as Record<string, unknown>)['role'] === 'assistant',
    )
  );
}

function resolveBaseUrlHostname(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }
}

function longTtlRuleMatches(rule: EndpointHostRule, hostname: string): boolean {
  if (rule.match === 'host') {
    return hostname === rule.pattern;
  }
  if (rule.match === 'hostSuffix') {
    return (
      hostname.endsWith(rule.pattern) &&
      (rule.hostPattern === undefined || new RegExp(rule.hostPattern, 'u').test(hostname))
    );
  }
  return false;
}

function isLongTtlEligibleEndpoint(baseUrl: string | undefined): boolean {
  if (typeof baseUrl !== 'string') {
    return false;
  }
  const hostname = resolveBaseUrlHostname(baseUrl)?.toLowerCase();
  if (!hostname) {
    return false;
  }
  return REGISTRY_ENDPOINT_HOST_RULES.some(
    (rule) => rule.longTtlPromptCache && longTtlRuleMatches(rule, hostname),
  );
}

function resolveAnthropicEphemeralCacheControl(
  baseUrl: string | undefined,
  cacheRetention: AnthropicPayloadPolicyInput['cacheRetention'],
): AnthropicEphemeralCacheControl | undefined {
  const envRetention =
    typeof process !== 'undefined' && process.env?.['AGIWORKFORCE_CACHE_RETENTION'] === 'long'
      ? 'long'
      : 'short';
  const retention = cacheRetention ?? envRetention;
  if (retention === 'none') {
    return undefined;
  }
  const ttl =
    retention === 'long' && (cacheRetention === 'long' || isLongTtlEligibleEndpoint(baseUrl))
      ? '1h'
      : undefined;
  return { type: 'ephemeral', ...(ttl ? { ttl } : {}) };
}

function applyAnthropicCacheControlToSystem(
  system: unknown,
  cacheControl: AnthropicEphemeralCacheControl,
): void {
  if (!Array.isArray(system)) {
    return;
  }

  const normalizedBlocks: Array<unknown> = [];
  for (const block of system) {
    if (!block || typeof block !== 'object') {
      normalizedBlocks.push(block);
      continue;
    }
    const record = block as Record<string, unknown>;
    if (record['type'] !== 'text' || typeof record['text'] !== 'string') {
      normalizedBlocks.push(block);
      continue;
    }
    const split = splitSystemPromptCacheBoundary(record['text']);
    if (!split) {
      if (record['cache_control'] === undefined) {
        record['cache_control'] = cacheControl;
      }
      normalizedBlocks.push(record);
      continue;
    }

    const { cache_control: existingCacheControl, ...rest } = record as Record<string, unknown> & {
      cache_control?: unknown;
    };
    if (split.stablePrefix) {
      normalizedBlocks.push({
        ...rest,
        text: split.stablePrefix,
        cache_control: existingCacheControl ?? cacheControl,
      });
    }
    if (split.dynamicSuffix) {
      normalizedBlocks.push({
        ...rest,
        text: split.dynamicSuffix,
      });
    }
  }

  system.splice(0, system.length, ...normalizedBlocks);
}

function stripAnthropicSystemPromptBoundary(system: unknown): void {
  if (!Array.isArray(system)) {
    return;
  }

  for (const block of system) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const record = block as Record<string, unknown>;
    if (record['type'] === 'text' && typeof record['text'] === 'string') {
      record['text'] = stripSystemPromptCacheBoundary(record['text']);
    }
  }
}

function acceptsMessageBreakpoint(type: unknown): boolean {
  return type === 'text' || type === 'image' || type === 'tool_result';
}

function isTurnContextBlock(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false;
  const record = block as Record<string, unknown>;
  return record['type'] === 'text' && isTurnContextText(record['text']);
}

/**
 * The breakpoint goes on the last block of the conversation itself, ahead of
 * any turn context: the next request carries the same history without this
 * turn's context, so only a breakpoint before it can be read back.
 */
function applyAnthropicCacheControlToMessages(
  messages: unknown,
  cacheControl: AnthropicEphemeralCacheControl,
): void {
  if (!Array.isArray(messages)) return;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message: unknown = messages[index];
    if (!message || typeof message !== 'object') return;
    const record = message as Record<string, unknown>;
    if (record['role'] !== 'user') return;

    const content = record['content'];
    if (typeof content === 'string') {
      if (isTurnContextText(content)) continue;
      record['content'] = [{ type: 'text', text: content, cache_control: cacheControl }];
      return;
    }
    if (!Array.isArray(content)) return;

    for (let blockIndex = content.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block: unknown = content[blockIndex];
      if (isTurnContextBlock(block)) continue;
      if (!block || typeof block !== 'object') return;
      const blockRecord = block as Record<string, unknown>;
      if (acceptsMessageBreakpoint(blockRecord['type'])) {
        blockRecord['cache_control'] = cacheControl;
      }
      return;
    }
  }
}

export function resolveAnthropicPayloadPolicy(
  input: AnthropicPayloadPolicyInput,
): AnthropicPayloadPolicy {
  const capabilities = resolveProviderRequestCapabilities({
    provider: input.provider,
    api: input.api,
    baseUrl: input.baseUrl,
  });

  return {
    allowsServiceTier: capabilities.allowsAnthropicServiceTier,
    cacheControl:
      input.enableCacheControl === true
        ? resolveAnthropicEphemeralCacheControl(input.baseUrl, input.cacheRetention)
        : undefined,
    serviceTier: input.serviceTier,
  };
}

export function applyAnthropicPayloadPolicyToParams(
  payloadObj: Record<string, unknown>,
  policy: AnthropicPayloadPolicy,
): void {
  if (
    policy.allowsServiceTier &&
    policy.serviceTier !== undefined &&
    payloadObj['service_tier'] === undefined
  ) {
    payloadObj['service_tier'] = policy.serviceTier;
  }

  if (!policy.cacheControl) {
    stripAnthropicSystemPromptBoundary(payloadObj['system']);
    return;
  }

  const plan = planAnthropicCacheBreakpoints(policy, {
    hasTools: payloadHasTools(payloadObj),
    hasAssistantTurn: payloadHasAssistantTurn(payloadObj),
  });
  if (plan.system) {
    applyAnthropicCacheControlToSystem(payloadObj['system'], plan.system);
  }
  if (plan.conversation) {
    applyAnthropicCacheControlToMessages(payloadObj['messages'], plan.conversation);
  }
}
