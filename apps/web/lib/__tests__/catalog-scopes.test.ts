import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAllowedModelsForTier } from '@agiworkforce/types';
import { BYOK_PROVIDER_IDS } from '@/app/byok/byok-providers';
import { MODELS_SECTION } from '@/features/marketing/components/landing/landing-content';
import { interpolateFacts } from '@/lib/support/agent/corpus';
import {
  CATALOG_SCOPES,
  CATALOG_SCOPE_ORDER,
  GATEWAY_PROVIDER_IDS,
  PROVIDER_RECORD_SPLIT,
  type CatalogScopeId,
} from '../catalog-scopes';
import { CATALOG_AS_OF, CLI_LOCAL_RUNTIME_IDS, MARKETING } from '../marketing-constants';

const WEB_ROOT = resolve(import.meta.dirname, '../..');
const REPO_ROOT = resolve(WEB_ROOT, '../..');
const MODELS_JSON = resolve(REPO_ROOT, 'packages/contracts/types/src/models.json');
const MODELS_CURATION_JSON = resolve(
  REPO_ROOT,
  'packages/ai/model-registry/catalog/models.curation.json',
);

interface RawCatalog {
  lastUpdated: string;
  models: Record<string, { provider: string }>;
  providers: Record<string, { label: string }>;
  tierAllowedModels: Record<string, string[]>;
}

interface RawCuration {
  tierAllowedModels: Record<string, string[]>;
}

const raw = JSON.parse(readFileSync(MODELS_JSON, 'utf8')) as RawCatalog;
const curation = JSON.parse(readFileSync(MODELS_CURATION_JSON, 'utf8')) as RawCuration;
const pageSource = (relativePath: string) =>
  readFileSync(join(WEB_ROOT, relativePath), 'utf8').replace(/\s+/g, ' ');
const rawEntries = Object.values(raw.models);
const byokIds: readonly string[] = BYOK_PROVIDER_IDS;
const entriesOf = (ids: ReadonlySet<string>) =>
  rawEntries.filter((entry) => ids.has(entry.provider)).length;

describe('catalogue count scopes', () => {
  it('counts every catalogue entry', () => {
    expect(CATALOG_SCOPES.catalogueEntries.value).toBe(Object.keys(raw.models).length);
  });

  it('counts the entries listed under providers that take a key', () => {
    expect(CATALOG_SCOPES.byokModelEntries.value).toBe(entriesOf(new Set(byokIds)));
  });

  it('splits the key-provider entries into gateway and direct entries without losing any', () => {
    const gateways = new Set(byokIds.filter((id) => GATEWAY_PROVIDER_IDS.has(id)));
    const direct = new Set(byokIds.filter((id) => !GATEWAY_PROVIDER_IDS.has(id)));

    expect(CATALOG_SCOPES.gatewayEntries.value).toBe(entriesOf(gateways));
    expect(CATALOG_SCOPES.directModelEntries.value).toBe(entriesOf(direct));
    expect(CATALOG_SCOPES.byokModelEntries.value).toBe(
      CATALOG_SCOPES.directModelEntries.value + CATALOG_SCOPES.gatewayEntries.value,
    );
  });

  it('only names gateways that are providers in the catalogue', () => {
    for (const id of GATEWAY_PROVIDER_IDS) {
      expect(Object.keys(raw.providers)).toContain(id);
    }
  });

  it('counts the providers that take a key and the ones with no listed models', () => {
    const withoutModels = byokIds.filter((id) => entriesOf(new Set([id])) === 0);

    expect(CATALOG_SCOPES.byokProviders.value).toBe(byokIds.length);
    expect(CATALOG_SCOPES.byokProvidersWithoutModels.value).toBe(withoutModels.length);
    expect(CATALOG_SCOPES.byokProviders.definition).toContain(
      `${withoutModels.length} of them list no models`,
    );
  });

  it('defines the key providers by their list, not by what one surface can call', () => {
    expect(CATALOG_SCOPES.byokProviders.definition).toMatch(
      /^Providers on the bring-your-own-key list\./,
    );
    expect(CATALOG_SCOPES.byokProviders.definition).not.toMatch(/\bCLI\b/);
  });

  it('counts the CLI local runtimes, which carry no catalogued models', () => {
    expect(CATALOG_SCOPES.localRuntimes.value).toBe(CLI_LOCAL_RUNTIME_IDS.length);
    for (const id of CLI_LOCAL_RUNTIME_IDS) {
      expect(Object.keys(raw.providers)).toContain(id);
      expect(entriesOf(new Set([id]))).toBe(0);
    }
  });

  it('counts every provider record', () => {
    expect(CATALOG_SCOPES.providerRecords.value).toBe(Object.keys(raw.providers).length);
  });

  it('splits the provider records into parts that add up to the total', () => {
    const recordIds = Object.keys(raw.providers);
    const localIds = recordIds.filter((id) => / \(Local\)$/.test(raw.providers[id]?.label ?? ''));
    const cliRuntimeIds: readonly string[] = CLI_LOCAL_RUNTIME_IDS;

    expect(PROVIDER_RECORD_SPLIT.onByokList).toBe(
      recordIds.filter((id) => byokIds.includes(id)).length,
    );
    expect(PROVIDER_RECORD_SPLIT.onByokList).toBe(CATALOG_SCOPES.byokProviders.value);
    expect(PROVIDER_RECORD_SPLIT.localRuntime).toBe(localIds.length);
    expect(PROVIDER_RECORD_SPLIT.localRuntimeUsedByCli).toBe(
      localIds.filter((id) => cliRuntimeIds.includes(id)).length,
    );
    expect(PROVIDER_RECORD_SPLIT.localRuntimeUsedByCli).toBe(CATALOG_SCOPES.localRuntimes.value);
    expect(PROVIDER_RECORD_SPLIT.other).toBeGreaterThan(0);
    expect(
      PROVIDER_RECORD_SPLIT.onByokList +
        PROVIDER_RECORD_SPLIT.localRuntime +
        PROVIDER_RECORD_SPLIT.other,
    ).toBe(CATALOG_SCOPES.providerRecords.value);
  });

  it('states each part of the provider record split in the definition a reader sees', () => {
    const definition = CATALOG_SCOPES.providerRecords.definition;

    expect(definition).toContain(
      `${PROVIDER_RECORD_SPLIT.onByokList} are on the bring-your-own-key list`,
    );
    expect(definition).toContain(
      `${PROVIDER_RECORD_SPLIT.localRuntime} are local runtime records, of which the CLI uses ${PROVIDER_RECORD_SPLIT.localRuntimeUsedByCli}`,
    );
    expect(definition).toContain(`and ${PROVIDER_RECORD_SPLIT.other} are records for`);
  });

  it('counts the managed roster as the union of every plan allow list', () => {
    const roster = new Set<string>();
    for (const tier of Object.keys(raw.tierAllowedModels)) {
      for (const id of getAllowedModelsForTier(
        tier as Parameters<typeof getAllowedModelsForTier>[0],
      )) {
        roster.add(id);
      }
    }

    expect(roster.size).toBeGreaterThan(0);
    expect(CATALOG_SCOPES.managedRosterModels.value).toBe(roster.size);
  });

  it('matches the managed roster to the plan allow lists as their owner curates them', () => {
    const curated = new Set(Object.values(curation.tierAllowedModels).flat());

    expect(Object.keys(curation.tierAllowedModels).length).toBeGreaterThan(0);
    expect(curated.size).toBeGreaterThan(0);
    expect(CATALOG_SCOPES.managedRosterModels.value).toBe(curated.size);
  });

  it('dates every scope with the catalogue date', () => {
    expect(CATALOG_SCOPES.asOf).toBe(raw.lastUpdated);
    expect(CATALOG_SCOPES.asOf).toBe(CATALOG_AS_OF);
  });

  it('keeps the widest scope no smaller than any scope it contains', () => {
    expect(CATALOG_SCOPES.catalogueEntries.value).toBeGreaterThanOrEqual(
      CATALOG_SCOPES.byokModelEntries.value,
    );
    expect(CATALOG_SCOPES.providerRecords.value).toBeGreaterThanOrEqual(
      CATALOG_SCOPES.byokProviders.value + CATALOG_SCOPES.localRuntimes.value,
    );
  });

  it('lists every scope once for the definitions block, each with a definition and no em dash', () => {
    const ids = Object.keys(CATALOG_SCOPES).filter((id) => id !== 'asOf') as CatalogScopeId[];

    expect([...CATALOG_SCOPE_ORDER].sort()).toEqual([...ids].sort());
    for (const id of CATALOG_SCOPE_ORDER) {
      const scope = CATALOG_SCOPES[id];
      expect(scope.text).toBe(`${scope.value} ${scope.label}`);
      expect(scope.definition.length).toBeGreaterThan(40);
      expect(`${scope.label}${scope.definition}`).not.toMatch(/[^\P{Pd}-]/u);
    }
  });
});

describe('the marketing constants and the support agent read the same scopes', () => {
  it('prints the model and provider record counts exactly', () => {
    expect(MARKETING.models.count).toBe(CATALOG_SCOPES.catalogueEntries.value);
    expect(MARKETING.providers.count).toBe(CATALOG_SCOPES.providerRecords.value);
    expect(MARKETING.models.display).toBe(String(CATALOG_SCOPES.catalogueEntries.value));
    expect(MARKETING.providers.display).toBe(String(CATALOG_SCOPES.providerRecords.value));
  });

  it('renders numbers for the support fact tokens, never a raw token or a floor', () => {
    const rendered = interpolateFacts(
      '{{MARKETING.providers.display}}|{{MARKETING.providers.count}}|{{MARKETING.models.display}}|{{MARKETING.models.count}}',
      'catalog-scopes.test',
    ).split('|');

    expect(rendered).toEqual([
      String(CATALOG_SCOPES.byokProviders.value),
      String(CATALOG_SCOPES.byokProviders.value),
      String(CATALOG_SCOPES.byokModelEntries.value),
      String(CATALOG_SCOPES.byokModelEntries.value),
    ]);
    for (const value of rendered) expect(value).toMatch(/^\d+$/);
  });
});

describe('the pages that print a scope keep the scope and its definition reachable', () => {
  it('renders the definitions block on /providers from the scope order', () => {
    const page = pageSource('app/providers/page.tsx');

    expect(page).toMatch(/<Section id="definitions"/);
    expect(page).toMatch(/rows=\{CATALOG_SCOPE_ORDER\.map\(/);
    expect(page).toMatch(/label: CATALOG_SCOPES\[id\]\.text/);
    expect(page).toMatch(/value: CATALOG_SCOPES\[id\]\.definition/);
  });

  it('links the /web roster figure to the plans and to the definitions', () => {
    const page = pageSource('app/web/page.tsx');

    expect(page).toMatch(/value: String\(CATALOG_SCOPES\.managedRosterModels\.value\)/);
    expect(page).toMatch(/<Link href="\/pricing"/);
    expect(page).toMatch(/<Link href="\/providers#definitions"/);
    expect(page).toMatch(/Which of the \{CATALOG_SCOPES\.managedRosterModels\.value\} each plan/);
  });

  it('says on /web where Local and BYOK run, with the CLI availability note', () => {
    const page = pageSource('app/web/page.tsx');

    expect(page).toMatch(
      /const FINAL_CTA_BODY = \[[^\]]*Local and BYOK run in the CLI\.',? CLI_AVAILABILITY_NOTE,? ?\]/,
    );
    expect(page).toMatch(/body=\{FINAL_CTA_BODY\}/);
    expect(page).not.toMatch(/available from the CLI/);
  });

  it('prints no provider count on the /cli BYOK card', () => {
    const page = pageSource('app/cli/page.tsx');

    expect(page).toContain(
      "'Provider keys for the built-in providers, plus custom OpenAI-compatible endpoints'",
    );
    expect(page).not.toMatch(/CATALOG_SCOPES|BYOK_PROVIDER_IDS/);
  });

  it('names the scope of the catalogue figure in the landing models lede', () => {
    expect(MODELS_SECTION.lede).toContain(`Pick any of ${CATALOG_SCOPES.catalogueEntries.text} by`);
    expect(MODELS_SECTION.lede).not.toMatch(/\d+ models\b/);
  });
});

const BARE_COUNT_READ =
  /MARKETING\.(?:models|providers)\b|\bapproximateCount\b|BYOK_PROVIDER_IDS\.length/;

const PENDING_BARE_COUNT_SITES: Record<string, readonly string[]> = {
  'L03-WP3': [
    'app/about/page.tsx',
    'app/business/page.tsx',
    'app/help/page.tsx',
    'app/press/page.tsx',
  ],
  'L03-WP4': [
    'app/faq/page.tsx',
    'app/features/ai-chat/page.tsx',
    'app/integrations/page.tsx',
    'features/marketing/components/pages/business/use-cases-content.ts',
  ],
  'L03-WP5': ['features/marketing/components/MarketingLanding.tsx'],
};

function sourcesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === 'e2e') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourcesUnder(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const SCANNED = [
  ...sourcesUnder(join(WEB_ROOT, 'app')),
  ...sourcesUnder(join(WEB_ROOT, 'features', 'marketing')),
].map((file) => ({
  rel: relative(WEB_ROOT, file).split('\\').join('/'),
  reads: BARE_COUNT_READ.test(readFileSync(file, 'utf8')),
}));

const PENDING_FILES = Object.values(PENDING_BARE_COUNT_SITES).flat();

describe('a public page states a count through its scope, never a bare or floored figure', () => {
  it('scans the marketing sources, so a clean result is not an empty one', () => {
    expect(SCANNED.length).toBeGreaterThan(100);
    expect(SCANNED.some((source) => source.rel === 'app/providers/page.tsx')).toBe(true);
    expect(SCANNED.some((source) => source.rel === 'app/web/page.tsx')).toBe(true);
  });

  it('recognises each bare reader', () => {
    expect(BARE_COUNT_READ.test('`${MARKETING.models.display} models`')).toBe(true);
    expect(BARE_COUNT_READ.test('MARKETING.providers.count')).toBe(true);
    expect(BARE_COUNT_READ.test('approximateCount(total)')).toBe(true);
    expect(BARE_COUNT_READ.test('BYOK_PROVIDER_IDS.length')).toBe(true);
    expect(BARE_COUNT_READ.test('CATALOG_SCOPES.byokProviders.text')).toBe(false);
    expect(BARE_COUNT_READ.test('MARKETING.surfaces.count')).toBe(false);
  });

  it('has no reader outside the pending list', () => {
    const unlisted = SCANNED.filter(
      (source) => source.reads && !PENDING_FILES.includes(source.rel),
    ).map((source) => source.rel);

    expect(
      unlisted,
      `${unlisted.join('\n')}\nRead CATALOG_SCOPES from lib/catalog-scopes.ts and name the scope in the label.`,
    ).toEqual([]);
  });

  it('drops a pending site as soon as it is fixed', () => {
    const stale = PENDING_FILES.filter(
      (rel) => !SCANNED.some((source) => source.rel === rel && source.reads),
    );

    expect(stale, `${stale.join('\n')}\nDelete the entry from PENDING_BARE_COUNT_SITES.`).toEqual(
      [],
    );
  });
});
