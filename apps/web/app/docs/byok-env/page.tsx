import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Ledger, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';

export const metadata = buildMetadata({
  title: 'Provider-key configuration',
  description:
    'Configure provider credentials for a self-hosted AGI deployment, Desktop, CLI, or VS Code without crossing trust boundaries.',
  path: '/docs/byok-env',
});

export default function ByokEnvDocsPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-byok-env-title"
          eyebrow="Docs / provider keys"
          title="Provider-key configuration."
          lede="Self-hosted AGI deployments read operator-managed provider keys from environment variables. Desktop, CLI, and VS Code each provide a local credential flow for user-managed BYOK. Hosted Web and Mobile do not expose BYOK key entry."
          ctas={[]}
        />

        <Section id="quickstart" labelledBy="agi-byok-env-quickstart-title" rule>
          <Stack gap="tight">
            <h2 className="agi-ds-h2" id="agi-byok-env-quickstart-title">
              Quick start: create or edit .env.local.
            </h2>
            <Prose>
              In the root of your self-hosted deployment (or <code>apps/web/</code> for local dev),
              create or edit <code>.env.local</code> and add the keys for the providers you want to
              use.
            </Prose>
          </Stack>
        </Section>

        <Section id="providers" labelledBy="agi-byok-env-providers-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-byok-env-providers-title">
                Supported providers and env vars.
              </h2>
              <Prose>
                Set any combination below. Only providers with a key present will be active.
              </Prose>
            </div>
            <Ledger
              caption="Supported providers and env vars"
              rows={BYOK_PROVIDERS.map((p) => ({
                label: p.label,
                value: (
                  <>
                    <code>{p.envVar}</code> &middot;{' '}
                    {p.pendingAdapter ? 'Planned adapter' : 'Active in v1'}
                  </>
                ),
              }))}
            />
          </Stack>
        </Section>

        <Section id="example" labelledBy="agi-byok-env-example-title" rule>
          <Stack gap="tight">
            <h2 className="agi-ds-h2" id="agi-byok-env-example-title">
              Example .env.local.
            </h2>
            <pre className="agi-ds-prose" data-size="sm" style={{ overflowX: 'auto' }}>
              {`# .env.local - never commit this file
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...

# Add any others you want active
# DEEPSEEK_API_KEY=...
# PERPLEXITY_API_KEY=pplx-...`}
            </pre>
          </Stack>
        </Section>

        <Section id="desktop-vault" labelledBy="agi-byok-env-vault-title" rule ground="2">
          <Stack gap="tight">
            <h2 className="agi-ds-h2" id="agi-byok-env-vault-title">
              Desktop writes to its encrypted local vault.
            </h2>
            <Prose>
              Tauri Desktop encrypts provider keys in local application storage and activates the
              selected direct-provider route without sending the key to AGI managed cloud. The CLI
              uses the operating system keyring; VS Code uses SecretStorage. These stores are
              surface-local and do not sync provider keys between apps.
            </Prose>
          </Stack>
        </Section>

        <Section id="desktop-entry" labelledBy="agi-byok-env-entry-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-byok-env-entry-title">
                Desktop key entry.
              </h2>
              <Prose>
                Desktop can add provider keys during onboarding or in Settings, Models &amp; Keys.
                The native runtime writes them to secure local storage; self-hosted Web deployments
                continue to use environment variables. BYOK is not configured in AGI&rsquo;s hosted
                Web or Mobile apps.
              </Prose>
            </div>
            <Ledger
              caption="Related"
              rows={[
                {
                  label: 'BYOK surfaces',
                  value: (
                    <a href="/byok" className="agi-ds-link">
                      Compare supported BYOK surfaces
                    </a>
                  ),
                },
              ]}
            />
          </Stack>
        </Section>
      </main>
      <MarketingFooter condensed />
    </div>
  );
}
