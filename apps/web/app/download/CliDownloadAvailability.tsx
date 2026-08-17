'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

const PLATFORM_LABELS: Record<string, string> = {
  'darwin-arm64': 'macOS · Apple silicon',
  'darwin-x64': 'macOS · Intel',
  'linux-x64': 'Linux · x64',
  'linux-arm64': 'Linux · arm64',
  'windows-x64': 'Windows · x64',
  'windows-arm64': 'Windows · arm64',
};

interface CliDownload {
  platform: string;
  assetName: string;
  downloadUrl: string;
}

type CliAvailability =
  | { state: 'loading' }
  | { state: 'available'; version: string; downloads: CliDownload[] }
  | { state: 'empty' }
  | { state: 'error' };

function isTrustedReleaseUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      /^\/[^/]+\/[^/]+\/releases\/download\//.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function parseCliAvailability(
  value: unknown,
): { version: string; downloads: CliDownload[] } | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  const version = payload['version'];
  const rawDownloads = payload['downloads'];
  if (typeof version !== 'string' || version.trim() === '' || !Array.isArray(rawDownloads)) {
    return null;
  }

  const downloads: CliDownload[] = [];
  for (const entry of rawDownloads) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const platform = record['platform'];
    const assetName = record['assetName'];
    if (
      typeof platform !== 'string' ||
      !(platform in PLATFORM_LABELS) ||
      typeof assetName !== 'string' ||
      !isTrustedReleaseUrl(record['downloadUrl'])
    ) {
      continue;
    }
    downloads.push({ platform, assetName, downloadUrl: record['downloadUrl'] });
  }

  return downloads.length > 0 ? { version, downloads } : null;
}

export function CliDownloadAvailability() {
  const [availability, setAvailability] = useState<CliAvailability>({ state: 'loading' });
  const requestId = useRef(0);

  const checkRelease = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setAvailability({ state: 'loading' });

    try {
      const response = await fetch('/api/releases/cli/latest', { cache: 'no-store', signal });
      if (currentRequest !== requestId.current) return;
      if (response.status === 404) {
        setAvailability({ state: 'empty' });
        return;
      }
      if (!response.ok) throw new Error(`CLI release lookup failed with ${response.status}`);

      const parsed = parseCliAvailability(await response.json());
      if (currentRequest !== requestId.current) return;
      if (!parsed) throw new Error('CLI release lookup returned no verifiable archive');

      setAvailability({ state: 'available', version: parsed.version, downloads: parsed.downloads });
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
    <section id="cli-downloads" className="agi-fl-section" aria-labelledby="cli-downloads-title">
      <p className="agi-fl-eyebrow">CLI availability</p>
      <h2 id="cli-downloads-title" className="agi-fl-h2">
        CLI archive availability
      </h2>
      <p className="agi-fl-section-lede">
        The agi binary ships as platform archives on the CLI release channel. A download appears
        only for the platforms the release API confirms are published.
      </p>

      {availability.state === 'loading' && (
        <div
          role="status"
          aria-label="Checking CLI downloads"
          aria-live="polite"
          aria-busy="true"
          className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-card-foreground"
        >
          Checking the CLI release channel…
        </div>
      )}

      {availability.state === 'available' && (
        <div className="mt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            agi CLI · version {availability.version}
          </p>
          <ul className="grid list-none gap-3 p-0 md:grid-cols-3" aria-label="CLI archives">
            {availability.downloads.map((download) => (
              <li
                key={download.platform}
                className="rounded-2xl border border-border bg-card p-5 text-card-foreground"
              >
                <p className="text-sm font-semibold">
                  {PLATFORM_LABELS[download.platform] ?? download.platform}
                </p>
                <a
                  href={download.downloadUrl}
                  className="agi-fl-cta agi-fl-cta--secondary mt-4"
                  rel="noreferrer"
                >
                  Download {download.assetName}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {availability.state === 'empty' && (
        <div
          role="status"
          aria-label="CLI downloads unavailable"
          aria-live="polite"
          className="mt-6 rounded-xl border border-border bg-card p-4 text-card-foreground"
        >
          <p className="text-sm">No published CLI archive is available right now.</p>
          <Link href="/cli" className="agi-fl-cta agi-fl-cta--ghost mt-4">
            Read about the CLI
          </Link>
        </div>
      )}

      {availability.state === 'error' && (
        <div
          role="status"
          aria-label="CLI download check failed"
          aria-live="polite"
          className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-card-foreground"
        >
          <p className="text-sm">We could not verify the CLI archives.</p>
          <button
            type="button"
            className="agi-fl-cta agi-fl-cta--primary mt-4"
            onClick={() => void checkRelease()}
          >
            Retry release check
          </button>
        </div>
      )}
    </section>
  );
}
