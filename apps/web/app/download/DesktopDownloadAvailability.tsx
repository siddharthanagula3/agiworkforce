'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eyebrow, Prose, Section } from '@/features/marketing/components/system';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';

type Availability =
  | { state: 'loading' }
  | { state: 'available'; version: string }
  | { state: 'empty' }
  | { state: 'error' };

type CloudAvailability =
  | { state: 'loading' }
  | {
      state: 'available';
      version: string;
      architectures: { arm64: boolean; x64: boolean };
    }
  | { state: 'empty' }
  | { state: 'error' };

function isSignedDesktopManifest(
  value: unknown,
  platform: string,
): value is { version: string; platforms: Record<string, { url: string; signature: string }> } {
  if (!value || typeof value !== 'object') return false;

  const manifest = value as Record<string, unknown>;
  if (typeof manifest['version'] !== 'string' || manifest['version'].trim() === '') return false;
  if (!manifest['platforms'] || typeof manifest['platforms'] !== 'object') return false;

  const asset = (manifest['platforms'] as Record<string, unknown>)[platform];
  if (!asset || typeof asset !== 'object') return false;

  const record = asset as Record<string, unknown>;
  return (
    typeof record['url'] === 'string' &&
    record['url'].trim() !== '' &&
    typeof record['signature'] === 'string' &&
    record['signature'].trim() !== ''
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

function isCloudDesktopManifest(value: unknown): value is {
  version: string;
  architectures: { arm64: boolean; x64: boolean };
} {
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

export function DesktopDownloadAvailability() {
  const [availability, setAvailability] = useState<Availability>({ state: 'loading' });
  const [macDesktopAvailability, setMacDesktopAvailability] = useState<Availability>({
    state: 'loading',
  });
  const [cloudAvailability, setCloudAvailability] = useState<CloudAvailability>({
    state: 'loading',
  });
  const requestId = useRef(0);
  const macDesktopRequestId = useRef(0);
  const cloudRequestId = useRef(0);

  const checkRelease = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setAvailability({ state: 'loading' });

    try {
      const response = await fetch('/api/releases/latest/linux-x86_64', {
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
      if (!isSignedDesktopManifest(manifest, 'linux-x86_64')) {
        throw new Error('Release lookup returned an unsigned or invalid Linux manifest');
      }

      setAvailability({ state: 'available', version: manifest.version });
    } catch (error) {
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setAvailability({ state: 'error' });
    }
  }, []);

  const checkMacDesktopRelease = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++macDesktopRequestId.current;
    setMacDesktopAvailability({ state: 'loading' });

    try {
      const response = await fetch('/api/releases/latest/darwin-universal', {
        cache: 'no-store',
        signal,
      });

      if (currentRequest !== macDesktopRequestId.current) return;
      if (response.status === 404) {
        setMacDesktopAvailability({ state: 'empty' });
        return;
      }
      if (!response.ok) throw new Error(`Release lookup failed with status ${response.status}`);

      const manifest: unknown = await response.json();
      if (currentRequest !== macDesktopRequestId.current) return;
      if (!isSignedDesktopManifest(manifest, 'darwin-universal')) {
        throw new Error('Release lookup returned an unsigned or invalid macOS manifest');
      }

      setMacDesktopAvailability({ state: 'available', version: manifest.version });
    } catch (error) {
      if (signal?.aborted || currentRequest !== macDesktopRequestId.current) return;
      setMacDesktopAvailability({ state: 'error' });
    }
  }, []);

  const checkCloudRelease = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++cloudRequestId.current;
    setCloudAvailability({ state: 'loading' });

    try {
      const response = await fetch('/api/releases/desktop-cloud/latest', {
        cache: 'no-store',
        signal,
      });

      if (currentRequest !== cloudRequestId.current) return;
      if (response.status === 404) {
        setCloudAvailability({ state: 'empty' });
        return;
      }
      if (!response.ok) throw new Error(`Release lookup failed with status ${response.status}`);

      const manifest: unknown = await response.json();
      if (currentRequest !== cloudRequestId.current) return;
      if (!isCloudDesktopManifest(manifest)) {
        throw new Error('Release lookup returned an invalid cloud desktop manifest');
      }

      setCloudAvailability({
        state: 'available',
        version: manifest.version,
        architectures: manifest.architectures,
      });
    } catch (error) {
      if (signal?.aborted || currentRequest !== cloudRequestId.current) return;
      setCloudAvailability({ state: 'error' });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkRelease(controller.signal);
    void checkMacDesktopRelease(controller.signal);
    void checkCloudRelease(controller.signal);
    return () => controller.abort();
  }, [checkRelease, checkMacDesktopRelease, checkCloudRelease]);

  return (
    <Section id="desktop-downloads" labelledBy="desktop-downloads-title" rule>
      <Eyebrow>Desktop availability</Eyebrow>
      <h2 id="desktop-downloads-title" className="agi-ds-h2">
        Desktop installer availability
      </h2>
      <Prose>
        macOS gets two separate builds: the universal AGI Desktop app, and the AGI Cloud desktop app
        for cloud accounts only. Each is shown here only once the release API confirms its own
        signed build. Linux x64 package assets exist, but a download is offered only after the
        release API verifies the matching updater signature. Windows installers have not been
        published, and no release dates are available for them.
      </Prose>

      <ul className="agi-ds-ledger agi-ds-availability" aria-label="Desktop platforms">
        <li className="agi-ds-ledger-row">
          <span className="agi-ds-ledger-label">macOS · AGI Desktop</span>
          <span className="agi-ds-ledger-value">
            {macDesktopAvailability.state === 'loading' && (
              <span
                role="status"
                aria-label="Checking AGI Desktop macOS downloads"
                aria-live="polite"
                aria-busy="true"
              >
                Checking the release channel…
              </span>
            )}
            {macDesktopAvailability.state === 'available' && (
              <span className="agi-ds-availability-ready">
                <span className="agi-ds-muted">
                  Universal build · signed and notarized · version {macDesktopAvailability.version}
                </span>
                <a href="/api/download?platform=mac" className="agi-ds-btn" data-variant="primary">
                  Download AGI Desktop for macOS
                </a>
              </span>
            )}
            {macDesktopAvailability.state === 'empty' && (
              <span
                role="status"
                aria-label="AGI Desktop macOS downloads unavailable"
                aria-live="polite"
                className="agi-ds-availability-state"
              >
                No signed AGI Desktop macOS installer is available right now.
                <Alternatives />
              </span>
            )}
            {macDesktopAvailability.state === 'error' && (
              <span role="alert" className="agi-ds-availability-state">
                We could not verify the AGI Desktop macOS installer.
                <button
                  type="button"
                  className="agi-ds-btn"
                  data-variant="primary"
                  onClick={() => void checkMacDesktopRelease()}
                >
                  Retry release check
                </button>
                <Alternatives />
              </span>
            )}
          </span>
        </li>

        <li className="agi-ds-ledger-row">
          <span className="agi-ds-ledger-label">macOS · AGI Cloud</span>
          <span className="agi-ds-ledger-value">
            {cloudAvailability.state === 'loading' && (
              <span
                role="status"
                aria-label="Checking AGI Cloud macOS downloads"
                aria-live="polite"
                aria-busy="true"
              >
                Checking the release channel…
              </span>
            )}
            {cloudAvailability.state === 'available' && (
              <span className="agi-ds-availability-ready">
                <span className="agi-ds-muted">
                  Cloud accounts only · signed and notarized · version {cloudAvailability.version}
                </span>
                <span className="agi-ds-btn-row">
                  {cloudAvailability.architectures.arm64 && (
                    <a
                      href="/api/download?platform=mac&app=cloud&arch=arm64"
                      className="agi-ds-btn"
                      data-variant="primary"
                    >
                      Download for Apple silicon
                    </a>
                  )}
                  {cloudAvailability.architectures.x64 && (
                    <a
                      href="/api/download?platform=mac&app=cloud&arch=x64"
                      className="agi-ds-btn"
                      data-variant="secondary"
                    >
                      Download for Intel Mac
                    </a>
                  )}
                </span>
              </span>
            )}
            {cloudAvailability.state === 'empty' && (
              <span
                role="status"
                aria-label="AGI Cloud macOS downloads unavailable"
                aria-live="polite"
                className="agi-ds-availability-state"
              >
                No signed AGI Cloud installer is available right now.
                <Alternatives />
              </span>
            )}
            {cloudAvailability.state === 'error' && (
              <span role="alert" className="agi-ds-availability-state">
                We could not verify the AGI Cloud installer.
                <button
                  type="button"
                  className="agi-ds-btn"
                  data-variant="primary"
                  onClick={() => void checkCloudRelease()}
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

        <li className="agi-ds-ledger-row">
          <span className="agi-ds-ledger-label">Linux x64</span>
          <span className="agi-ds-ledger-value">
            {availability.state === 'loading' && (
              <span
                role="status"
                aria-label="Checking Desktop downloads"
                aria-live="polite"
                aria-busy="true"
              >
                Checking the signed release channel…
              </span>
            )}
            {availability.state === 'available' && (
              <span className="agi-ds-availability-ready">
                <span className="agi-ds-muted">
                  Signed AppImage · version {availability.version}
                </span>
                <a
                  href="/api/download?platform=linux"
                  className="agi-ds-btn"
                  data-variant="primary"
                >
                  Download Linux x64 AppImage
                </a>
              </span>
            )}
            {availability.state === 'empty' && (
              <span
                role="status"
                aria-label="Desktop downloads unavailable"
                aria-live="polite"
                className="agi-ds-availability-state"
              >
                No signed Linux installer is available right now.
                <Alternatives />
              </span>
            )}
            {availability.state === 'error' && (
              <span role="alert" className="agi-ds-availability-state">
                We could not verify the Linux installer.
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
      </ul>
    </Section>
  );
}
