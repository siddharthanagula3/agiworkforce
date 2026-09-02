import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame, type TerminalLine } from '@/features/marketing/components/ProductFrame';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import { DesktopDownloadAvailability } from './DesktopDownloadAvailability';
import { CliDownloadAvailability } from './CliDownloadAvailability';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';
const RELEASE_REPOSITORY = 'siddharthanagula3/agiworkforce';
const CHECKSUM_FILE = 'SHA256SUMS';
const CHECKSUM_BUNDLE = `${CHECKSUM_FILE}.sigstore.json`;
const SAMPLE_ARCHIVE = 'agiworkforce-darwin-arm64.tar.gz';
const CLOUD_INSTALLER = 'agiworkforce-cloud.dmg';
const CLOUD_APP_PATH = '/Applications/AGI Cloud.app';
const CERTIFICATE_ISSUER = 'https://token.actions.githubusercontent.com';
const CERTIFICATE_IDENTITY = `https://github.com/${RELEASE_REPOSITORY}/.github/workflows/release-cli.yml@refs/tags/v-cli-<version>`;
const UPDATER_ENDPOINT = '/api/releases/{target}-{arch}/{current_version}';
const PROSE_LINK_STYLE = { color: 'var(--agi-ink)', textDecoration: 'underline' } as const;

const COSIGN_COMMAND = `cosign verify-blob --bundle ${CHECKSUM_BUNDLE} \\
    --certificate-oidc-issuer ${CERTIFICATE_ISSUER} \\
    --certificate-identity ${CERTIFICATE_IDENTITY} \\
    ${CHECKSUM_FILE}`;

const VERIFY_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: `shasum -a 256 -c ${CHECKSUM_FILE}` },
  { kind: 'ok', text: `${SAMPLE_ARCHIVE}: OK` },
  { kind: 'cmd', text: `tar -xzf ${SAMPLE_ARCHIVE}` },
  { kind: 'cmd', text: './agi doctor' },
  { kind: 'out', text: 'AGI doctor' },
  { kind: 'ok', text: '[Pass] runtime dependency: git - `git` is available' },
  { kind: 'ok', text: '[Pass] OS sandbox - macOS Seatbelt is available' },
  {
    kind: 'dim',
    text: '[Warn] auth providers - no provider auth entries found; Local models still work',
  },
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
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-download-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Installers and signatures</p>
          <h1 id="agi-download-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">
              We <em className="agi-fl-h1-em">check the signature</em> before you download.
            </span>
          </h1>
          <p className="agi-fl-lede">
            Desktop artifacts are signed with the release key and re-verified against that signature
            in the same workflow run. CLI archives ship a checksum file signed with Sigstore and
            verified before the release exists. This page then asks the release API again on load,
            so a platform gets a download control only once the API confirms a published asset for
            it.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="#desktop-downloads" className="agi-fl-cta agi-fl-cta--primary">
              Check the installers
            </Link>
            <Link href="#release-verification" className="agi-fl-cta agi-fl-cta--secondary">
              How a release is signed
            </Link>
          </div>

          <div className="agi-fl-hero-console" aria-hidden="true">
            <ProductFrame
              variant="desktop"
              title="AGI"
              badge="Local"
              className="agi-fl-hero-frame--main"
            />
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="your machine"
              className="agi-fl-hero-frame--terminal"
              session={VERIFY_SESSION}
              hud={false}
            />
          </div>
        </section>

        <DesktopDownloadAvailability />

        <CliDownloadAvailability />

        <section
          id="release-verification"
          className="agi-fl-section"
          aria-labelledby="agi-download-verify-title"
        >
          <p className="agi-fl-eyebrow">Release verification</p>
          <h2 id="agi-download-verify-title" className="agi-fl-h2">
            A build has to prove itself before it reaches this page.
          </h2>
          <p className="agi-fl-section-lede">
            The release API answers with a manifest only when the asset URL sits on its trusted-host
            allowlist. A release whose URL falls outside it is answered with a 404, and this page
            then shows a labelled state with nothing to click. These are the checks standing behind
            a control on the rest of the page.
          </p>

          <ul
            className="mt-8 grid list-none gap-4 p-0 md:grid-cols-2"
            aria-label="Release verification checks"
          >
            {RELEASE_CHECKS.map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-border bg-card p-5 text-card-foreground"
              >
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>

          <p className="agi-fl-section-lede">
            None of that has to be taken on trust. The release publishes the material you need to
            repeat the checks yourself, on the file you actually downloaded.
          </p>

          <div className="agi-terminal mt-8">
            <div className="agi-terminal-bar">Verify a download on your own machine</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-comment">
                # CLI archives, against the checksum file signed in the release run
              </span>
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>
              {`shasum -a 256 -c ${CHECKSUM_FILE}`}
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>
              {COSIGN_COMMAND}
              {'\n\n'}
              <span className="agi-terminal-comment">
                # the AGI Cloud desktop app, once you have moved it to Applications
              </span>
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>
              {`codesign -d --verbose=4 "${CLOUD_APP_PATH}"`}
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>
              {`xcrun stapler validate ~/Downloads/${CLOUD_INSTALLER}`}
            </pre>
          </div>
        </section>

        <LedgerSection
          eyebrow="Release contents"
          title="Each release publishes the same set of files."
          rows={[
            {
              k: 'AGI Desktop · Linux x86_64',
              v: 'An .AppImage with its matching .sig, plus a .deb for Debian and Ubuntu',
            },
            {
              k: 'AGI Desktop · macOS universal',
              v: 'A notarized .dmg, plus an .app.tar.gz updater with its matching .sig',
            },
            {
              k: 'AGI Cloud · macOS',
              v: 'One notarized .dmg per architecture, Apple silicon and Intel',
            },
            {
              k: 'agi CLI',
              v: '.tar.gz archives for macOS and Linux, .zip archives for Windows, arm64 and x64',
            },
            {
              k: 'Checksums',
              v: `${CHECKSUM_FILE} and ${CHECKSUM_BUNDLE} beside the CLI archives`,
            },
            {
              k: 'Channels',
              v: 'Stable, beta, and nightly are separate release tags. This page reads stable',
            },
            {
              k: 'Updates',
              v: `The desktop app asks ${UPDATER_ENDPOINT} and installs only a signed artifact`,
            },
            {
              k: 'Asset hosts',
              v: 'Release assets are served from our download hosts and GitHub releases, and the API refuses anything else',
            },
          ]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-download-notify-title">
          <p className="agi-fl-eyebrow">Platforms without an installer</p>
          <h2 id="agi-download-notify-title" className="agi-fl-h2">
            Leave an address and we will write when a platform opens.
          </h2>
          <p className="agi-fl-section-lede">
            Some surfaces have no installer to verify yet, and each one tracks its own listing:{' '}
            <Link href="/mobile" style={PROSE_LINK_STYLE}>
              AGI Mobile
            </Link>
            ,{' '}
            <Link href="/chrome-extension" style={PROSE_LINK_STYLE}>
              AGI in Chrome
            </Link>
            , and{' '}
            <Link href="/vscode-extension" style={PROSE_LINK_STYLE}>
              AGI in VS Code
            </Link>
            . The sections above report what the release API can confirm for desktop and CLI right
            now.
          </p>
          <div className="agi-fl-launch-form">
            <PublicWaitlistForm
              source="other"
              ctaLabel="Get notified"
              successMessage="You're on the list. We'll email you when a platform has a verified installer to download."
            />
          </div>
        </section>

        <FinalCta
          eyebrow="No installer required"
          title="AGI Web opens in a browser while you wait on a platform."
          body="Web needs no release tag and no signature check. Sign in there now, and the same account signs you into Desktop on the day an installer for your platform is published."
          ctas={[
            { href: WEB_CHAT_ENTRY_HREF, label: 'Use AGI Web' },
            { href: '/desktop', label: 'What AGI Desktop does' },
          ]}
          stamp="Stable channel · nothing is linked here until the release API confirms a verified asset"
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
