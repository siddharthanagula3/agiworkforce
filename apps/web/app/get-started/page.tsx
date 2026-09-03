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
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';

const HERO_TRANSCRIPT_LABEL = 'Three commands that reach a working chat';

const HERO_TRANSCRIPT = [
  { kind: 'dim', text: '# local: models on this machine' },
  { kind: 'cmd', text: 'agi models scan' },
  { kind: 'cmd', text: 'agi --provider ollama --model <model>' },
  { kind: 'dim', text: '# byok: paste your own provider key' },
  { kind: 'cmd', text: 'agi login' },
] as const;

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
              <strong>
                Website users can use AGI managed cloud, with a small free cap (called Auto Economy)
                and higher-capacity paid plans rolling out. Local and BYOK are supported on desktop
                and developer surfaces. Managed cloud is open by default, not invite-only.
              </strong>
            </>
          }
          ctas={[
            { href: '/download', label: 'Check availability' },
            { href: '/cli', label: 'CLI reference', variant: 'secondary' },
          ]}
          visual={
            <pre
              className="agi-lp-terminal"
              aria-label={HERO_TRANSCRIPT_LABEL}
              style={{ alignSelf: 'start' }}
            >
              {HERO_TRANSCRIPT.map((line) => (
                <span className="agi-lp-terminal-line" data-kind={line.kind} key={line.text}>
                  {line.text}
                </span>
              ))}
            </pre>
          }
        />

        <Section id="install" labelledBy="agi-get-started-install-title" rule>
          <Stack gap="loose">
            <Eyebrow>Install</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-get-started-install-title">
              Install.
            </h2>
            <Stack gap="loose" className="agi-ds-full">
              <SurfaceStatus
                state="live"
                name="Web"
                detail="Hosted chat, projects, and artifacts in the browser, with nothing to install."
                action={{ label: 'Try AGI Web', href: '/login?redirectTo=%2F' }}
              />
              <SurfaceStatus
                state="live"
                name="CLI"
                detail="The agi CLI is released: it ships macOS, Linux, and Windows archives today, and it hosts the local and BYOK modes below."
                action={{ label: 'Download the CLI', href: '/download' }}
              />
              <SurfaceStatus
                state="pending"
                name="Desktop"
                blockedOn="A Linux build is pending its signature check, and the other platforms are not yet signed. The download page resolves what is live for your platform."
              />
              <SurfaceStatus
                state="absent"
                name="Mobile, Chrome, and VS Code"
                detail="Availability per surface lives on the download page with honest status labels."
              />
            </Stack>
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
              Pricing carries the plans and limits for AGI-hosted compute beyond the free cap. The
              docs carry the reference for every surface: CLI, Desktop, Mobile, Web, Chrome, and the
              VS Code extension.
            </Prose>
            <ButtonRow>
              <Button href="/pricing">See what managed cloud costs</Button>
              <Button href="/docs" variant="secondary">
                Read the docs
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
