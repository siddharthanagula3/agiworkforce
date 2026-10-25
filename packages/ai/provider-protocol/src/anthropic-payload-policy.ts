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

/** Whether per-turn content follows the cached system prefix. */
function applyAnthropicCacheControlToSystem(
  system: unknown,
  cacheControl: AnthropicEphemeralCacheControl,
): boolean {
  if (!Array.isArray(system)) {
    return false;
  }

  let perTurnSuffix = false;
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
      perTurnSuffix = true;
      normalizedBlocks.push({
        ...rest,
        text: split.dynamicSuffix,
      });
    }
  }

  system.splice(0, system.length, ...normalizedBlocks);
  return perTurnSuffix;
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

  const perTurnSuffix = applyAnthropicCacheControlToSystem(
    payloadObj['system'],
    policy.cacheControl,
  );
  // Per-turn system content renders ahead of every message, so the next turn
  // can never read a message entry this turn writes: an hour-long write there
  // costs 1.6x a five-minute one and buys nothing.
  applyAnthropicCacheControlToMessages(
    payloadObj['messages'],
    perTurnSuffix ? { type: 'ephemeral' } : policy.cacheControl,
  );
}
