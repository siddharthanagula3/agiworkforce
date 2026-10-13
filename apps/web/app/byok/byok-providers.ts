import { modelsCatalogJson } from '@agiworkforce/types';
import { CLI_CATALOG_PROVIDER_IDS, CLI_KEY_PROVIDERS } from '@/lib/byok-providers';

export const BYOK_PROVIDER_IDS: ReadonlyArray<string> = CLI_CATALOG_PROVIDER_IDS;

const catalogProviders = modelsCatalogJson.providers as Record<string, { label?: string }>;

export function byokProviderLabels(): string[] {
  return CLI_KEY_PROVIDERS.map((provider) =>
    provider.catalogId === null
      ? provider.label
      : (catalogProviders[provider.catalogId]?.label ?? provider.label),
  );
}
