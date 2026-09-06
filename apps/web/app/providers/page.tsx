import { buildMetadata } from '@/lib/seo/metadata';
import { modelsCatalog } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  CodeTabs,
  CtaPanel,
  Eyebrow,
  MarketingFooter,
  ProviderGrid,
  Prose,
  Section,
  SplitFeature,
  Stack,
  StatBand,
  type ProviderTile,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { BYOK_PROVIDER_IDS } from '@/app/byok/byok-providers';
import { CATALOG_AS_OF, DESKTOP_LOCAL_RUNTIMES, SURFACE_STATUS } from '@/lib/marketing-constants';

interface ProviderRow {
  id: string;
  label: string;
  defaultModel: string;
  modelCount: number;
  inputPerMillion: number;
  outputPerMillion: number;
}

const CATALOG_MODELS = Object.values(modelsCatalog.models);

const PROVIDER_ROWS: ProviderRow[] = BYOK_PROVIDER_IDS.flatMap((id) => {
  const entry = modelsCatalog.providers[id];
  if (!entry) return [];
  return [
    {
      id,
      label: entry.label,
      defaultModel: entry.defaultModel ?? '',
      modelCount: CATALOG_MODELS.filter((model) => model.provider === id).length,
      inputPerMillion: entry.defaultPricing?.inputPerMillion ?? 0,
      outputPerMillion: entry.defaultPricing?.outputPerMillion ?? 0,
    },
  ];
});

const LOCAL_RUNTIMES = DESKTOP_LOCAL_RUNTIMES.names;

const CATALOGUED_MODEL_COUNT = PROVIDER_ROWS.reduce((total, row) => total + row.modelCount, 0);

function formatPrice(usd: number): string {
  return Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`;
}

export const metadata = buildMetadata({
  title: 'Providers: the catalog AGI routes to',
  description: `Every cloud provider AGI takes a key for and every local runtime it takes a URL for, generated from the shared model catalog that the CLI and Desktop compile into their binaries. Catalog dated ${CATALOG_AS_OF}.`,
  path: '/providers',
});

const GATEWAY_IDS = new Set(['open_router', 'vercel_gateway', 'workers_ai', 'nvidia_nim']);

function providerPrice(row: ProviderRow): string {
  const hasPrice = row.inputPerMillion > 0 || row.outputPerMillion > 0;
  return hasPrice
    ? `${formatPrice(row.inputPerMillion)} in · ${formatPrice(row.outputPerMillion)} out /MTok`
    : 'Provider list price';
}

const PROVIDER_TILES: ProviderTile[] = PROVIDER_ROWS.map((row) => ({
  id: row.id,
  label: row.label,
  defaultModel: row.defaultModel,
  modelCount: row.modelCount,
  price: providerPrice(row),
  kind: GATEWAY_IDS.has(row.id) ? 'gateway' : 'cloud',
}));

const LOCAL_TILES: ProviderTile[] = LOCAL_RUNTIMES.map((name) => ({
  id: name.toLowerCase(),
  label: name,
  defaultModel: '',
  modelCount: 0,
  price: 'No key, no meter',
  kind: 'local',
}));

const SOURCE_TABS = [
  {
    label: 'Rust',
    language: 'rust',
    code: 'const CATALOG: &str = include_str!("../../packages/contracts/types/src/models.json");\n\nlet catalog: ModelCatalog = serde_json::from_str(CATALOG)?;\nlet provider = catalog.providers.get(&args.provider)?;',
    note: 'The CLI and the Desktop Rust runtime embed the file at compile time.',
  },
  {
    label: 'TypeScript',
    language: 'typescript',
    code: "import { modelsCatalog } from '@agiworkforce/types';\n\nconst provider = modelsCatalog.providers[id];\nconst models = Object.values(modelsCatalog.models).filter((m) => m.provider === id);",
    note: 'The web app and this page import the same module.',
  },
  {
    label: 'CLI',
    language: 'shell',
    code: '$ agi models scan\nollama · http://localhost:11434 · 1 model\n\n$ agi --provider ollama --model <model>',
    note: 'Local runtimes are discovered on loopback, never assumed.',
  },
] as const;

const SESSION_TABS = [
  {
    label: 'Swap',
    language: 'text',
    code: '› /model <another cloud model>\n✓ Switched. Same thread, same authority: byok.',
  },
  {
    label: 'Refused',
    language: 'text',
    code: "› /model <a byok model>\n✗ Refused: this session's authority is local.\n  A fork that moves it is /continue-with-byok, and it shows the payload first.",
  },
] as const;

export default function ProvidersPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-providers-title"
          eyebrow="Provider catalog"
          title="Every provider, from the one catalogue the apps compile in."
          lede="A cloud provider needs a key you own; a local runtime needs a URL for a server you already run. The label, the default model, and the list price on every row are read from the shared model catalog, so this page cannot name a provider the apps do not."
          ctas={[
            { href: '/byok', label: 'Add a provider key' },
            { href: '/local', label: 'Point at a local runtime', variant: 'secondary' },
          ]}
        />

        <Section id="numbers" labelledBy="agi-providers-numbers-title" size="sm" rule>
          <h2 className="sr-only" id="agi-providers-numbers-title">
            The catalogue in numbers
          </h2>
          <StatBand
            label="The catalogue in numbers"
            stats={[
              { value: `${PROVIDER_ROWS.length}`, label: 'providers that take your key' },
              { value: `${CATALOGUED_MODEL_COUNT}`, label: 'catalogued models' },
              { value: `${LOCAL_RUNTIMES.length}`, label: 'local runtimes on Desktop' },
              {
                value: '$0',
                label: 'markup on any of them',
                note: `Catalog dated ${CATALOG_AS_OF}`,
              },
            ]}
          />
        </Section>

        <Section id="roster" labelledBy="agi-providers-roster-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The roster</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-providers-roster-title">
                Each tile is a read from the shared model catalog.
              </h2>
              <Prose>
                These {PROVIDER_ROWS.length} providers accept a key you hold, bill you on your own
                account, and between them carry {CATALOGUED_MODEL_COUNT} catalogued models. The
                price is the provider&rsquo;s base list rate per million tokens as the catalog
                records it; individual models and long-input bands can sit above or below it.
              </Prose>
            </div>
            <ProviderGrid tiles={PROVIDER_TILES} label="Cloud providers and gateways" />
            <div>
              <Eyebrow>Local runtimes</Eyebrow>
              <Prose>
                Desktop also talks to {DESKTOP_LOCAL_RUNTIMES.label}. None of them carry catalogued
                models, because AGI asks the server you started what it is holding rather than
                assuming.
              </Prose>
            </div>
            <ProviderGrid tiles={LOCAL_TILES} label="Local runtimes" />
          </Stack>
        </Section>

        <Section id="source" labelledBy="agi-providers-source-title" rule ground="2">
          <SplitFeature
            id="agi-providers-source-title"
            eyebrow="The source file"
            title="The CLI and Desktop compile this catalog into their binaries."
            body={
              <p>
                <code>packages/contracts/types/src/models.json</code> is embedded in the CLI and in
                the Desktop Rust runtime, and the web app imports the same module. Adding a provider
                or moving a price moves every surface and this page at once. The CLI surface itself
                is {SURFACE_STATUS.cli.toLowerCase()}.
              </p>
            }
            visual={<CodeTabs tabs={SOURCE_TABS} title="How each surface reads the catalog" />}
          />
        </Section>

        <Section id="session" labelledBy="agi-providers-session-title" rule>
          <SplitFeature
            id="agi-providers-session-title"
            eyebrow="Inside one session"
            title="Swapping a model is not the same as moving a session."
            flip
            body={
              <p>
                <code>/model</code> resolves the provider from the catalog, then compares the route
                that model needs against the privacy authority already written beside the
                transcript. One cloud provider to another is a swap, and the thread carries on.
                Anything that would change the authority, such as pointing a Local session at a BYOK
                model, is refused by name; the reviewed fork that would do it properly is described
                on the Local page.
              </p>
            }
            cta={
              <ButtonRow>
                <Button href="/local" variant="secondary">
                  How a Local session moves
                </Button>
              </ButtonRow>
            }
            visual={<CodeTabs tabs={SESSION_TABS} title="A model swap and a refused move" />}
          />
        </Section>

        <Section id="close" labelledBy="agi-providers-close-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Bring the key</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-providers-close-title">
                The catalog is already there.
              </h2>
            </div>
            <CtaPanel
              label="Ways to start"
              cards={[
                {
                  title: 'Your key, your provider',
                  body: `Desktop holds the encrypted key store and every local runtime URL (${SURFACE_STATUS.desktop}).`,
                  points: [
                    'Keys encrypted at rest on your machine',
                    'Traffic goes straight to the provider',
                    'The route is named on every reply',
                  ],
                  cta: { href: '/docs/byok-env', label: 'Read the provider-key guide' },
                },
                {
                  title: 'The same catalog in the terminal',
                  body: `The CLI compiles the same catalog and is ${SURFACE_STATUS.cli.toLowerCase()}.`,
                  points: [
                    'agi models scan finds local servers',
                    'Every run prints its provider and cost',
                    'Works offline with a local model',
                  ],
                  cta: { href: '/download', label: 'Check surface availability' },
                },
              ]}
            />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
