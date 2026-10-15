'use client';

import Link from 'next/link';
import { Eyebrow, Prose, Section, WEB_ENTRY_HREF } from '@/features/marketing/components/system';
import type { DetectedArchitecture, MacArchitecture } from './detect-architecture';
import { ARCHITECTURE_LABELS, macDownloadHref, useDesktopRelease } from './use-desktop-release';

const INSTALL_STEPS: readonly string[] = [
  'Download the installer for your Mac. The buttons above appear only for an architecture this release actually publishes.',
  'Check the file against the published SHA-256 below with shasum -a 256, and compare the two strings before you open anything.',
  'Open the .dmg and drag AGI Cloud into your Applications folder. Installing anywhere else leaves updates unable to find the app.',
  'Launch it from Applications. macOS verifies the notarization ticket on first launch, so no Gatekeeper override is needed.',
  'Sign in with the same account you use on the web. Nothing installs or updates on its own.',
];

const UNAVAILABLE_PLATFORMS: readonly { platform: string; detail: string }[] = [
  {
    platform: 'Windows',
    detail: 'Windows installer not published. No release date is available for it.',
  },
  {
    platform: 'Linux',
    detail: 'Linux installer not published. No release date is available for it.',
  },
];

function Alternatives() {
  return (
    <p className="agi-ds-availability-links">
      <Link href={WEB_ENTRY_HREF} className="agi-ds-link">
        Use AGI Web
      </Link>
      <Link href="/cli" className="agi-ds-link">
        See CLI availability
      </Link>
    </p>
  );
}

function DownloadButton({
  architecture,
  detected,
}: {
  architecture: MacArchitecture;
  detected: DetectedArchitecture;
}) {
  const recommended = detected === architecture;
  return (
    <a
      href={macDownloadHref(architecture)}
      className="agi-ds-btn"
      data-variant={recommended ? 'primary' : 'secondary'}
      aria-describedby={recommended ? 'desktop-arch-detected' : undefined}
    >
      Download for {ARCHITECTURE_LABELS[architecture]}
      {recommended ? ' (this Mac)' : ''}
    </a>
  );
}

export function DesktopDownloadAvailability() {
  const { availability, offered, checksums: shownChecksums, detected, retry } = useDesktopRelease();

  return (
    <Section id="desktop-downloads" labelledBy="desktop-downloads-title" rule>
      <Eyebrow>Desktop availability</Eyebrow>
      <h2 id="desktop-downloads-title" className="agi-ds-h2">
        Desktop installer availability
      </h2>
      <Prose>
        The public Desktop release channel targets one signed and notarized macOS installer per
        architecture. A download control appears here only once the release API confirms a build for
        that architecture. Windows and Linux installers have not been published, and no release date
        is available for them.
      </Prose>

      <ul className="agi-ds-ledger agi-ds-availability" aria-label="Desktop platforms">
        <li className="agi-ds-ledger-row">
          <span className="agi-ds-ledger-label">macOS</span>
          <span className="agi-ds-ledger-value">
            {availability.state === 'loading' && (
              <span
                role="status"
                aria-label="Checking AGI Desktop downloads"
                aria-live="polite"
                aria-busy="true"
              >
                Checking the release channel…
              </span>
            )}
            {availability.state === 'available' && (
              <span className="agi-ds-availability-ready">
                <span className="agi-ds-muted">
                  Signed and notarized · version {availability.version}
                </span>
                <span className="agi-ds-btn-row">
                  {offered.map((architecture) => (
                    <DownloadButton
                      key={architecture}
                      architecture={architecture}
                      detected={detected}
                    />
                  ))}
                </span>
                <span className="agi-ds-muted" id="desktop-arch-detected">
                  {detected === 'unknown'
                    ? 'We could not read this machine’s processor from the browser, so both installers are offered. Apple menu, then About This Mac, names yours.'
                    : `This browser reports ${ARCHITECTURE_LABELS[detected]}. The other installer stays available if that is wrong.`}
                </span>
              </span>
            )}
            {availability.state === 'empty' && (
              <span
                role="status"
                aria-label="AGI Desktop downloads unavailable"
                aria-live="polite"
                className="agi-ds-availability-state"
              >
                No signed AGI Desktop installer is available right now.
                <Alternatives />
              </span>
            )}
            {availability.state === 'error' && (
              <span role="alert" className="agi-ds-availability-state">
                We could not verify the AGI Desktop installer.
                <button type="button" className="agi-ds-btn" data-variant="primary" onClick={retry}>
                  Retry release check
                </button>
                <Alternatives />
              </span>
            )}
          </span>
        </li>

        {UNAVAILABLE_PLATFORMS.map((row) => (
          <li className="agi-ds-ledger-row" key={row.platform}>
            <span className="agi-ds-ledger-label">{row.platform}</span>
            <span className="agi-ds-ledger-value">
              <span
                role="status"
                aria-label={`${row.platform} downloads unavailable`}
                aria-live="polite"
                className="agi-ds-availability-state"
              >
                {row.detail}
                <Alternatives />
              </span>
            </span>
          </li>
        ))}
      </ul>

      {shownChecksums.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <Eyebrow>Published checksums</Eyebrow>
          <Prose size="sm">
            Run <code>shasum -a 256</code> against the file you downloaded and compare it with the
            SHA-256 the release run published for it.
          </Prose>
          <ul className="agi-ds-ledger" aria-label="Installer checksums">
            {shownChecksums.map((checksum) => (
              <li className="agi-ds-ledger-row" key={checksum.name}>
                <span className="agi-ds-ledger-label">{checksum.name}</span>
                <span className="agi-ds-ledger-value">
                  <code>{checksum.sha256}</code>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {availability.state === 'available' && (
        <div style={{ marginTop: '2rem' }}>
          <Eyebrow>Install it</Eyebrow>
          <ol
            className="mt-4 list-decimal space-y-2 ps-5 text-sm"
            aria-label="Install AGI Desktop on macOS"
          >
            {INSTALL_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  );
}
