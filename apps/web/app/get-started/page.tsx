import { buildMetadata } from '@/lib/seo/metadata';
import { formatPrivacyModeLabel } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { POSITIONING } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Get started: from zero to a working chat',
  description:
    'Five minutes from zero to a working chat across multiple providers, on the web, the CLI, or a local model.',
  path: '/get-started',
});

export default function GetStartedPage() {
  const localLabel = formatPrivacyModeLabel('local');
  const byokLabel = formatPrivacyModeLabel('byok');

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-get-started-title"
          eyebrow="Get started"
          title="Get started."
          lede={
            <>
              Five minutes from zero to a working chat across multiple providers.{' '}
              <strong>{POSITIONING.trustBoundary}</strong>
            </>
          }
          ctas={[
            { href: '/download', label: 'Check availability' },
            { href: '/cli', label: 'CLI reference', variant: 'secondary' },
          ]}
        />

        <Section id="install" labelledBy="agi-get-started-install-title" rule>
          <Stack gap="loose">
            <Eyebrow>Install</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-get-started-install-title">
              Install.
            </h2>
            <FactGrid
              items={[
                {
                  meta: 'Web',
                  title: 'In the browser. Nothing to install.',
                  body: (
                    <>
                      <a className="agi-ds-link" href="/login?redirectTo=%2F">
                        Try AGI Web
                      </a>{' '}
                      for hosted chat, projects, and artifacts today.
                    </>
                  ),
                },
                {
                  meta: 'Desktop & CLI',
                  title: 'Local and BYOK hosts',
                  body: (
                    <>
                      The <code>agi</code> CLI is released: it ships macOS, Linux, and Windows
                      archives today. Desktop has a Linux build pending its signature check; the
                      other platforms are not yet signed. The{' '}
                      <a className="agi-ds-link" href="/download">
                        download page
                      </a>{' '}
                      resolves what is live for your platform.
                    </>
                  ),
                },
                {
                  meta: 'Mobile, Chrome & VS Code',
                  title: 'Availability lives on the download page',
                  body: (
                    <>
                      Availability per surface lives on the{' '}
                      <a className="agi-ds-link" href="/download">
                        download page
                      </a>{' '}
                      with honest status labels.
                    </>
                  ),
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="pick-mode" labelledBy="agi-get-started-mode-title" rule ground="2">
          <Stack gap="loose">
            <Eyebrow>Pick a mode</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-get-started-mode-title">
              Pick a mode.
            </h2>
            <FactGrid
              items={[
                {
                  meta: localLabel,
                  title: 'Free forever, fully offline',
                  body: (
                    <>
                      Run <code>agi models scan</code>, then{' '}
                      <code>agi --provider ollama --model &lt;model&gt;</code> after installing
                      Ollama, or <code>agi --provider lmstudio --model &lt;model&gt;</code> for LM
                      Studio. No keys, no quotas, fully offline.
                    </>
                  ),
                },
                {
                  meta: byokLabel,
                  title: 'Free forever, your own key',
                  body: (
                    <>
                      <code>agi login</code>. Paste your provider key. Encrypted on device.
                    </>
                  ),
                },
                {
                  meta: 'Managed cloud',
                  title: 'Open by default',
                  body: 'Sign in to use AGI-hosted compute today, open by default with a small free cap. Local and BYOK stay free acquisition paths.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="whats-next" labelledBy="agi-get-started-next-title" rule>
          <Stack gap="loose">
            <Eyebrow>What&rsquo;s next</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-get-started-next-title">
              What&rsquo;s next.
            </h2>
            <Prose>
              The CLI is released for Local and BYOK work; Desktop is pending its signature check.
              The download page tracks availability for every surface and platform in one place.
            </Prose>
            <ButtonRow>
              <Button href="/download">Check availability</Button>
              <Button href="/cli" variant="secondary">
                CLI reference
              </Button>
            </ButtonRow>
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
