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

function isSignedLinuxManifest(value: unknown): value is {
  version: string;
  platforms: { 'linux-x86_64': { url: string; signature: string } };
} {
  if (!value || typeof value !== 'object') return false;

  const manifest = value as Record<string, unknown>;
  if (typeof manifest['version'] !== 'string' || manifest['version'].trim() === '') return false;
  if (!manifest['platforms'] || typeof manifest['platforms'] !== 'object') return false;

  const linux = (manifest['platforms'] as Record<string, unknown>)['linux-x86_64'];
  if (!linux || typeof linux !== 'object') return false;

  const asset = linux as Record<string, unknown>;
  return (
    typeof asset['url'] === 'string' &&
    asset['url'].trim() !== '' &&
    typeof asset['signature'] === 'string' &&
    asset['signature'].trim() !== ''
  );
}

function Alternatives() {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <Link href={WEB_CHAT_ENTRY_HREF} className="agi-ds-btn" data-variant="secondary">
        Use AGI Web
      </Link>
      <Link href="/cli" className="agi-ds-btn" data-variant="secondary">
        See CLI availability
      </Link>
    </div>
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
  const [cloudAvailability, setCloudAvailability] = useState<CloudAvailability>({
    state: 'loading',
  });
  const requestId = useRef(0);
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
      if (!isSignedLinuxManifest(manifest)) {
        throw new Error('Release lookup returned an unsigned or invalid Linux manifest');
      }

      setAvailability({ state: 'available', version: manifest.version });
    } catch (error) {
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setAvailability({ state: 'error' });
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
    void checkCloudRelease(controller.signal);
    return () => controller.abort();
  }, [checkRelease, checkCloudRelease]);

  return (
    <Section id="desktop-downloads" labelledBy="desktop-downloads-title" rule>
      <Eyebrow>Desktop availability</Eyebrow>
      <h2 id="desktop-downloads-title" className="agi-ds-h2">
        Desktop installer availability
      </h2>
      <Prose>
        macOS gets the AGI Cloud desktop app (cloud accounts only) when a signed build is published.
        Linux x64 package assets exist, but a download is offered only after the release API
        verifies the matching updater signature. Windows installers have not been published, and no
        release dates are available for them.
      </Prose>

      <ul className="mt-8 grid list-none gap-4 p-0 md:grid-cols-3" aria-label="Desktop platforms">
        <li className="agi-ds-card p-5">
          <p className="text-sm font-semibold">macOS</p>

          {cloudAvailability.state === 'loading' && (
            <div
              role="status"
              aria-label="Checking macOS downloads"
              aria-live="polite"
              aria-busy="true"
              className="agi-ds-card mt-3 p-4 text-sm"
            >
              Checking the release channel…
            </div>
          )}

          {cloudAvailability.state === 'available' && (
            <div className="mt-3">
              <p className="mb-4 text-sm agi-ds-muted">
                AGI Cloud (cloud accounts only) · signed and notarized · version{' '}
                {cloudAvailability.version}
              </p>
              <div className="flex flex-wrap gap-3">
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
              </div>
            </div>
          )}

          {cloudAvailability.state === 'empty' && (
            <div
              role="status"
              aria-label="macOS downloads unavailable"
              aria-live="polite"
              className="agi-ds-card mt-3 p-4"
            >
              <p className="text-sm">No signed macOS installer is available right now.</p>
              <Alternatives />
            </div>
          )}

          {cloudAvailability.state === 'error' && (
            <div role="alert" className="agi-ds-card mt-3 p-4" data-tone="danger">
              <p className="text-sm">We could not verify the macOS installer.</p>
              <button
                type="button"
                className="agi-ds-btn mt-4"
                data-variant="primary"
                onClick={() => void checkCloudRelease()}
              >
                Retry release check
              </button>
              <Alternatives />
            </div>
          )}
        </li>
        <li className="agi-ds-card p-5">
          <p className="text-sm font-semibold">Windows</p>

          <div
            role="status"
            aria-label="Windows downloads unavailable"
            aria-live="polite"
            className="agi-ds-card mt-3 p-4"
          >
            <p className="text-sm">Windows installer not published.</p>
            <Alternatives />
          </div>
        </li>
        <li className="agi-ds-card p-5">
          <p className="text-sm font-semibold">Linux x64</p>

          {availability.state === 'loading' && (
            <div
              role="status"
              aria-label="Checking Desktop downloads"
              aria-live="polite"
              aria-busy="true"
              className="agi-ds-card mt-3 p-4 text-sm"
            >
              Checking the signed release channel…
            </div>
          )}

          {availability.state === 'available' && (
            <div className="mt-3">
              <p className="mb-4 text-sm agi-ds-muted">
                Signed AppImage · version {availability.version}
              </p>
              <a href="/api/download?platform=linux" className="agi-ds-btn" data-variant="primary">
                Download Linux x64 AppImage
              </a>
            </div>
          )}

          {availability.state === 'empty' && (
            <div
              role="status"
              aria-label="Desktop downloads unavailable"
              aria-live="polite"
              className="agi-ds-card mt-3 p-4"
            >
              <p className="text-sm">No signed Linux installer is available right now.</p>
              <Alternatives />
            </div>
          )}

          {availability.state === 'error' && (
            <div role="alert" className="agi-ds-card mt-3 p-4" data-tone="danger">
              <p className="text-sm">We could not verify the Linux installer.</p>
              <button
                type="button"
                className="agi-ds-btn mt-4"
                data-variant="primary"
                onClick={() => void checkRelease()}
              >
                Retry release check
              </button>
              <Alternatives />
            </div>
          )}
        </li>
      </ul>
    </Section>
  );
}
