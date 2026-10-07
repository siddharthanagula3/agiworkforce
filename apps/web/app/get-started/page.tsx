import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { formatPrivacyModeLabel } from '@agiworkforce/types';
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
  SurfaceStatus,
  Transcript,
  WEB_ENTRY_HREF,
  type TranscriptLine,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  NOTIFY_CTA,
  SURFACE_NAMES,
  SURFACE_PLATFORMS,
  SURFACE_STATUS,
  surfaceAvailabilitySummary,
} from '@/lib/marketing-constants';
import { joinSurfaceNames } from '@/lib/surface-status';

const LIVE_PATH_STEPS = [
  { lead: 'Open AGI Web.', body: 'It runs in this browser, with nothing to install.' },
  { lead: 'Sign in.', body: 'Use the account you have, or create one in the same flow.' },
  { lead: 'Send a message.', body: 'Managed cloud is open by default with a small free cap.' },
] as const;

const CLI_PREVIEW_TRANSCRIPT_LABEL = 'Three commands that reach a working chat';

const CLI_PREVIEW_TRANSCRIPT: TranscriptLine[] = [
  { kind: 'dim', text: '# local: models on this machine' },
  { kind: 'cmd', text: 'agi models scan' },
  { kind: 'cmd', text: 'agi --provider ollama --model <model>' },
  { kind: 'dim', text: '# byok: paste your own provider key' },
  { kind: 'cmd', text: 'agi login anthropic' },
] as const;

const NOTIFY_LIST_HREF = `${NOTIFY_CTA.href}#notify`;

const NOTIFY_LIST_SURFACES = [
  { id: 'mobile', detail: `The app for ${joinSurfaceNames(SURFACE_PLATFORMS.mobile)}.` },
  { id: 'chrome', detail: 'A side panel in the browser.' },
  { id: 'vscode', detail: 'The agent inside the editor.' },
] as const;

const NOTIFY_LIST_ROWS = NOTIFY_LIST_SURFACES.map((surface) => ({
  label: SURFACE_NAMES[surface.id],
  value: (
    <Stack gap="tight">
      <span>
        <strong>{SURFACE_STATUS[surface.id]}.</strong> {surface.detail}
      </span>
      <Link href={NOTIFY_LIST_HREF} className="agi-ds-link">
        {NOTIFY_CTA.label}
      </Link>
    </Stack>
  ),
}));

export const metadata = buildMetadata({
  title: 'Get started: from zero to a working chat',
  description: `Open AGI Web in the browser, with nothing to install. ${surfaceAvailabilitySummary()} Local and BYOK run on the CLI.`,
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
          minimal
          id="agi-get-started-title"
          eyebrow="Get started"
          title="Get started."
          em="started."
          lede="Open AGI Web, sign in, and send your first message. It runs in your browser, with nothing to install."
          ctas={[
            { href: WEB_ENTRY_HREF, label: 'Try AGI Web' },
            { href: '/download', label: 'Check availability', variant: 'secondary' },
          ]}
          visual={
            <Stack gap="base" className="agi-ds-full">
              {LIVE_PATH_STEPS.map((step, index) => (
                <Prose tone="ink" key={step.lead}>
                  <strong>
                    {index + 1}. {step.lead}
                  </strong>{' '}
                  {step.body}
                </Prose>
              ))}
            </Stack>
          }
        />

        <Section id="install" labelledBy="agi-get-started-install-title" rule>
          <Stack gap="loose">
            <Eyebrow>Availability</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-get-started-install-title">
              Choose your surface.
            </h2>
            <Prose>
              {`AGI Web is ${SURFACE_STATUS.web.toLowerCase()}. Local and BYOK run on the CLI, which is ${SURFACE_STATUS.cli.toLowerCase()}; VS Code BYOK is ${SURFACE_STATUS.vscode.toLowerCase()}, and Desktop is managed-cloud only.`}
            </Prose>
            <Stack gap="loose" className="agi-ds-full">
              <SurfaceStatus
                state="live"
                name="Web"
                detail="Hosted chat, projects, and artifacts in the browser, with nothing to install."
                action={{ label: 'Try AGI Web', href: WEB_ENTRY_HREF }}
              />
              <SurfaceStatus
                state="pending"
                name="CLI"
                blockedOn="The release job builds and signs agi for macOS, Linux, and Windows, but no signed release has been published yet. Once one is, the CLI page shows its install command, and the CLI hosts the local and BYOK modes below."
              />
              <SurfaceStatus
                state="pending"
                name="Desktop"
                blockedOn="The macOS app is signed and notarized by the release job but has not been published yet, and each download opens only once the release API verifies that platform's signature. Windows installers have not been published. The download page resolves what is live for your platform."
              />
              <Ledger caption="Surfaces on the notify list" rows={NOTIFY_LIST_ROWS} />
            </Stack>
          </Stack>
        </Section>

        <Section id="cli-preview" labelledBy="agi-get-started-cli-title" rule>
          <Stack gap="loose">
            <Eyebrow>CLI preview</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-get-started-cli-title">
              What the CLI will look like.
            </h2>
            <div className="agi-ds-grid-2 agi-ds-full">
              <Stack gap="base">
                <Prose>
                  The CLI is {SURFACE_STATUS.cli.toLowerCase()}. The release job builds and signs
                  it, but no signed release has been published yet, so there is nothing to install.
                  Once one is, the CLI page shows its install command and these three commands reach
                  a working chat.
                </Prose>
                <ButtonRow>
                  <Button href="/cli" variant="secondary">
                    CLI reference
                  </Button>
                </ButtonRow>
              </Stack>
              <Transcript
                label={CLI_PREVIEW_TRANSCRIPT_LABEL}
                lines={CLI_PREVIEW_TRANSCRIPT}
                style={{ alignSelf: 'start' }}
              />
            </div>
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
                      <code>agi login &lt;provider&gt;</code>, naming the provider whose key you
                      hold. Paste the key at the prompt and it is saved to the OS credential store
                      except on Linux or when AGIWORKFORCE_NO_KEYRING disables the keyring. In those
                      cases, it is saved to files in the CLI configuration directory. A bare{' '}
                      <code>agi login</code> signs into AGI managed cloud instead.
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
