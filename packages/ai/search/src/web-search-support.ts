
import { getProvidersWithImplementedHarnessFeature } from '@agiworkforce/types';

export const WEB_SEARCH_INJECTION_PROVIDERS: ReadonlySet<string> = new Set(
  getProvidersWithImplementedHarnessFeature('webSearchInjection'),
);

export function providerInjectsWebSearchTool(provider: string | undefined | null): boolean {
  return provider ? WEB_SEARCH_INJECTION_PROVIDERS.has(provider.toLowerCase()) : false;
}

export const WEB_SEARCH_CAPABLE_PROVIDERS: ReadonlySet<string> = new Set(
  getProvidersWithImplementedHarnessFeature('webSearch'),
);

export function providerSupportsWebSearch(provider: string | undefined | null): boolean {
  return provider ? WEB_SEARCH_CAPABLE_PROVIDERS.has(provider.toLowerCase()) : false;
}

export function webSearchNeedsGenericTool(provider: string | undefined | null): boolean {
  if (!provider) return false;
  return !WEB_SEARCH_CAPABLE_PROVIDERS.has(provider.toLowerCase());
}

export interface WebSearchAvailabilityInput {
  provider: string | undefined | null;
  modelSupportsNativeSearch: boolean | undefined;
  modelSupportsTools: boolean | undefined;
  genericBackendConfigured: boolean;
}

export function isWebSearchAvailable({
  provider,
  modelSupportsNativeSearch,
  modelSupportsTools,
  genericBackendConfigured,
}: WebSearchAvailabilityInput): boolean {
  if (!provider) return false;
  if (providerSupportsWebSearch(provider)) return modelSupportsNativeSearch === true;
  return (
    webSearchNeedsGenericTool(provider) && modelSupportsTools === true && genericBackendConfigured
  );
}
