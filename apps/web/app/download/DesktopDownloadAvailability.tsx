'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eyebrow, Prose, Section } from '@/features/marketing/components/system';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';

type Architectures = { arm64: boolean; x64: boolean };

type Availability =
  | { state: 'loading' }
  | { state: 'available'; version: string; architectures: Architectures }
  | { state: 'empty' }
  | { state: 'error' };

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

export function DesktopDownloadAvailability() {
  const [availability, setAvailability] = useState<Availability>({ state: 'loading' });
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

  useEffect(() => {
    const controller = new AbortController();
    void checkRelease(controller.signal);
    return () => controller.abort();
  }, [checkRelease]);

  return (
    <Section id="desktop-downloads" labelledBy="desktop-downloads-title" rule>
      <Eyebrow>Desktop availability</Eyebrow>
      <h2 id="desktop-downloads-title" className="agi-ds-h2">
        Desktop installer availability
      </h2>
      <Prose>
        AGI Desktop ships for macOS as one notarized installer per architecture. A download control
        appears here only once the release API confirms a signed build for that architecture.
        Windows installers have not been published, and no release date is available for them.
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
                  {availability.architectures.arm64 && (
                    <a
                      href="/api/download?platform=mac&arch=arm64"
                      className="agi-ds-btn"
                      data-variant="primary"
                    >
                      Download for Apple silicon
                    </a>
                  )}
                  {availability.architectures.x64 && (
                    <a
                      href="/api/download?platform=mac&arch=x64"
                      className="agi-ds-btn"
                      data-variant="secondary"
                    >
                      Download for Intel Mac
                    </a>
                  )}
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

        <li className="agi-ds-ledger-row">
          <span className="agi-ds-ledger-label">Windows</span>
          <span className="agi-ds-ledger-value">
            <span
              role="status"
              aria-label="Windows downloads unavailable"
              aria-live="polite"
              className="agi-ds-availability-state"
            >
              Windows installer not published.
              <Alternatives />
            </span>
          </span>
        </li>
      </ul>
    </Section>
  );
}
