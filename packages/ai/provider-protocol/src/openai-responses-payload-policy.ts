import {
  REGISTRY_ENDPOINT_HOST_RULES,
  REGISTRY_LOCAL_ENDPOINT_HOSTS,
  REGISTRY_LOCAL_ENDPOINT_HOST_SUFFIXES,
  type EndpointHostRule,
} from '@agiworkforce/types';

import { readStringValue } from './lib/string-utils';
import { supportsOpenAIReasoningEffort } from './openai-reasoning-effort';

export type OpenAIResponsesPayloadModel = {
  api?: unknown;
  baseUrl?: unknown;
  id?: unknown;
  provider?: unknown;
  contextWindow?: unknown;
  compat?: unknown;
};

export type OpenAIResponsesPayloadPolicyOptions = {
  extraParams?: Record<string, unknown>;
  storeMode?: 'provider-policy' | 'disable' | 'preserve';
  enablePromptCacheStripping?: boolean;
  enableServerCompaction?: boolean;
};

export type OpenAIResponsesEndpointClass =
  | 'default'
  | 'anthropic-public'
  | 'chutes-native'
  | 'deepseek-native'
  | 'github-copilot-native'
  | 'groq-native'
  | 'mistral-public'
  | 'moonshot-native'
  | 'modelstudio-native'
  | 'openai-public'
  | 'openai-codex'
  | 'opencode-native'
  | 'openrouter'
  | 'xai-native'
  | 'zai-native'
  | 'google-generative-ai'
  | 'google-vertex'
  | 'local'
  | 'custom'
  | 'invalid';

export type OpenAIResponsesPayloadPolicy = {
  allowsServiceTier: boolean;
  compactThreshold: number;
  explicitStore: boolean | undefined;
  shouldStripDisabledReasoningPayload: boolean;
  shouldStripPromptCache: boolean;
  shouldStripStore: boolean;
  useServerCompaction: boolean;
};

type OpenAIResponsesPayloadCapabilities = {
  allowsOpenAIServiceTier: boolean;
  allowsResponsesStore: boolean;
  shouldStripResponsesPromptCache: boolean;
  supportsResponsesStoreField: boolean;
  usesKnownNativeOpenAIRoute: boolean;
};

const OPENAI_RESPONSES_APIS = new Set(['openai-responses', 'openai-codex-responses']);
const OPENAI_RESPONSES_PROVIDERS = new Set(['openai']);
const LOCAL_ENDPOINT_HOSTS = new Set(REGISTRY_LOCAL_ENDPOINT_HOSTS);

function normalizeLowercaseString(value: unknown): string | undefined {
  const stringValue = readStringValue(value)?.trim().toLowerCase();
  return stringValue ? stringValue : undefined;
}

function normalizeComparableBaseUrl(value: unknown): string | undefined {
  const trimmed = readStringValue(value)?.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsedValue = /^[a-z0-9.[\]-]+(?::\d+)?(?:[/?#].*)?$/i.test(trimmed)
    ? `https://${trimmed}`
    : trimmed;
  try {
    const url = new URL(parsedValue);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return undefined;
  }
}

function resolveUrlHostname(value: unknown): string | undefined {
  const trimmed = readStringValue(value)?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`https://${trimmed}`).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return suffix.startsWith('.') || suffix.startsWith('-')
    ? host.endsWith(suffix)
    : host === suffix || host.endsWith(`.${suffix}`);
}

function isLocalEndpointHost(host: string): boolean {
  return (
    LOCAL_ENDPOINT_HOSTS.has(host) ||
    REGISTRY_LOCAL_ENDPOINT_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

function endpointRuleMatches(
  rule: EndpointHostRule,
  host: string,
  comparableBaseUrl: string | undefined,
): boolean {
  switch (rule.match) {
    case 'host':
      return host === rule.pattern;
    case 'hostSuffix':
      return (
        host.endsWith(rule.pattern) &&
        (rule.hostPattern === undefined || new RegExp(rule.hostPattern, 'u').test(host))
      );
    case 'domain':
      return hostMatchesSuffix(host, rule.pattern);
    case 'baseUrl':
      return comparableBaseUrl === rule.pattern;
  }
}

export function resolveBundledOpenAIResponsesEndpointClass(
  baseUrl: unknown,
): OpenAIResponsesEndpointClass {
  const trimmed = readStringValue(baseUrl)?.trim();
  if (!trimmed) {
    return 'default';
  }
  const host = resolveUrlHostname(trimmed);
  if (!host) {
    return 'invalid';
  }
  const comparableBaseUrl = normalizeComparableBaseUrl(trimmed);

  for (const rule of REGISTRY_ENDPOINT_HOST_RULES) {
    if (endpointRuleMatches(rule, host, comparableBaseUrl)) {
      return rule.endpointClass as OpenAIResponsesEndpointClass;
    }
  }

  if (isLocalEndpointHost(host)) {
    return 'local';
  }
  return 'custom';
}

function isOpenAIResponsesApi(api: string | undefined): boolean {
  return api !== undefined && OPENAI_RESPONSES_APIS.has(api);
}

function readCompatPayloadBoolean(
  compat: unknown,
  key: 'supportsPromptCacheKey' | 'supportsStore',
): boolean | undefined {
  if (!compat || typeof compat !== 'object') {
    return undefined;
  }
  const value = (compat as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}

function resolveOpenAIResponsesPayloadCapabilities(
  model: OpenAIResponsesPayloadModel,
): OpenAIResponsesPayloadCapabilities {
  const provider = normalizeLowercaseString(model.provider);
  const api = normalizeLowercaseString(model.api);
  const endpointClass = resolveBundledOpenAIResponsesEndpointClass(model.baseUrl);
  const isResponsesApi = isOpenAIResponsesApi(api);
  const usesConfiguredBaseUrl = endpointClass !== 'default';
  const usesKnownNativeOpenAIEndpoint =
    endpointClass === 'openai-public' || endpointClass === 'openai-codex';
  const usesKnownNativeOpenAIRoute =
    endpointClass === 'default' ? provider === 'openai' : usesKnownNativeOpenAIEndpoint;
  const usesExplicitProxyLikeEndpoint = usesConfiguredBaseUrl && !usesKnownNativeOpenAIEndpoint;
  const promptCacheKeySupport = readCompatPayloadBoolean(model.compat, 'supportsPromptCacheKey');
  const shouldStripResponsesPromptCache =
    promptCacheKeySupport === true
      ? false
      : promptCacheKeySupport === false
        ? isResponsesApi
        : isResponsesApi && usesExplicitProxyLikeEndpoint;
  const supportsResponsesStoreField =
    readCompatPayloadBoolean(model.compat, 'supportsStore') !== false && isResponsesApi;

  return {
    allowsOpenAIServiceTier:
      (provider === 'openai' && api === 'openai-responses' && endpointClass === 'openai-public') ||
      (provider === 'openai-codex' &&
        (api === 'openai-codex-responses' || api === 'openai-responses') &&
        endpointClass === 'openai-codex'),
    allowsResponsesStore:
      supportsResponsesStoreField &&
      provider !== undefined &&
      OPENAI_RESPONSES_PROVIDERS.has(provider) &&
      usesKnownNativeOpenAIEndpoint,
    shouldStripResponsesPromptCache,
    supportsResponsesStoreField,
    usesKnownNativeOpenAIRoute,
  };
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function resolveOpenAIResponsesCompactThreshold(model: { contextWindow?: unknown }): number {
  const contextWindow = parsePositiveInteger(model.contextWindow);
  if (contextWindow) {
    return Math.max(1_000, Math.floor(contextWindow * 0.7));
  }
  return 80_000;
}

function shouldEnableOpenAIResponsesServerCompaction(
  explicitStore: boolean | undefined,
  provider: unknown,
  extraParams: Record<string, unknown> | undefined,
): boolean {
  const configured = extraParams?.['responsesServerCompaction'];
  if (configured === false) {
    return false;
  }
  if (explicitStore !== true) {
    return false;
  }
  if (configured === true) {
    return true;
  }
  return provider === 'openai';
}

function stripDisabledOpenAIReasoningPayload(payloadObj: Record<string, unknown>): void {
  const reasoning = payloadObj['reasoning'];
  if (reasoning === 'none') {
    delete payloadObj['reasoning'];
    return;
  }
  if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) {
    return;
  }

  const reasoningObj = reasoning as Record<string, unknown>;
  if (reasoningObj['effort'] === 'none') {
    delete payloadObj['reasoning'];
  }
}

export function resolveOpenAIResponsesPayloadPolicy(
  model: OpenAIResponsesPayloadModel,
  options: OpenAIResponsesPayloadPolicyOptions = {},
): OpenAIResponsesPayloadPolicy {
  const capabilities = resolveOpenAIResponsesPayloadCapabilities(model);
  const storeMode = options.storeMode ?? 'provider-policy';
  const explicitStore =
    storeMode === 'preserve'
      ? undefined
      : storeMode === 'disable'
        ? capabilities.supportsResponsesStoreField
          ? false
          : undefined
        : capabilities.allowsResponsesStore
          ? true
          : undefined;
  const isResponsesApi = isOpenAIResponsesApi(normalizeLowercaseString(model.api));
  const shouldStripDisabledReasoningPayload =
    isResponsesApi &&
    (!capabilities.usesKnownNativeOpenAIRoute || !supportsOpenAIReasoningEffort(model, 'none'));

  return {
    allowsServiceTier: capabilities.allowsOpenAIServiceTier,
    compactThreshold:
      parsePositiveInteger(options.extraParams?.['responsesCompactThreshold']) ??
      resolveOpenAIResponsesCompactThreshold(model),
    explicitStore,
    shouldStripDisabledReasoningPayload,
    shouldStripPromptCache:
      options.enablePromptCacheStripping === true && capabilities.shouldStripResponsesPromptCache,
    shouldStripStore:
      explicitStore !== true &&
      readCompatPayloadBoolean(model.compat, 'supportsStore') === false &&
      isResponsesApi,
    useServerCompaction:
      options.enableServerCompaction === true &&
      shouldEnableOpenAIResponsesServerCompaction(
        explicitStore,
        model.provider,
        options.extraParams,
      ),
  };
}

export function applyOpenAIResponsesPayloadPolicy(
  payloadObj: Record<string, unknown>,
  policy: OpenAIResponsesPayloadPolicy,
): void {
  if (policy.explicitStore !== undefined) {
    payloadObj['store'] = policy.explicitStore;
  }
  if (policy.shouldStripStore) {
    delete payloadObj['store'];
  }
  if (policy.shouldStripPromptCache) {
    delete payloadObj['prompt_cache_key'];
    delete payloadObj['prompt_cache_retention'];
  }
  if (policy.useServerCompaction && payloadObj['context_management'] === undefined) {
    payloadObj['context_management'] = [
      {
        type: 'compaction',
        compact_threshold: policy.compactThreshold,
      },
    ];
  }
  if (policy.shouldStripDisabledReasoningPayload) {
    stripDisabledOpenAIReasoningPayload(payloadObj);
  }
}
