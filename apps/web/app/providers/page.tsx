import { buildMetadata } from '@/lib/seo/metadata';
import { modelsCatalog } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  MarketingFooter,
  Prose,
} from '@/features/marketing/components/system';
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
  const hasPrice = row.inputPerMillion > 0 || row.outputPerMillion > 0;
  const priceText = `${formatPrice(row.inputPerMillion)}/MTok in, ${formatPrice(row.outputPerMillion)}/MTok out.`;
  const count =
    row.modelCount > 0
      ? `${row.modelCount} catalog models.`
      : hasPrice
        ? `No catalog models yet; provider lists ${priceText}`
        : 'No catalog models.';
  const price = row.modelCount > 0 && hasPrice ? `Base ${priceText}` : '';
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
        <section className="agi-lp-hero" aria-labelledby="agi-providers-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>Provider catalog</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-providers-title">
                Every provider, from the one catalogue the apps compile in.
              </h1>
              <Prose size="lg">
                A cloud provider needs a key you own; a local runtime needs a URL for a server you
                already run. The label, the default model, and the list price on every row are read
                from the shared model catalog, so this page cannot name a provider the apps do not.
              </Prose>
              <ButtonRow>
                <Button href="/byok">Add a provider key</Button>
                <Button href="/local" variant="secondary">
                  Point at a local runtime
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <div className="agi-lp-console" aria-label="Provider catalog preview">
                <div className="agi-lp-console-bar">
                  <span>models.json &middot; catalog dated {CATALOG_AS_OF}</span>
                </div>
                <div className="agi-lp-console-body">
                  <Ledger
                    caption="A sample of the provider catalog"
                    rows={PROVIDER_ROWS.slice(0, 4).map((row) => ({
                      label: row.label,
                      value: providerRowValue(row),
                    }))}
                  />
                </div>
                <p className="agi-lp-console-note">
                  {PROVIDER_ROWS.length} providers, {LOCAL_RUNTIMES.length} local runtimes.{' '}
                  <span>Full roster below.</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-providers-roster-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
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
            <div style={{ marginTop: '2rem' }}>
              <Prose>
                Desktop also talks to {DESKTOP_LOCAL_RUNTIMES.label}. None of them carry catalogued
                models, because AGI asks the server you started what it is holding rather than
                assuming.
              </Prose>
            </div>
            <div style={{ marginTop: '1.5rem' }}>
              <Ledger
                caption="Local runtimes"
                rows={LOCAL_RUNTIMES.map((runtime) => ({
                  label: runtime,
                  value:
                    'You give it a server URL; it reports the models it has loaded. No key, no meter.',
                }))}
              />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-providers-source-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>The source file</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-providers-source-title">
                The CLI and Desktop compile this catalog into their binaries.
              </h2>
            </div>
            <Prose size="lg">
              <code>packages/contracts/types/src/models.json</code> is embedded in the CLI and in
              the Desktop Rust runtime with <code>include_str!</code>, and the web app imports the
              same module. Adding a provider or moving a price moves every surface and this page at
              once. The CLI surface itself is {SURFACE_STATUS.cli.toLowerCase()}.
            </Prose>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-providers-session-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
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
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-providers-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-providers-close-title">
                Bring the key <em className="agi-ds-accent">and the catalog is already there.</em>
              </h2>
              <Prose size="lg">
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
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
