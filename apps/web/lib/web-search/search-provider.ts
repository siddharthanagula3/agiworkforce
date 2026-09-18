import {
  createSearchSource,
  dedupeSearchSources,
  isSourceDelivery,
  type SearchSource,
  type SourceDelivery,
} from '@agiworkforce/types';
import { createProviderRegistry } from '@agiworkforce/data-layer/search';

import providerConfig from './web-search-providers.json';

export interface WebSearchProviderDescriptor {
  id: string;
  host: string;
  apiKeyEnv: string;
  delivery: SourceDelivery;
}

interface WebSearchProviderConfigEntry {
  id: string;
  host: string;
  apiKeyEnv: string;
  delivery: string;
}

const descriptors: readonly WebSearchProviderDescriptor[] = (
  (providerConfig as { providers: WebSearchProviderConfigEntry[] }).providers ?? []
).map((entry) => ({
  id: entry.id,
  host: entry.host.toLowerCase(),
  apiKeyEnv: entry.apiKeyEnv,
  delivery: isSourceDelivery(entry.delivery) ? entry.delivery : 'external',
}));

const registry = createProviderRegistry<WebSearchProvider>();

export function webSearchProviderDescriptors(): readonly WebSearchProviderDescriptor[] {
  return descriptors;
}

export function webSearchProviderDescriptor(id: string): WebSearchProviderDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.id === id);
}

/** An adapter finds its own descriptor from the endpoint it already declares. */
export function webSearchProviderDescriptorForHost(
  host: string,
): WebSearchProviderDescriptor | undefined {
  const wanted = host.toLowerCase();
  return descriptors.find((descriptor) => descriptor.host === wanted);
}

/**
 * The hosts the egress allowlist must vouch for because a provider is
 * configured, not because someone typed a vendor name into the allowlist.
 */
export function webSearchProviderHosts(): string[] {
  return [
    ...new Set([
      ...descriptors.map((descriptor) => descriptor.host),
      ...registry.list().flatMap((provider) => (provider.host ? [provider.host] : [])),
    ]),
  ];
}

export type WebSearchProviderErrorCode =
  'not_configured' | 'rate_limited' | 'upstream_error' | 'cancelled' | 'timeout';

export interface WebSearchProviderItem {
  url: string;
  title: string;
  snippet: string;
  /** What the publisher says, when it says anything. */
  publishedAt?: string | null;
  /** When the provider indexed the page, when it reports it. */
  indexedAt?: string | null;
}

export type WebSearchProviderOutcome =
  | { ok: true; items: WebSearchProviderItem[] }
  | {
      ok: false;
      errorCode: WebSearchProviderErrorCode;
      error: string;
      status?: number;
      retryable?: boolean;
    };

export interface WebSearchProviderRequest {
  query: string;
  maxResults: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface WebSearchCostInput {
  userId: string;
  organizationId: string | null;
  turnRef: string;
  calls: number;
  surface: string | null;
  customerChargeCents: number | null;
}

export interface WebSearchProvider {
  readonly id: string;
  readonly delivery: SourceDelivery;
  /** The host the egress policy must vouch for, when the provider reaches one. */
  readonly host?: string;
  isConfigured(overrides?: { apiKey?: string }): boolean;
  search(request: WebSearchProviderRequest): Promise<WebSearchProviderOutcome>;
  /** Present when the provider bills per call, so the caller never names a vendor. */
  recordCost?(input: WebSearchCostInput): Promise<void>;
}

export function registerWebSearchProvider(provider: WebSearchProvider): void {
  registry.register(provider);
}

export function unregisterWebSearchProvider(id: string): boolean {
  return registry.unregister(id);
}

export function webSearchProvider(id: string): WebSearchProvider | undefined {
  return registry.get(id);
}

/** How a provider's results reached this turn, 'external' when nothing declares it. */
export function webSearchDelivery(providerId: string): SourceDelivery {
  return (
    registry.get(providerId)?.delivery ??
    webSearchProviderDescriptor(providerId)?.delivery ??
    'external'
  );
}

/**
 * Configured providers in declaration order, which is the order a failure
 * falls through. An unregistered descriptor is skipped rather than throwing:
 * a provider whose adapter was never loaded cannot run a search.
 */
export function configuredWebSearchProviders(
  overrides: { apiKey?: string } = {},
): WebSearchProvider[] {
  const declared = descriptors.map((descriptor) => descriptor.id);
  const ordered = [
    ...declared.flatMap((id) => {
      const provider = registry.get(id);
      return provider ? [provider] : [];
    }),
    ...registry.list().filter((provider) => !declared.includes(provider.id)),
  ];
  return ordered.filter((provider) => provider.isConfigured(overrides));
}

export function isWebSearchProviderKeyPresent(descriptor: WebSearchProviderDescriptor): boolean {
  return Boolean(process.env[descriptor.apiKeyEnv]);
}

export interface WebSearchSourceInput {
  url: string;
  title?: string;
  snippet?: string;
  date?: string;
  indexedAt?: string | null;
}

/**
 * Every web result becomes the same canonical source the rest of the product
 * cites, with the provider's delivery tag so a result served from an index is
 * never presented as a live fetch.
 */
export function webSearchSources(input: {
  providerId: string;
  results: readonly WebSearchSourceInput[];
  retrievedAt: string;
  now?: Date;
}): SearchSource[] {
  const delivery = webSearchDelivery(input.providerId);
  return dedupeSearchSources(
    input.results.map((result) =>
      createSearchSource({
        url: result.url,
        title: result.title ?? '',
        snippet: result.snippet ?? '',
        providerId: input.providerId,
        delivery,
        retrievedAt: input.retrievedAt,
        indexedAt: result.indexedAt ?? null,
        publishedAt: result.date ?? null,
        ...(input.now ? { now: input.now } : {}),
      }),
    ),
  );
}
