'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const CLI_PLATFORM_LABELS: Record<string, string> = {
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

export type CliAvailability =
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
      !(platform in CLI_PLATFORM_LABELS) ||
      typeof assetName !== 'string' ||
      !isTrustedReleaseUrl(record['downloadUrl'])
    ) {
      continue;
    }
    downloads.push({ platform, assetName, downloadUrl: record['downloadUrl'] });
  }

  return downloads.length > 0 ? { version, downloads } : null;
}

export function useCliRelease(): { availability: CliAvailability; retry: () => void } {
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

  return { availability, retry: () => void checkRelease() };
}
