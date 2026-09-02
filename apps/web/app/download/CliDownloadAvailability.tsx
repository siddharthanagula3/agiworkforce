'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eyebrow, Prose, Section } from '@/features/marketing/components/system';

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
    <Section id="cli-downloads" labelledBy="cli-downloads-title" rule>
      <Eyebrow>CLI availability</Eyebrow>
      <h2 id="cli-downloads-title" className="agi-ds-h2">
        CLI archive availability
      </h2>
      <Prose>
        The agi binary ships as platform archives on the CLI release channel. A download appears
        only for the platforms the release API confirms are published.
      </Prose>

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
                  className="agi-ds-btn mt-4"
                  data-variant="primary"
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
          <Link href="/cli" className="agi-ds-btn mt-4" data-variant="secondary">
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
            className="agi-ds-btn mt-4"
            data-variant="primary"
            onClick={() => void checkRelease()}
          >
            Retry release check
          </button>
        </div>
      )}
    </Section>
  );
}
