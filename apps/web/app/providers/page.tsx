import { buildMetadata } from '@/lib/seo/metadata';
import { modelsCatalog } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
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

function providerRowValue(row: ProviderRow): string {
  const model = row.defaultModel ? `Default: ${row.defaultModel}.` : 'Lists its own models.';
  const count = row.modelCount > 0 ? `${row.modelCount} catalog models.` : 'No catalog models.';
  const price =
    row.inputPerMillion > 0 || row.outputPerMillion > 0
      ? `Base ${formatPrice(row.inputPerMillion)}/MTok in, ${formatPrice(row.outputPerMillion)}/MTok out.`
      : '';
  return [model, count, price].filter(Boolean).join(' ');
}

export const metadata = buildMetadata({
  title: 'Providers: the catalog AGI routes to',
  description: `Every cloud provider AGI takes a key for and every local runtime it takes a URL for, generated from the shared model catalog that the CLI and Desktop compile into their binaries. Catalog dated ${CATALOG_AS_OF}.`,
  path: '/providers',
});

export default function ProvidersPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-providers-title"
          eyebrow="Provider catalog"
          title="Every provider here comes out of the catalog the apps compile in."
          lede={`A cloud provider needs a key you own; a local runtime needs a URL for a server you already run. The label, the default model, the model count, and the list price on every row are read from the shared model catalog and the key list the apps ship with, so this page cannot name a provider they do not. ${PROVIDER_ROWS.length} providers take a key, ${LOCAL_RUNTIMES.length} runtimes take a URL, and the catalog is dated ${CATALOG_AS_OF}.`}
          ctas={[
            { href: '/byok', label: 'Add a provider key' },
            { href: '/local', label: 'Point at a local runtime', variant: 'secondary' },
          ]}
        />

        <Section id="roster" labelledBy="agi-providers-roster-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The roster</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-providers-roster-title">
                Each row is a read from the shared model catalog.
              </h2>
              <Prose>
                These {PROVIDER_ROWS.length} providers accept a key you hold, bill you on your own
                account, and between them carry {CATALOGUED_MODEL_COUNT} catalogued models. The
                price is the provider&rsquo;s base list rate per million tokens as the catalog
                records it; individual models and long-input bands can sit above or below it.
              </Prose>
            </div>
            <Ledger
              caption="Cloud providers"
              rows={PROVIDER_ROWS.map((row) => ({
                label: row.label,
                value: providerRowValue(row),
              }))}
            />
            <Prose>
              Desktop also talks to {DESKTOP_LOCAL_RUNTIMES.label}. None of them carry catalogued
              models, because AGI asks the server you started what it is holding rather than
              assuming.
            </Prose>
            <Ledger
              caption="Local runtimes"
              rows={LOCAL_RUNTIMES.map((runtime) => ({
                label: runtime,
                value:
                  'You give it a server URL; it reports the models it has loaded. No key, no meter.',
              }))}
            />
          </Stack>
        </Section>

        <Section id="source-file" labelledBy="agi-providers-source-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>The source file</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-providers-source-title">
                The CLI and Desktop compile this catalog into their binaries.
              </h2>
            </div>
            <Prose>
              <code>packages/contracts/types/src/models.json</code> is embedded in the CLI and in
              the Desktop Rust runtime with <code>include_str!</code>, and the web app imports the
              same module. Adding a provider or moving a price moves every surface and this page at
              once. The CLI surface itself is {SURFACE_STATUS.cli.toLowerCase()}.
            </Prose>
          </Stack>
        </Section>

        <Section id="session-boundary" labelledBy="agi-providers-session-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside one session</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-providers-session-title">
                Swapping a model is not the same as moving a session.
              </h2>
              <Prose>
                <code>/model</code> resolves the provider from the catalog, then compares the route
                that model needs against the privacy authority already written beside the
                transcript. Anthropic to Google is a swap, and the thread carries on. Anything that
                would change the authority, such as pointing a Local session at a BYOK model, is
                refused by name; the reviewed fork that would do it properly is described on the
                Local page.
              </Prose>
            </div>
            <ButtonRow>
              <Button href="/local" variant="secondary">
                How a Local session moves
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <Section id="providers-close" labelledBy="agi-providers-close-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-providers-close-title">
              Bring the key and the catalog is already there.
            </h2>
            <Prose>
              Desktop holds the encrypted key store and every local runtime URL (
              {SURFACE_STATUS.desktop}). The CLI compiles the same catalog and is{' '}
              {SURFACE_STATUS.cli.toLowerCase()}.
            </Prose>
            <ButtonRow>
              <Button href="/docs/byok-env">Read the provider-key guide</Button>
              <Button href="/download" variant="secondary">
                Check surface availability
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
