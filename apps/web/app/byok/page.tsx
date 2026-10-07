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
import { BYOK_SURFACES } from '@/lib/marketing-constants';
import { SURFACE_STATUS } from '@/lib/surface-status';

export const metadata = buildMetadata({
  title: 'BYOK: bring your own keys to the CLI',
  description: `Provider-key setup and storage for AGI ${BYOK_SURFACES.label}. ${BYOK_SURFACES.availability} Learn how provider credentials differ from AGI account sign-in.`,
  path: '/byok',
});

const CUSTODY_ROWS = [
  {
    label: 'CLI',
    value: `${SURFACE_STATUS.cli}. Keys saved with provider-key login use the OS credential store except on Linux or when AGIWORKFORCE_NO_KEYRING disables the keyring. In those cases, these saved keys use files in the CLI configuration directory.`,
  },
  {
    label: 'VS Code',
    value: `${SURFACE_STATUS.vscode}. Provider-key management requires a connected local CLI runtime and delegates key storage to that runtime. The CLI storage rules apply.`,
  },
  {
    label: 'AGI account key',
    value:
      'VS Code stores its separate AGI Workforce account API key in SecretStorage. This is distinct from provider-key management.',
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
              <h1 className="sr-only" id="agi-byok-hero-title">
                Bring your own provider keys.
              </h1>
              <ButtonRow>
                <Button href="/help/byok-provider-keys">Set up a provider key</Button>
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
                  <Ledger caption="Provider and account key storage" rows={CUSTODY_ROWS} />
                </div>
                <p className="agi-lp-receipt">
                  <span className="agi-lp-receipt-mark" aria-hidden="true">
                    &#9671;
                  </span>
                  <span className="agi-lp-receipt-part">provider key</span>
                  <span className="agi-lp-receipt-part">CLI runtime</span>
                  <span className="agi-lp-receipt-part">separate account sign-in</span>
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
            <Prose>
              Bring your own API keys to AGI {BYOK_SURFACES.label}. {BYOK_SURFACES.availability}
            </Prose>
            <div style={{ marginTop: '2rem' }}>
              <Ledger
                caption="BYOK scope"
                rows={[
                  { label: 'Surfaces', value: BYOK_SURFACES.compact },
                  { label: 'Availability', value: BYOK_SURFACES.availability },
                  { label: 'Provider-key storage', value: 'CLI runtime' },
                  { label: 'Account sign-in', value: 'Separate from provider-key login' },
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
                Provider keys use the CLI runtime.
              </h2>
              <Prose>
                VS Code provider-key management uses its connected CLI runtime. Desktop runs on your
                AGI account and takes no provider key. CLI Managed Cloud requests require an AGI
                account token rather than a saved provider API key.
              </Prose>
            </div>
            <Ledger caption="Key custody by surface" rows={CUSTODY_ROWS} />
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-byok-env-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Provider-key setup</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-byok-env-title">
                Add and inspect a provider key.
              </h2>
              <Prose>
                With an installed CLI, use a supported provider name when adding a key. A bare{' '}
                <code>agi login</code> starts AGI managed-cloud sign-in. See the{' '}
                <a href="/help/byok-provider-keys" className="agi-ds-link">
                  provider-key guide
                </a>{' '}
                for storage rules and custom endpoint configuration.
              </Prose>
            </div>
            <Ledger
              caption="CLI provider-key commands"
              rows={[
                { label: 'agi login --help', value: 'Inspect the login command usage.' },
                {
                  label: 'agi login <provider>',
                  value: 'Paste a supported provider API key when prompted.',
                },
                {
                  label: 'agi auth-status',
                  value:
                    'Reports stored credentials; it does not validate the key with the provider.',
                },
              ]}
            />
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-byok-boundary-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Surface boundary</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-byok-boundary-title">
                Check the surface before adding a key.
              </h2>
            </div>
            <Prose size="lg">
              {BYOK_SURFACES.exclusion} Carrying an existing thread across local, BYOK, and managed
              cloud is a separate question, answered on the{' '}
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
                Choose a provider.
              </h2>
              <Prose size="lg">
                Use the provider catalog and the product&rsquo;s model picker when choosing a
                provider or model. Review your provider&rsquo;s billing and data-use terms before
                using a key.
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
