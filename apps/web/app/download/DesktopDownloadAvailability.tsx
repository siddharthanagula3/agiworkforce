'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { detectMacArchitecture, type DetectedArchitecture } from './detect-architecture';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';

type Architectures = { arm64: boolean; x64: boolean };

type Availability =
  | { state: 'loading' }
  | { state: 'available'; version: string; architectures: Architectures }
  | { state: 'empty' }
  | { state: 'error' };

interface InstallerChecksum {
  name: string;
  architecture: 'arm64' | 'x64' | null;
  sha256: string;
}

const ARCHITECTURE_LABELS: Record<'arm64' | 'x64', string> = {
  arm64: 'Apple silicon',
  x64: 'Intel Mac',
};

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

function isDesktopManifest(
  value: unknown,
): value is { version: string; architectures: Architectures } {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Record<string, unknown>;
  const architectures = manifest['architectures'];
  const platforms = manifest['platforms'];
  const arm64 = (architectures as Record<string, unknown> | undefined)?.['arm64'];
  const x64 = (architectures as Record<string, unknown> | undefined)?.['x64'];
  return (
    typeof manifest['version'] === 'string' &&
    manifest['version'].trim() !== '' &&
    platforms !== null &&
    typeof platforms === 'object' &&
    (platforms as Record<string, unknown>)['mac'] === true &&
    architectures !== null &&
    typeof architectures === 'object' &&
    typeof arm64 === 'boolean' &&
    typeof x64 === 'boolean' &&
    (arm64 || x64)
  );
}

function parseChecksums(value: unknown): InstallerChecksum[] {
  if (!value || typeof value !== 'object') return [];
  const installers = (value as Record<string, unknown>)['installers'];
  if (!Array.isArray(installers)) return [];
  const parsed: InstallerChecksum[] = [];
  for (const entry of installers) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const name = record['name'];
    const sha256 = record['sha256'];
    const architecture = record['architecture'];
    if (typeof name !== 'string' || typeof sha256 !== 'string') continue;
    if (!/^[0-9a-f]{64}$/.test(sha256)) continue;
    parsed.push({
      name,
      architecture: architecture === 'arm64' || architecture === 'x64' ? architecture : null,
      sha256,
    });
  }
  return parsed;
}

function Alternatives() {
  return (
    <p className="agi-ds-availability-links">
      <Link href={WEB_CHAT_ENTRY_HREF} className="agi-ds-link">
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
  architecture: 'arm64' | 'x64';
  detected: DetectedArchitecture;
}) {
  const recommended = detected === architecture;
  return (
    <a
      href={`/api/download?platform=mac&arch=${architecture}`}
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
  const [availability, setAvailability] = useState<Availability>({ state: 'loading' });
  const [checksums, setChecksums] = useState<InstallerChecksum[]>([]);
  const [detected, setDetected] = useState<DetectedArchitecture>('unknown');
  const requestId = useRef(0);

  const checkRelease = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setAvailability({ state: 'loading' });

    try {
      const response = await fetch('/api/releases/desktop-cloud/latest', {
        cache: 'no-store',
        signal,
      });

      if (currentRequest !== requestId.current) return;
      if (response.status === 404) {
        setAvailability({ state: 'empty' });
        return;
      }
      if (!response.ok) throw new Error(`Release lookup failed with status ${response.status}`);

      const manifest: unknown = await response.json();
      if (currentRequest !== requestId.current) return;
      if (!isDesktopManifest(manifest)) {
        throw new Error('Release lookup returned an invalid desktop manifest');
      }

      setAvailability({
        state: 'available',
        version: manifest.version,
        architectures: manifest.architectures,
      });
    } catch {
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setAvailability({ state: 'error' });
    }
  }, []);

  const checkChecksums = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/download/checksums', { cache: 'no-store', signal });
      setChecksums(response.ok ? parseChecksums(await response.json()) : []);
    } catch {
      setChecksums([]);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkRelease(controller.signal);
    void checkChecksums(controller.signal);
    return () => controller.abort();
  }, [checkRelease, checkChecksums]);

  useEffect(() => {
    let live = true;
    void detectMacArchitecture(typeof navigator === 'undefined' ? undefined : navigator, () =>
      typeof document === 'undefined' ? null : document.createElement('canvas'),
    ).then((architecture) => {
      if (live) setDetected(architecture);
    });
    return () => {
      live = false;
    };
  }, []);

  const offered =
    availability.state === 'available'
      ? (['arm64', 'x64'] as const).filter(
          (architecture) => availability.architectures[architecture],
        )
      : [];
  const shownChecksums = checksums.filter(
    (checksum) => checksum.architecture === null || offered.includes(checksum.architecture),
  );

  return (
    <Section id="desktop-downloads" labelledBy="desktop-downloads-title" rule>
      <Eyebrow>Desktop availability</Eyebrow>
      <h2 id="desktop-downloads-title" className="agi-ds-h2">
        Desktop installer availability
      </h2>
      <Prose>
        AGI Desktop ships for macOS as one notarized installer per architecture. A download control
        appears here only once the release API confirms a signed build for that architecture.
        Windows and Linux installers have not been published, and no release date is available for
        them.
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
                <button
                  type="button"
                  className="agi-ds-btn"
                  data-variant="primary"
                  onClick={() => void checkRelease()}
                >
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
            className="mt-4 list-decimal space-y-2 pl-5 text-sm"
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
