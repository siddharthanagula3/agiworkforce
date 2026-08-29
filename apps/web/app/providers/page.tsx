import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { modelsCatalog, getModels, providerLabels, type ModelMetadata } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame, type TerminalLine } from '@/features/marketing/components/ProductFrame';
import { DevBand, FinalCta } from '@/features/marketing/components/FlagshipSections';
import { BYOK_PROVIDER_IDS } from '@/app/byok/byok-providers';
import {
  CATALOG_AS_OF,
  DESKTOP_LOCAL_RUNTIMES,
  LAUNCH,
  SURFACE_STATUS,
} from '../../lib/marketing-constants';

const compactTokens = (n: number | undefined): string => {
  if (!n) return '—';
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
};

const capabilityFlags = (model: ModelMetadata): string =>
  [
    model.capabilities.tools ? 'T' : '',
    model.capabilities.vision ? 'V' : '',
    model.capabilities.thinking ? 'R' : '',
  ].join('') || '-';

const CATALOG_LISTING = (() => {
  const listed = getModels({ modelTypes: ['chat'] });
  const grouped = new Map<string, ModelMetadata[]>();
  for (const model of listed) {
    const bucket = grouped.get(model.provider) ?? [];
    bucket.push(model);
    grouped.set(model.provider, bucket);
  }
  return [...grouped.entries()]
    .map(([provider, models]) => {
      const heading = `${(providerLabels[provider] ?? provider).toUpperCase()}:`;
      const rows = models.map((model) => {
        const flags = `[${capabilityFlags(model)}]`.padEnd(6);
        const ctx = `${compactTokens(model.contextWindow)} ctx`.padStart(8);
        const out = `${compactTokens(model.maxOutputTokens)} out`.padStart(9);
        const price =
          model.inputCost === undefined || model.outputCost === undefined
            ? ''
            : `  $${model.inputCost.toFixed(2)}/$${model.outputCost.toFixed(2)} base`;
        return `   ${model.id.padEnd(30)} ${flags} ${ctx} ${out}${price}`;
      });
      return [heading, ...rows].join('\n');
    })
    .join('\n\n');
})();

export const metadata = buildMetadata({
  title: 'Providers: the catalog AGI routes to',
  description: `Every cloud provider AGI takes a key for and every local runtime it takes a URL for, generated from the shared model catalog that the CLI and Desktop compile into their binaries. Catalog dated ${CATALOG_AS_OF}.`,
  path: '/providers',
});

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

function hasListPrice(row: ProviderRow): boolean {
  return row.inputPerMillion > 0 || row.outputPerMillion > 0;
}

const LOCAL_MODEL_EXAMPLE = modelsCatalog.providers['ollama']?.defaultModel ?? 'a local model';

const SWITCH_FROM = getModels({ modelTypes: ['chat'] }).find((m) => m.provider === 'anthropic');
const SWITCH_TO = getModels({ modelTypes: ['chat'] }).find((m) => m.provider === 'google');

const SWITCH_SESSION: readonly TerminalLine[] = [
  { kind: 'dim', text: 'BYOK session · the key stays with the local runtime' },
  { kind: 'cmd', text: `/model ${SWITCH_FROM?.id ?? ''}` },
  {
    kind: 'ok',
    text: `info: Switched to ${SWITCH_FROM?.id ?? ''} (${SWITCH_FROM?.provider ?? ''})`,
  },
  { kind: 'cmd', text: `/model ${SWITCH_TO?.id ?? ''}` },
  { kind: 'ok', text: `info: Switched to ${SWITCH_TO?.id ?? ''} (${SWITCH_TO?.provider ?? ''})` },
  { kind: 'cmd', text: '/model' },
  { kind: 'out', text: `info: Current model: ${SWITCH_TO?.id ?? ''}` },
];

const REFUSAL_SESSION: readonly TerminalLine[] = [
  { kind: 'dim', text: 'same session, one command later' },
  { kind: 'cmd', text: `/model ${LOCAL_MODEL_EXAMPLE}` },
  { kind: 'out', text: `warn: Model '${LOCAL_MODEL_EXAMPLE}' routes through local mode,` },
  { kind: 'out', text: 'but this established session is byok; start a new' },
  { kind: 'out', text: 'session instead of carrying its transcript across' },
  { kind: 'out', text: 'trust boundaries' },
];

const SWITCH_HUD = { tokensIn: 8140, tokensOut: 2260, cost: '$0.0000', ctx: '9%' };
const REFUSAL_HUD = { tokensIn: 12480, tokensOut: 3910, cost: '$0.0000', ctx: '14%' };

export default function ProvidersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-providers-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">Provider catalog</p>
              <h1 id="agi-providers-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">
                  Every provider below comes out of{' '}
                  <em className="agi-fl-h1-em">the catalog the apps compile in</em>.
                </span>
              </h1>
              <p className="agi-fl-lede">
                A cloud provider needs a key you own; a local runtime needs a URL for a server you
                already run. The label, the default model, the model count and the list price on
                every card are read from the shared model catalog and the key list the apps ship
                with, so this page cannot name a provider they do not.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="/byok" className="agi-fl-cta agi-fl-cta--primary">
                  Add a provider key
                </Link>
                <Link href="/local" className="agi-fl-cta agi-fl-cta--secondary">
                  Point at a local runtime
                </Link>
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="What the catalog holds">
                <li>{PROVIDER_ROWS.length} providers take a key</li>
                <li>{LOCAL_RUNTIMES.length} runtimes take a URL</li>
                <li>Catalog dated {CATALOG_AS_OF}</li>
              </ul>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main">
              <ProductFrame
                variant="terminal"
                title="agi · byok"
                badge="BYOK"
                routeMode="byok"
                session={SWITCH_SESSION}
                hud={SWITCH_HUD}
              />
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-providers-roster-title">
          <p className="agi-fl-eyebrow">The roster</p>
          <h2 id="agi-providers-roster-title" className="agi-fl-h2">
            Each card below is a row in the shared model catalog.
          </h2>
          <p className="agi-fl-section-lede">
            These {PROVIDER_ROWS.length} providers accept a key you hold, bill you on your own
            account, and between them carry {CATALOGUED_MODEL_COUNT} catalogued models. The price is
            the provider&rsquo;s base list rate per million tokens as the catalog records it;
            individual models and long-input bands can sit above or below it.
          </p>
          <div className="agi-providers-grid">
            {PROVIDER_ROWS.map((row) => (
              <div key={row.id} className="agi-provider-cell">
                <div className="agi-provider-name">{row.label}</div>
                <div className="agi-provider-models">
                  {row.defaultModel
                    ? `Default: ${row.defaultModel}`
                    : 'The endpoint lists its own models'}
                </div>
                <div className="agi-provider-auth">
                  {row.modelCount > 0 ? `${row.modelCount} catalog models` : 'No catalog models'}
                </div>
                {hasListPrice(row) && (
                  <div className="agi-provider-pricing">
                    <span>Base: {formatPrice(row.inputPerMillion)}/MTok in</span>
                    <span className="agi-provider-pricing-sep">&nbsp;·&nbsp;</span>
                    <span>{formatPrice(row.outputPerMillion)}/MTok out</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="agi-fl-section-lede">
            Desktop also talks to {DESKTOP_LOCAL_RUNTIMES.label}. None of them carry catalogued
            models, because AGI asks the server you started what it is holding rather than assuming.
          </p>
          <div className="agi-providers-grid">
            {LOCAL_RUNTIMES.map((runtime) => (
              <div key={runtime} className="agi-provider-cell">
                <div className="agi-provider-name">{runtime}</div>
                <div className="agi-provider-models">
                  You give it a server URL; it reports the models it has loaded.
                </div>
                <div className="agi-provider-auth">No key, no meter</div>
              </div>
            ))}
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-providers-source-title">
          <p className="agi-fl-eyebrow">The source file</p>
          <h2 id="agi-providers-source-title" className="agi-fl-h2">
            The CLI and Desktop compile this catalog into their binaries.
          </h2>
          <p className="agi-fl-section-lede">
            <code>packages/contracts/types/src/models.json</code> is embedded in the CLI and in the
            Desktop Rust runtime with <code>include_str!</code>, and the web app imports the same
            module. Adding a provider or moving a price moves every surface and this page at once.
            Below is what the CLI prints from that file; the CLI surface itself is{' '}
            {SURFACE_STATUS.cli.toLowerCase()}.
          </p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">agi · models list</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-prompt">$ </span>agi models list
              {'\n'}
              {CATALOG_LISTING}
              <span className="agi-terminal-comment">
                Flags: T=tools, V=vision, R=reasoning. !=deprecated, B=beta.
              </span>
            </pre>
          </div>
        </section>

        <DevBand
          eyebrow="Inside one session"
          title="The same command that swaps a model refuses to move a session."
          body="/model resolves the provider from the catalog, then compares the route that model needs against the privacy authority already written beside the transcript. Anthropic to Google is a swap and the thread carries on. Anything that would change the authority is refused by name, and the reviewed fork that would do it properly is described on the Local page."
          ctas={[{ href: '/local', label: 'How a Local session moves' }]}
          visual={
            <ProductFrame
              variant="terminal"
              title="agi · byok"
              badge="refused"
              routeMode="byok"
              session={REFUSAL_SESSION}
              hud={REFUSAL_HUD}
            />
          }
        />

        <FinalCta
          eyebrow="Providers"
          title="Bring the key and the catalog is already there."
          body={`Desktop holds the encrypted key store and every local runtime URL (${SURFACE_STATUS.desktop}). The CLI compiles the same catalog and is ${SURFACE_STATUS.cli.toLowerCase()}.`}
          ctas={[
            { href: '/docs/byok-env', label: 'Read the provider-key guide' },
            { href: '/download', label: 'Check surface availability' },
          ]}
          stamp={LAUNCH.publicLabel}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
