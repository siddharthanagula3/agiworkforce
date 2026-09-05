import { REGISTRY_ENDPOINT_HOST_RULES, type EndpointHostRule } from '@agiworkforce/types';

import { resolveProviderRequestCapabilities } from './provider-attribution';
import {
  splitSystemPromptCacheBoundary,
  stripSystemPromptCacheBoundary,
} from './system-prompt-cache-boundary';

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

function applyAnthropicCacheControlToMessages(
  messages: unknown,
  cacheControl: AnthropicEphemeralCacheControl,
): void {
  if (!Array.isArray(messages) || messages.length === 0) {
    return;
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || typeof lastMessage !== 'object') {
    return;
  }

  const record = lastMessage as Record<string, unknown>;
  if (record['role'] !== 'user') {
    return;
  }

  const content = record['content'];
  if (Array.isArray(content)) {
    const lastBlock = content[content.length - 1];
    if (!lastBlock || typeof lastBlock !== 'object') {
      return;
    }
    const lastBlockRecord = lastBlock as Record<string, unknown>;
    if (
      lastBlockRecord['type'] === 'text' ||
      lastBlockRecord['type'] === 'image' ||
      lastBlockRecord['type'] === 'tool_result'
    ) {
      lastBlockRecord['cache_control'] = cacheControl;
    }
    return;
  }

  if (typeof content === 'string') {
    record['content'] = [
      {
        type: 'text',
        text: content,
        cache_control: cacheControl,
      },
    ];
  }
}

export function resolveAnthropicPayloadPolicy(
  input: AnthropicPayloadPolicyInput,
): AnthropicPayloadPolicy {
  const capabilities = resolveProviderRequestCapabilities({
    provider: input.provider,
    api: input.api,
    baseUrl: input.baseUrl,
    capability: 'llm',
    transport: 'stream',
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

  if (policy.cacheControl) {
    applyAnthropicCacheControlToSystem(payloadObj['system'], policy.cacheControl);
  } else {
    stripAnthropicSystemPromptBoundary(payloadObj['system']);
  }

  if (!policy.cacheControl) {
    return;
  }

  applyAnthropicCacheControlToMessages(payloadObj['messages'], policy.cacheControl);
}

export function applyAnthropicEphemeralCacheControlMarkers(
  payloadObj: Record<string, unknown>,
): void {
  const messages = payloadObj['messages'];
  if (!Array.isArray(messages)) {
    return;
  }

  for (const message of messages as Array<{ role?: string; content?: unknown }>) {
    if (message.role === 'system' || message.role === 'developer') {
      if (typeof message.content === 'string') {
        message.content = [
          { type: 'text', text: message.content, cache_control: { type: 'ephemeral' } },
        ];
        continue;
      }
      if (Array.isArray(message.content) && message.content.length > 0) {
        const last = message.content[message.content.length - 1];
        if (last && typeof last === 'object') {
          const record = last as Record<string, unknown>;
          if (record['type'] !== 'thinking' && record['type'] !== 'redacted_thinking') {
            record['cache_control'] = { type: 'ephemeral' };
          }
        }
      }
      continue;
    }

    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!block || typeof block !== 'object') {
          continue;
        }
        const record = block as Record<string, unknown>;
        if (record['type'] === 'thinking' || record['type'] === 'redacted_thinking') {
          delete record['cache_control'];
        }
      }
    }
  }
}
