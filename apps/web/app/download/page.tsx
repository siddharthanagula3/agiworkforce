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
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import { PLATFORM_AVAILABILITY_CONSENT_PURPOSES } from '@/lib/consent-purposes';
import { DesktopDownloadAvailability } from './DesktopDownloadAvailability';
import { CliDownloadAvailability } from './CliDownloadAvailability';
import '@/features/marketing/components/pages/business/code-block.css';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';
const CHECKSUM_FILE = 'SHA256SUMS';
const CHECKSUM_BUNDLE = `${CHECKSUM_FILE}.sigstore.json`;
const SAMPLE_ARCHIVE = 'agiworkforce-darwin-arm64.tar.gz';
const CLOUD_INSTALLER = 'agiworkforce-cloud.dmg';
const CLOUD_APP_PATH = '/Applications/AGI Cloud.app';
const CERTIFICATE_ISSUER = 'https://token.actions.githubusercontent.com';
const RELEASE_REPOSITORY = 'siddharthanagula3/agiworkforce';
const CERTIFICATE_IDENTITY = `https://github.com/${RELEASE_REPOSITORY}/.github/workflows/release-cli.yml@refs/tags/v-cli-<version>`;
const UPDATER_ENDPOINT = '/api/releases/{target}-{arch}/{current_version}';

const COSIGN_COMMAND = `cosign verify-blob --bundle ${CHECKSUM_BUNDLE} \\
    --certificate-oidc-issuer ${CERTIFICATE_ISSUER} \\
    --certificate-identity ${CERTIFICATE_IDENTITY} \\
    ${CHECKSUM_FILE}`;

const VERIFY_TRANSCRIPT = `$ shasum -a 256 -c ${CHECKSUM_FILE}
${SAMPLE_ARCHIVE}: OK
$ tar -xzf ${SAMPLE_ARCHIVE}
$ ./agi doctor
AGI doctor
[Pass] runtime dependency: git - \`git\` is available
[Pass] OS sandbox - macOS Seatbelt is available
[Warn] auth providers - no provider auth entries found; Local models still work`;

const SELF_VERIFY_TRANSCRIPT = `# CLI archives, against the checksum file signed in the release run
$ shasum -a 256 -c ${CHECKSUM_FILE}
$ ${COSIGN_COMMAND}

# the AGI Cloud desktop app, once you have moved it to Applications
$ codesign -d --verbose=4 "${CLOUD_APP_PATH}"
$ xcrun stapler validate ~/Downloads/${CLOUD_INSTALLER}`;

const HERO_TRANSCRIPT: { kind: 'cmd' | 'out' | 'dim'; text: string }[] = [
  { kind: 'cmd', text: `shasum -a 256 -c ${CHECKSUM_FILE}` },
  { kind: 'out', text: `${SAMPLE_ARCHIVE}: OK` },
  { kind: 'cmd', text: './agi doctor' },
  { kind: 'out', text: '[Pass] OS sandbox - macOS Seatbelt is available' },
  { kind: 'dim', text: '[Warn] auth providers - no provider auth entries found' },
];

const RELEASE_CHECKS: { title: string; body: string }[] = [
  {
    title: 'Signed and re-checked inside the same run',
    body: 'The desktop workflow builds each artifact with the release signing key, then verifies that artifact against its own .sig using the updater public key committed in this repository. A mismatch stops the release before anyone sees it.',
  },
  {
    title: 'A draft until a clean machine can install it',
    body: 'A bare Ubuntu container installs the Debian package with no build toolchain present, proves the installed binary resolves every shared library, and a second job installs the previous release, upgrades to this one, and rolls back. The release is published once all of that passes.',
  },
  {
    title: 'macOS builds are signed, notarized, and stapled',
    body: 'Both macOS jobs run codesign --verify --deep --strict against the app, confirm the Developer ID authority and hardened runtime, put the bundle through the same Gatekeeper assessment your Mac will, and validate the notarization ticket stapled onto every DMG they ship.',
  },
  {
    title: 'CLI checksums carry a Sigstore signature',
    body: `The CLI workflow writes ${CHECKSUM_FILE} over every archive, signs it keyless with cosign, and verifies that bundle against the workflow identity that produced it before the release exists.`,
  },
];

export const metadata = buildMetadata({
  title: 'Download AGI: verified installers and signatures',
  description:
    'Every AGI installer is signed inside its release workflow and checked against that signature before publication. See live Desktop and CLI availability, what each release publishes, and how to verify a download yourself.',
  path: '/download',
});

export default function DownloadPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-download-hero-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>Installers and signatures</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-download-hero-title">
                We check the signature <em className="agi-ds-accent">before you download.</em>
              </h1>
              <Prose size="lg">
                Desktop artifacts are signed with the release key and re-verified in the same
                workflow run. CLI archives ship a checksum file signed with Sigstore, verified
                before the release exists. This page then asks the release API again on load, so a
                platform gets a control only once the API confirms a published asset for it.
              </Prose>
              <ButtonRow>
                <Button href="#desktop-downloads">Check the installers</Button>
                <Button href="#release-verification" variant="secondary">
                  How a release is signed
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <pre className="agi-lp-terminal" aria-label="A real installer verification session">
                {HERO_TRANSCRIPT.map((line, index) => (
                  <span className="agi-lp-terminal-line" data-kind={line.kind} key={index}>
                    {line.text}
                  </span>
                ))}
              </pre>
            </div>
          </div>
        </section>

        <DesktopDownloadAvailability />

        <CliDownloadAvailability />

        <section className="agi-lp-section" aria-labelledby="agi-download-verify-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Release verification</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-download-verify-title">
                A build has to prove itself before it reaches this page.
              </h2>
              <Prose>
                The release API answers with a manifest only when the asset URL sits on its
                trusted-host allowlist. A release whose URL falls outside it is answered with a 404,
                and this page then shows a labelled state with nothing to click. These are the
                checks standing behind a control on the rest of the page.
              </Prose>
            </div>

            <div className="agi-ds-grid-2">
              {RELEASE_CHECKS.map((item) => (
                <div className="agi-ds-card" style={{ padding: '1.5rem' }} key={item.title}>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '3rem' }}>
              <Prose>
                None of that has to be taken on trust. The release publishes the material you need
                to repeat the checks yourself, on the file you actually downloaded.
              </Prose>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <Eyebrow>Verify a download on your own machine</Eyebrow>
              <div className="agi-ds-codeblock">
                <pre className="agi-ds-codeblock-pre">{SELF_VERIFY_TRANSCRIPT}</pre>
              </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <Eyebrow>A verified CLI archive, checked and unpacked</Eyebrow>
              <div className="agi-ds-codeblock">
                <pre className="agi-ds-codeblock-pre">{VERIFY_TRANSCRIPT}</pre>
              </div>
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-download-contents-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Release contents</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-download-contents-title">
                Each release publishes the same set of files.
              </h2>
            </div>
            <Ledger
              caption="Release contents"
              rows={[
                {
                  label: 'AGI Desktop · Linux x86_64',
                  value: 'An .AppImage with its matching .sig, plus a .deb for Debian and Ubuntu',
                },
                {
                  label: 'AGI Desktop · macOS universal',
                  value: 'A notarized .dmg, plus an .app.tar.gz updater with its matching .sig',
                },
                {
                  label: 'AGI Cloud · macOS',
                  value: 'One notarized .dmg per architecture, Apple silicon and Intel',
                },
                {
                  label: 'agi CLI',
                  value:
                    '.tar.gz archives for macOS and Linux, .zip archives for Windows, arm64 and x64',
                },
                {
                  label: 'Checksums',
                  value: `${CHECKSUM_FILE} and ${CHECKSUM_BUNDLE} beside the CLI archives`,
                },
                {
                  label: 'Channels',
                  value:
                    'Stable, beta, and nightly are separate release tags. This page reads stable',
                },
                {
                  label: 'Updates',
                  value: `The desktop app asks ${UPDATER_ENDPOINT} and installs only a signed artifact`,
                },
                {
                  label: 'Asset hosts',
                  value:
                    'Release assets are served from our download hosts and GitHub releases, and the API refuses anything else',
                },
              ]}
            />
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-download-notify-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Platforms without an installer</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-download-notify-title">
                Leave an address and we will write when a platform opens.
              </h2>
              <Prose>
                Some surfaces have no installer to verify yet, and each one tracks its own listing:{' '}
                <a href="/mobile" className="agi-ds-link">
                  AGI Mobile
                </a>
                ,{' '}
                <a href="/chrome-extension" className="agi-ds-link">
                  AGI in Chrome
                </a>
                , and{' '}
                <a href="/vscode-extension" className="agi-ds-link">
                  AGI in VS Code
                </a>
                . The sections above report what the release API can confirm for desktop and CLI
                right now.
              </Prose>
            </div>
            <PublicWaitlistForm
              source="other"
              ctaLabel="Get notified"
              successMessage="You're on the list. We'll email you when a platform has a verified installer to download."
              purposes={PLATFORM_AVAILABILITY_CONSENT_PURPOSES}
            />
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-download-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-download-close-title">
                AGI Web opens in a browser <em className="agi-ds-accent">while you wait.</em>
              </h2>
              <Prose size="lg">
                Web needs no release tag and no signature check. Sign in there now, and the same
                account signs you into Desktop on the day an installer for your platform is
                published. Stable channel: nothing is linked here until the release API confirms a
                verified asset.
              </Prose>
              <ButtonRow>
                <Button href={WEB_CHAT_ENTRY_HREF}>Use AGI Web</Button>
                <Button href="/desktop" variant="secondary">
                  What AGI Desktop does
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
