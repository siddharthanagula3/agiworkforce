import { buildMetadata } from '@/lib/seo/metadata';
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
import { BYOK_PROVIDERS } from '@/lib/byok-providers';
import { BYOK_SURFACES } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'BYOK: bring your own keys to Desktop, CLI, and VS Code',
  description: `Bring your own provider API keys to AGI ${BYOK_SURFACES.label}. Keys remain in the local runtime, traffic goes direct to your provider, and the route stays visible.`,
  path: '/byok',
});

export default function ByokPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-byok-hero-title"
          eyebrow="Bring your own keys"
          title="AGI Cloud never sees your API key."
          lede={
            <>
              Bring your own API keys to AGI {BYOK_SURFACES.label}. Each runtime holds the key in
              its own platform credential store, then calls the provider&rsquo;s endpoint directly,
              so the usage lands on your provider account.
            </>
          }
          ctas={[
            { href: '/docs/byok-env', label: 'Set up a provider key' },
            { href: '/download', label: 'Check surface availability', variant: 'secondary' },
          ]}
        />

        <Section id="byok-scope" labelledBy="agi-byok-scope-title" rule>
          <Stack>
            <h2 className="agi-ds-h2" id="agi-byok-scope-title">
              What BYOK covers.
            </h2>
            <Ledger
              caption="BYOK scope"
              rows={[
                { label: 'Surfaces', value: BYOK_SURFACES.compact },
                { label: 'Providers', value: `${BYOK_PROVIDERS.length} provider env vars` },
                { label: 'Routing', value: 'Direct to the provider endpoint' },
              ]}
            />
          </Stack>
        </Section>

        <Section id="byok-custody" labelledBy="agi-byok-custody-title" rule ground="2">
          <Stack gap="loose">
            <div>
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
            <Ledger
              caption="Key custody by surface"
              rows={[
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
              ]}
            />
          </Stack>
        </Section>

        <Section id="byok-env" labelledBy="agi-byok-env-title" rule>
          <Stack gap="loose">
            <div>
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
          </Stack>
        </Section>

        <Section id="byok-boundary" labelledBy="agi-byok-boundary-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Surface boundary</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-byok-boundary-title">
                Key entry exists where the key can stay local.
              </h2>
            </div>
            <Prose>
              {BYOK_SURFACES.exclusion} Those surfaces have nowhere private to put a key, so they do
              not ask for one. Carrying an existing thread across local, BYOK, and managed cloud is
              a separate question, answered on the{' '}
              <a href="/faq" className="agi-ds-link">
                FAQ
              </a>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="byok-close" labelledBy="agi-byok-close-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-byok-close-title">
              Route your work through the provider you already pay.
            </h2>
            <Prose>
              The catalog lists each provider AGI can address, how many models it exposes, how it
              authenticates, and the per-million-token price it publishes.
            </Prose>
            <ButtonRow>
              <Button href="/providers" variant="secondary">
                Browse the provider catalog
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
