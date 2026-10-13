import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'node:child_process';
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

function cliNameForCatalogProvider(catalogId: string, source = CLI_MODEL_CATALOG): string {
  let cursor = 0;
  const nextToken = (): { kind: 'word' | 'string' | 'symbol'; value: string } | null => {
    while (cursor < source.length) {
      const character = source[cursor]!;
      if (/\s/u.test(character)) {
        cursor += 1;
      } else if (source.startsWith('//', cursor)) {
        const newline = source.indexOf('\n', cursor + 2);
        cursor = newline === -1 ? source.length : newline + 1;
      } else if (source.startsWith('/*', cursor)) {
        cursor += 2;
        let depth = 1;
        while (cursor < source.length && depth > 0) {
          if (source.startsWith('/*', cursor)) {
            depth += 1;
            cursor += 2;
          } else if (source.startsWith('*/', cursor)) {
            depth -= 1;
            cursor += 2;
          } else cursor += 1;
        }
        if (depth) throw new Error('Unterminated Rust block comment');
      } else if (character === '"') {
        const start = cursor++;
        while (cursor < source.length) {
          const next = source[cursor++];
          if (next === '\\') cursor += 1;
          else if (next === '"') {
            return { kind: 'string', value: JSON.parse(source.slice(start, cursor)) as string };
          }
        }
        throw new Error('Unterminated Rust string literal');
      } else if (/[A-Za-z_]/u.test(character)) {
        const start = cursor++;
        while (cursor < source.length && /[A-Za-z0-9_]/u.test(source[cursor]!)) cursor += 1;
        return { kind: 'word', value: source.slice(start, cursor) };
      } else if (source.startsWith('=>', cursor)) {
        cursor += 2;
        return { kind: 'symbol', value: '=>' };
      } else {
        cursor += 1;
        return { kind: 'symbol', value: character };
      }
    }
    return null;
  };

  let afterFn = false;
  let token;
  while ((token = nextToken())) {
    if (afterFn && token.kind === 'word' && token.value === 'canonical_cli_provider') break;
    afterFn = token.kind === 'word' && token.value === 'fn';
  }
  if (!token) throw new Error('canonical_cli_provider not found in model_catalog.rs');
  do {
    token = nextToken();
  } while (token && (token.kind !== 'symbol' || token.value !== '{'));
  if (!token) throw new Error('canonical_cli_provider has no body');

  let depth = 1;
  let state: 'alias' | 'separator' | 'target' = 'alias';
  let matched = false;
  while ((token = nextToken())) {
    if (token.kind === 'string') {
      if (state === 'target') {
        if (matched) return token.value;
        matched = false;
        state = 'alias';
      } else {
        matched = (state === 'alias' && matched) || token.value === catalogId;
        state = 'separator';
      }
    } else if (token.value === '|' && state === 'separator') {
      state = 'alias';
    } else if (token.value === '=>' && state === 'separator') {
      state = 'target';
    } else {
      matched = false;
      state = 'alias';
      if (token.value === '{') depth += 1;
      else if (token.value === '}' && --depth === 0) return catalogId;
    }
  }
  throw new Error('Unterminated canonical_cli_provider body');
}

describe('the CLI provider mapping parser', () => {
  const marker = 'fn canonical_cli_provider(provider: &str) -> &str {';
  const parseInChild = (source: string, provider: string) =>
    spawnSync(
      process.execPath,
      [
        '--eval',
        `const parse = ${cliNameForCatalogProvider.toString()}; process.stdout.write(JSON.stringify(parse(process.argv[1], require('node:fs').readFileSync(0, 'utf8'))));`,
        provider,
      ],
      { input: source, encoding: 'utf8', timeout: 3_000, killSignal: 'SIGKILL' },
    );

  it.each([
    ['quoted sequences', '"a" '.repeat(64)],
    ['long whitespace', `"a"${' '.repeat(100_000)}`],
    ['unterminated pipe chain', '"a" | '.repeat(100_000)],
  ])('stays bounded when a Rust comment contains %s', (_, comment) => {
    const source = CLI_MODEL_CATALOG.replace(marker, `${marker}\n    // ${comment}`);
    expect(source).not.toBe(CLI_MODEL_CATALOG);
    const result = parseInChild(source, 'unmapped');
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toBe('unmapped');
  });

  it('keeps pipe-separated aliases, multiline whitespace and identity fallback', () => {
    const source = `${marker}
    match provider {
        "first" |\n        "second" | "third" => "canonical",
        other => other,
    }
}`;
    for (const provider of ['first', 'second', 'third', 'unmapped']) {
      const result = parseInChild(source, provider);
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toBe(provider === 'unmapped' ? provider : 'canonical');
    }
  });

  it('ignores line and nested block comments while keeping quoted comment markers and escapes', () => {
    const source = String.raw`
// ${marker} "first" => "wrong" }
/* ${marker}
   /* "second" => "wrong" } */
*/
${marker}
    match provider {
        // "commented" => "wrong",
        "first" /* outer "commented" => "wrong" /* nested } */ */ |
        "second" | // "commented" => "wrong",
        "third" => /* target */ "canonical",
        "slash//marker" | "block/*marker*/" => "markers",
        "quote\"alias" | "backslash\\alias" => "escaped",
        other => other,
    }
}`;
    for (const [provider, expected] of [
      ['first', 'canonical'],
      ['second', 'canonical'],
      ['third', 'canonical'],
      ['commented', 'commented'],
      ['slash//marker', 'markers'],
      ['block/*marker*/', 'markers'],
      ['quote"alias', 'escaped'],
      ['backslash\\alias', 'escaped'],
      ['unmapped', 'unmapped'],
    ]) {
      const result = parseInChild(source, provider!);
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toBe(expected);
    }
  });

  it('stays bounded across deeply nested Rust block comments', () => {
    const comment = `${'/*'.repeat(20_000)}${'"a" | '.repeat(100_000)}${'*/'.repeat(20_000)}`;
    const source = CLI_MODEL_CATALOG.replace(marker, `${marker}\n    ${comment}`);
    const result = parseInChild(source, 'unmapped');
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toBe('unmapped');
  });

  it.each(['/* unfinished', '"unfinished\\'])(
    'rejects unterminated quoted or comment input: %s',
    (tail) => {
      const result = parseInChild(`${marker}\n${tail}`, 'unmapped');
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unterminated Rust');
    },
  );
});

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
