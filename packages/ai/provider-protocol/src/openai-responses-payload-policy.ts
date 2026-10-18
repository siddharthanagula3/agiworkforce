import {
  REGISTRY_ENDPOINT_HOST_RULES,
  REGISTRY_LOCAL_ENDPOINT_HOSTS,
  REGISTRY_LOCAL_ENDPOINT_HOST_SUFFIXES,
  type EndpointHostRule,
} from '@agiworkforce/types';

import { readStringValue } from './lib/string-utils';

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

const LOCAL_ENDPOINT_HOSTS = new Set(REGISTRY_LOCAL_ENDPOINT_HOSTS);

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
