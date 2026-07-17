'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2Fchat';

type Availability =
  | { state: 'loading' }
  | { state: 'available'; version: string }
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
      <Link href={WEB_CHAT_ENTRY_HREF} className="agi-fl-cta agi-fl-cta--secondary">
        Use AGI Web
      </Link>
      <Link href="/cli" className="agi-fl-cta agi-fl-cta--ghost">
        See CLI availability
      </Link>
    </div>
  );
}

export function DesktopDownloadAvailability() {
  const [availability, setAvailability] = useState<Availability>({ state: 'loading' });
  const requestId = useRef(0);

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

  useEffect(() => {
    const controller = new AbortController();
    void checkRelease(controller.signal);
    return () => controller.abort();
  }, [checkRelease]);

  return (
    <section
      id="desktop-downloads"
      className="agi-fl-section"
      aria-labelledby="desktop-downloads-title"
    >
      <p className="agi-fl-eyebrow">Desktop availability</p>
      <h2 id="desktop-downloads-title" className="agi-fl-h2">
        Desktop installer availability
      </h2>
      <p className="agi-fl-section-lede">
        The stable release channel currently publishes a signed Linux x64 AppImage. macOS and
        Windows installers have not been published, and no release dates are available for them.
      </p>

      <ul className="mt-8 grid list-none gap-4 p-0 md:grid-cols-3" aria-label="Desktop platforms">
        <li className="rounded-2xl border border-border bg-card p-5 text-card-foreground">
          <p className="text-sm font-semibold">macOS</p>
          <p className="mt-2 text-sm text-muted-foreground">macOS installer not published</p>
        </li>
        <li className="rounded-2xl border border-border bg-card p-5 text-card-foreground">
          <p className="text-sm font-semibold">Windows</p>
          <p className="mt-2 text-sm text-muted-foreground">Windows installer not published</p>
        </li>
        <li className="rounded-2xl border border-border bg-card p-5 text-card-foreground">
          <p className="text-sm font-semibold">Linux x64</p>

          {availability.state === 'loading' && (
            <div
              role="status"
              aria-label="Checking Desktop downloads"
              aria-live="polite"
              aria-busy="true"
              className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-card-foreground"
            >
              Checking the signed release channel…
            </div>
          )}

          {availability.state === 'available' && (
            <div className="mt-3">
              <p className="mb-4 text-sm text-muted-foreground">
                Signed AppImage · version {availability.version}
              </p>
              <a
                href="/api/download?platform=linux"
                className="agi-fl-cta agi-fl-cta--primary"
              >
                Download Linux x64 AppImage
              </a>
            </div>
          )}

          {availability.state === 'empty' && (
            <div
              role="status"
              aria-label="Desktop downloads unavailable"
              aria-live="polite"
              className="mt-3 rounded-xl border border-border bg-card p-4 text-card-foreground"
            >
              <p className="text-sm">No signed Linux installer is available right now.</p>
              <Alternatives />
            </div>
          )}

          {availability.state === 'error' && (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-card-foreground"
            >
              <p className="text-sm">We could not verify the Linux installer.</p>
              <button
                type="button"
                className="agi-fl-cta agi-fl-cta--primary mt-4"
                onClick={() => void checkRelease()}
              >
                Retry release check
              </button>
              <Alternatives />
            </div>
          )}
        </li>
      </ul>
    </section>
  );
}
