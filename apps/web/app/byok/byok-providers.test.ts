import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { modelsCatalogJson } from '@agiworkforce/types';
import {
  CLI_CATALOG_PROVIDER_IDS,
  CLI_KEY_PROVIDERS,
  CLI_KEY_PROVIDERS_OUTSIDE_CATALOG,
  CLI_SEARCH_KEYS,
  SELF_HOSTED_KEY_PROVIDERS,
} from '@/lib/byok-providers';
import { BYOK_PROVIDER_IDS, byokProviderLabels } from './byok-providers';

const WEB_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const CLI_AUTH = readFileSync(join(REPO_ROOT, 'apps/cli/src/auth.rs'), 'utf8');
const CLI_MODEL_CATALOG = readFileSync(join(REPO_ROOT, 'apps/cli/src/model_catalog.rs'), 'utf8');
const SERVER_ADAPTERS = readFileSync(
  join(WEB_ROOT, 'lib/services/provider-adapter-service.ts'),
  'utf8',
);
const SEARCH_KEY_SUFFIX = ' (web search)';

const catalogProviders = modelsCatalogJson.providers as Record<string, { label?: string }>;
const catalogProviderIds = Object.keys(catalogProviders);

interface CliKeyProviderRow {
  id: string;
  label: string;
  envVar: string;
}

function cliApiKeyProviders(): CliKeyProviderRow[] {
  const table = /const API_KEY_PROVIDERS: &\[ApiKeyProvider\] = &\[([\s\S]*?)\n\];/u.exec(CLI_AUTH);
  if (!table) throw new Error('API_KEY_PROVIDERS not found in apps/cli/src/auth.rs');
  return [
    ...table[1]!.matchAll(
      /ApiKeyProvider \{\s*id: "([^"]+)",\s*label: "([^"]+)",\s*env_var: "([^"]+)",\s*\}/gu,
    ),
  ].map((entry) => ({ id: entry[1]!, label: entry[2]!, envVar: entry[3]! }));
}

function cliSharedCatalogProviders(): string[] {
  const table = /const SUPPORTED_SHARED_PROVIDERS: &\[&str\] = &\[([\s\S]*?)\];/u.exec(
    CLI_MODEL_CATALOG,
  );
  if (!table) throw new Error('SUPPORTED_SHARED_PROVIDERS not found in model_catalog.rs');
  return [...table[1]!.matchAll(/"([^"]+)"/gu)].map((entry) => entry[1]!);
}

function cliNameForCatalogProvider(catalogId: string): string {
  const mapping = /fn canonical_cli_provider\(provider: &str\) -> &str \{([\s\S]*?)\n\}/u.exec(
    CLI_MODEL_CATALOG,
  );
  if (!mapping) throw new Error('canonical_cli_provider not found in model_catalog.rs');
  for (const arm of mapping[1]!.matchAll(/((?:"[^"]+"\s*\|?\s*)+)=>\s*"([^"]+)"/gu)) {
    const aliases = [...arm[1]!.matchAll(/"([^"]+)"/gu)].map((alias) => alias[1]!);
    if (aliases.includes(catalogId)) return arm[2]!;
  }
  return catalogId;
}

function serverKeyVariables(): Map<string, string> {
  const config = /const SERVER_PROVIDER_CONFIG:[\s\S]*?= \{([\s\S]*?)\n\};/u.exec(SERVER_ADAPTERS);
  if (!config) throw new Error('SERVER_PROVIDER_CONFIG not found in provider-adapter-service.ts');
  const overrides = /const PROVIDER_API_KEY_ENV_KEYS:[\s\S]*?= \{([\s\S]*?)\n\};/u.exec(
    SERVER_ADAPTERS,
  );
  if (!overrides) {
    throw new Error('PROVIDER_API_KEY_ENV_KEYS not found in provider-adapter-service.ts');
  }
  const firstOverride = new Map(
    [...overrides[1]!.matchAll(/(\w+): \[\s*'([A-Z0-9_]+)'/gu)].map(
      (entry) => [entry[1]!, entry[2]!] as const,
    ),
  );
  return new Map(
    [...config[1]!.matchAll(/(\w+): \{ envPrefix: '([A-Z0-9_]+)'/gu)].map(
      (entry) => [entry[1]!, firstOverride.get(entry[1]!) ?? `${entry[2]!}_API_KEY`] as const,
    ),
  );
}

describe('the CLI key list is the list the CLI reads', () => {
  const cli = cliApiKeyProviders();
  const cliSearchKeys = cli.filter((entry) => entry.label.endsWith(SEARCH_KEY_SUFFIX));
  const cliModelProviders = cli.filter((entry) => !entry.label.endsWith(SEARCH_KEY_SUFFIX));

  it('reads a non-empty provider table out of the CLI source', () => {
    expect(cli.length).toBeGreaterThan(10);
    expect(cliSearchKeys.length).toBeGreaterThan(0);
    expect(cliModelProviders.length).toBeGreaterThan(cliSearchKeys.length);
  });

  it('lists every model provider the CLI takes a key for, with its name, label and variable', () => {
    expect(CLI_KEY_PROVIDERS.map(({ id, label, envVar }) => ({ id, label, envVar }))).toEqual(
      cliModelProviders,
    );
  });

  it('lists the web search keys the CLI takes apart from the model providers', () => {
    expect(
      CLI_SEARCH_KEYS.map(({ id, label, envVar }) => ({
        id,
        label: `${label}${SEARCH_KEY_SUFFIX}`,
        envVar,
      })),
    ).toEqual(cliSearchKeys);
  });

  it('joins a provider to the catalogue only where the CLI compiles that record in', () => {
    expect([...CLI_CATALOG_PROVIDER_IDS].sort()).toEqual([...cliSharedCatalogProviders()].sort());
    for (const provider of CLI_KEY_PROVIDERS) {
      if (provider.catalogId === null) continue;
      expect(cliNameForCatalogProvider(provider.catalogId), provider.id).toBe(provider.id);
    }
  });

  it('names the providers that have no catalogue record', () => {
    expect(CLI_KEY_PROVIDERS_OUTSIDE_CATALOG.map((provider) => provider.id)).toEqual(
      CLI_KEY_PROVIDERS.filter((provider) => provider.catalogId === null).map(
        (provider) => provider.id,
      ),
    );
    expect(CLI_KEY_PROVIDERS.length).toBe(
      CLI_CATALOG_PROVIDER_IDS.length + CLI_KEY_PROVIDERS_OUTSIDE_CATALOG.length,
    );
  });

  it('holds no provider the CLI has no key slot for', () => {
    const cliIds = cliModelProviders.map((entry) => entry.id);
    const cliVariables = cliModelProviders.map((entry) => entry.envVar);

    for (const absent of ['groq', 'workers_ai', 'vercel_gateway', 'mistral']) {
      expect(cliIds, `${absent} is not a CLI key provider`).not.toContain(absent);
      expect(CLI_KEY_PROVIDERS.map((provider) => provider.id)).not.toContain(absent);
    }
    expect(cliVariables).not.toContain('NVIDIA_NIM_API_KEY');
    expect(CLI_KEY_PROVIDERS.map((provider) => provider.envVar)).not.toContain(
      'NVIDIA_NIM_API_KEY',
    );
  });
});

describe('the self-hosted key table is the list the web server reads', () => {
  const server = serverKeyVariables();

  it('reads a non-empty provider registry out of the server source', () => {
    expect(server.size).toBeGreaterThan(10);
    expect(server.get('anthropic')).toBe('ANTHROPIC_API_KEY');
  });

  it('lists every provider the server has an adapter for, and no other', () => {
    expect(SELF_HOSTED_KEY_PROVIDERS.map((provider) => provider.id).sort()).toEqual(
      [...server.keys()].sort(),
    );
  });

  it('prints for each provider the variable the server tries first', () => {
    for (const provider of SELF_HOSTED_KEY_PROVIDERS) {
      expect(provider.envVar, provider.id).toBe(server.get(provider.id));
    }
  });

  it('prints no status beside a row, because the server registers an adapter for every one', () => {
    const page = readFileSync(join(WEB_ROOT, 'app/docs/byok-env/page.tsx'), 'utf8');

    expect(page).toContain('{SELF_HOSTED_KEY_PROVIDERS.map((provider) => (');
    expect(page).not.toMatch(/Active in v1|Planned adapter|pendingAdapter/u);
    expect(page.match(/<th scope="col">/gu)).toHaveLength(2);
  });
});

describe('/byok provider chips', () => {
  it('only advertises providers the canonical catalog still carries', () => {
    expect(BYOK_PROVIDER_IDS.length).toBeGreaterThan(0);
    for (const id of BYOK_PROVIDER_IDS) {
      expect(
        catalogProviderIds,
        `${id} is advertised on /byok but is not in models.json`,
      ).toContain(id);
    }
  });

  it('names every chip with the catalog label rather than a hand-typed string', () => {
    const labels = byokProviderLabels();

    expect(labels).toHaveLength(CLI_KEY_PROVIDERS.length);
    CLI_KEY_PROVIDERS.forEach((provider, index) => {
      if (provider.catalogId === null) return;
      expect(labels[index], provider.id).toBe(catalogProviders[provider.catalogId]?.label);
    });
  });

  it('names a provider the catalog has no record for with the label the CLI prints', () => {
    const cliLabels = cliApiKeyProviders().map((entry) => entry.label);
    const labels = byokProviderLabels();

    CLI_KEY_PROVIDERS.forEach((provider, index) => {
      if (provider.catalogId !== null) return;
      expect(labels[index], provider.id).toBe(provider.label);
      expect(cliLabels).toContain(provider.label);
    });
  });

  it('keeps retired providers out of the rendered page source', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

    expect(source, '/byok must not advertise the retired Mistral provider').not.toMatch(/Mistral/i);
    expect(source, '/byok must not advertise the retired Groq provider').not.toMatch(/Groq/i);
  });

  it('keeps the retired Mistral lane out of the shared provider-key lists', () => {
    const source = readFileSync(join(__dirname, '../../lib/byok-providers.ts'), 'utf8');

    expect(source).not.toMatch(/label: 'Mistral'/);
    expect(source).toMatch(/label: 'Perplexity'/);
  });
});
