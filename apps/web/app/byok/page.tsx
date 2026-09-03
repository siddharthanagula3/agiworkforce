import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  MarketingFooter,
  Prose,
} from '@/features/marketing/components/system';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';
import { BYOK_SURFACES } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'BYOK: bring your own keys to Desktop, CLI, and VS Code',
  description: `Bring your own provider API keys to AGI ${BYOK_SURFACES.label}. Keys remain in the local runtime, traffic goes direct to your provider, and the route stays visible.`,
  path: '/byok',
});

const CUSTODY_ROWS = [
  {
    label: 'Desktop',
    value:
      'The key is encrypted before it reaches local application storage, and saving it activates a direct-provider route in the running app without a restart.',
  },
  {
    label: 'CLI',
    value:
      'One OS-keyring entry per provider, under the service com.agiworkforce.cli.auth. The on-disk index keeps provider names only, since keyrings cannot be enumerated.',
  },
  {
    label: 'VS Code',
    value:
      'The extension hands the key to the editor’s own SecretStorage and reads it back from there.',
  },
  {
    label: 'Self-hosted',
    value:
      'An operator sets one environment variable per provider on their own deployment. The settings screen reports whether a variable is present and never the value behind it.',
  },
] as const;

export default function ByokPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-byok-hero-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>Bring your own keys</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-byok-hero-title">
                AGI Cloud never sees <em className="agi-ds-accent">your API key.</em>
              </h1>
              <Prose size="lg">
                Bring your own API keys to AGI {BYOK_SURFACES.label}. Each runtime holds the key in
                its own platform credential store, then calls the provider&rsquo;s endpoint
                directly, so the usage lands on your provider account.
              </Prose>
              <ButtonRow>
                <Button href="/docs/byok-env">Set up a provider key</Button>
                <Button href="/download" variant="secondary">
                  Check surface availability
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <div className="agi-lp-console" aria-label="BYOK key custody by surface">
                <div className="agi-lp-console-bar">
                  <span>BYOK &middot; key custody</span>
                </div>
                <div className="agi-lp-console-body">
                  <Ledger caption="Where a key lives, by surface" rows={CUSTODY_ROWS.slice(0, 3)} />
                </div>
                <p className="agi-lp-receipt">
                  <span className="agi-lp-receipt-mark" aria-hidden="true">
                    &#9671;
                  </span>
                  <span className="agi-lp-receipt-part">your key</span>
                  <span className="agi-lp-receipt-part">direct to provider</span>
                  <span className="agi-lp-receipt-part">never held by AGI</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-byok-scope-title">
          <div className="agi-ds-container">
            <h2 className="agi-ds-h2" id="agi-byok-scope-title">
              What BYOK covers.
            </h2>
            <div style={{ marginTop: '2rem' }}>
              <Ledger
                caption="BYOK scope"
                rows={[
                  { label: 'Surfaces', value: BYOK_SURFACES.compact },
                  { label: 'Providers', value: `${BYOK_PROVIDERS.length} provider env vars` },
                  { label: 'Routing', value: 'Direct to the provider endpoint' },
                ]}
              />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-byok-custody-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Key custody</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-byok-custody-title">
                The key stays on the machine you typed it into.
              </h2>
              <Prose>
                There is no shared vault behind these surfaces. A key added on Desktop is unknown to
                the CLI, and a key added to the CLI is unknown to VS Code, because each one writes
                to the credential store its own platform provides.
              </Prose>
            </div>
            <Ledger caption="Key custody by surface" rows={CUSTODY_ROWS} />
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-byok-env-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>The env-var contract</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-byok-env-title">
                A provider key arrives as an environment variable.
              </h2>
              <Prose>
                These are the names a self-hosted deployment reads, and the CLI prompts for the key
                by the same name while it collects one. Presence is all that is ever reported back
                to a settings screen; the value stays server-side.
              </Prose>
            </div>
            <Ledger
              caption="BYOK provider environment variables"
              rows={BYOK_PROVIDERS.map((provider) => ({
                label: provider.label,
                value: provider.envVar,
              }))}
            />
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-byok-boundary-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Surface boundary</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-byok-boundary-title">
                Key entry exists where the key can stay local.
              </h2>
            </div>
            <Prose size="lg">
              {BYOK_SURFACES.exclusion} Those surfaces have nowhere private to put a key, so they do
              not ask for one. Carrying an existing thread across local, BYOK, and managed cloud is
              a separate question, answered on the{' '}
              <a href="/faq" className="agi-ds-link">
                FAQ
              </a>
              .
            </Prose>
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-byok-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-byok-close-title">
                Route your work{' '}
                <em className="agi-ds-accent">through the provider you already pay.</em>
              </h2>
              <Prose size="lg">
                The catalog lists each provider AGI can address, how many models it exposes, how it
                authenticates, and the per-million-token price it publishes.
              </Prose>
              <ButtonRow>
                <Button href="/providers" variant="secondary">
                  Browse the provider catalog
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
