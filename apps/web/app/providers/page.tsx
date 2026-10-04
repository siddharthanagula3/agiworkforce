import { buildMetadata } from '@/lib/seo/metadata';
import { modelsCatalog } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  CodeTabs,
  CtaPanel,
  Eyebrow,
  Ledger,
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
import { CATALOG_SCOPES, CATALOG_SCOPE_ORDER, GATEWAY_PROVIDER_IDS } from '@/lib/catalog-scopes';
import {
  CATALOG_AS_OF,
  CLI_AVAILABILITY_NOTE,
  CLI_LOCAL_RUNTIMES,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';

interface ProviderRow {
  id: string;
  label: string;
  defaultModel: string;
  modelCount: number;
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
    },
  ];
});

const LOCAL_RUNTIMES = CLI_LOCAL_RUNTIMES.names;

export const metadata = buildMetadata({
  title: 'Providers: the catalog AGI routes to',
  description: `Every cloud provider and local runtime available to the CLI, generated from the shared model catalog the CLI compiles into its binary. Desktop uses managed cloud and accepts no provider key or local-runtime URL. Catalog dated ${CATALOG_AS_OF}.`,
  path: '/providers',
});

const PROVIDER_TILES: ProviderTile[] = PROVIDER_ROWS.map((row) => ({
  id: row.id,
  label: row.label,
  defaultModel: row.defaultModel,
  modelCount: row.modelCount,
  billing: 'Billed by provider',
  kind: GATEWAY_PROVIDER_IDS.has(row.id) ? 'gateway' : 'cloud',
}));

const LOCAL_TILES: ProviderTile[] = LOCAL_RUNTIMES.map((name) => ({
  id: name.toLowerCase(),
  label: name,
  defaultModel: '',
  modelCount: 0,
  billing: 'No key, no meter',
  kind: 'local',
}));

const SOURCE_TABS = [
  {
    label: 'Rust',
    language: 'rust',
    code: 'const CATALOG: &str = include_str!("../../packages/contracts/types/src/models.json");\n\nlet catalog: ModelCatalog = serde_json::from_str(CATALOG)?;\nlet provider = catalog.providers.get(&args.provider)?;',
    note: 'The CLI embeds the file at compile time.',
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
          title="Explore providers and local runtimes."
          em="local runtimes."
          lede={`A BYOK provider needs a key you own; a local runtime needs a URL you already run. The CLI supports both. ${CLI_AVAILABILITY_NOTE} Every row reads its label and default model from the shared catalog.`}
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
              {
                value: `${CATALOG_SCOPES.byokProviders.value}`,
                label: 'providers that take your key',
              },
              {
                value: `${CATALOG_SCOPES.byokModelEntries.value}`,
                label: 'catalogue entries under those providers',
              },
              {
                value: `${CATALOG_SCOPES.localRuntimes.value}`,
                label: 'local runtimes in the CLI',
              },
              {
                value: '$0',
                label: 'markup on any of them',
                note: `Catalog dated ${CATALOG_AS_OF}`,
              },
            ]}
          />
        </Section>

        <Section id="definitions" labelledBy="agi-providers-definitions-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>How we count</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-providers-definitions-title">
                Each count answers a different question.
              </h2>
              <Prose>
                These counts come from one catalogue dated {CATALOG_SCOPES.asOf}. They differ
                because each one counts something different, and none of them is a promise about
                what a plan includes.
              </Prose>
            </div>
            <Ledger
              caption="Catalogue counts and what each one counts"
              rows={CATALOG_SCOPE_ORDER.map((id) => ({
                label: CATALOG_SCOPES[id].text,
                value: CATALOG_SCOPES[id].definition,
              }))}
            />
          </Stack>
        </Section>

        <Section id="roster" labelledBy="agi-providers-roster-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The roster</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-providers-roster-title">
                Each tile is a read from the shared model catalog.
              </h2>
              <Prose>
                These {CATALOG_SCOPES.byokProviders.value} providers accept a key you hold and bill
                you on your own account at their own rates. AGI adds no markup and shows no
                per-token price. Between them they carry {CATALOG_SCOPES.byokModelEntries.value}{' '}
                catalogue entries.
              </Prose>
            </div>
            <ProviderGrid tiles={PROVIDER_TILES} label="Cloud providers and gateways" />
            <div>
              <Eyebrow>Local runtimes</Eyebrow>
              <Prose>
                The CLI also talks to {CLI_LOCAL_RUNTIMES.label}. Neither carries catalogued models,
                because AGI asks the server you started what it is holding rather than assuming.
              </Prose>
            </div>
            <ProviderGrid tiles={LOCAL_TILES} label="Local runtimes" />
          </Stack>
        </Section>

        <Section id="source" labelledBy="agi-providers-source-title" rule ground="2">
          <SplitFeature
            id="agi-providers-source-title"
            eyebrow="The source file"
            title="The CLI compiles this catalog; the web app imports it."
            body={
              <p>
                <code>packages/contracts/types/src/models.json</code> is embedded in the CLI, and
                the web app imports the same module. Adding a provider moves both and this page at
                once. The CLI surface itself is {SURFACE_STATUS.cli.toLowerCase()}.
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
                  body: 'The CLI keeps one keyring entry per provider and calls that provider directly.',
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
