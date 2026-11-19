'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  detectMacArchitecture,
  type DetectedArchitecture,
  type MacArchitecture,
} from './detect-architecture';

type Architectures = Record<MacArchitecture, boolean>;

type DesktopAvailability =
  | { state: 'loading' }
  | { state: 'available'; version: string; architectures: Architectures }
  | { state: 'empty' }
  | { state: 'error' };

interface InstallerChecksum {
  name: string;
  architecture: MacArchitecture | null;
  sha256: string;
}

const MAC_ARCHITECTURES: readonly MacArchitecture[] = ['arm64', 'x64'];

export const ARCHITECTURE_LABELS: Record<MacArchitecture, string> = {
  arm64: 'Apple silicon',
  x64: 'Intel Mac',
};

export function macDownloadHref(architecture: MacArchitecture, version: string): string {
  return `/api/download?platform=mac&arch=${architecture}&version=${encodeURIComponent(version)}`;
}

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

interface PublishedChecksums {
  version: string;
  installers: InstallerChecksum[];
}

function parseChecksums(value: unknown): PublishedChecksums | null {
  if (!value || typeof value !== 'object') return null;
  const version = (value as Record<string, unknown>)['version'];
  const installers = (value as Record<string, unknown>)['installers'];
  if (typeof version !== 'string' || version.trim() === '' || !Array.isArray(installers)) {
    return null;
  }
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
  return { version, installers: parsed };
}

interface DesktopRelease {
  availability: DesktopAvailability;
  offered: MacArchitecture[];
  checksums: InstallerChecksum[];
  detected: DetectedArchitecture;
  recommended: MacArchitecture | null;
  retry: () => void;
}

export function useDesktopRelease(): DesktopRelease {
  const [availability, setAvailability] = useState<DesktopAvailability>({ state: 'loading' });
  const [published, setPublished] = useState<PublishedChecksums | null>(null);
  const [detected, setDetected] = useState<DetectedArchitecture>('unknown');
  const requestId = useRef(0);
  const checksumRequestId = useRef(0);

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
    const currentRequest = ++checksumRequestId.current;
    try {
      const response = await fetch('/api/download/checksums', { cache: 'no-store', signal });
      const parsed = response.ok ? parseChecksums(await response.json()) : null;
      if (currentRequest === checksumRequestId.current) setPublished(parsed);
    } catch {
      if (!signal?.aborted && currentRequest === checksumRequestId.current) setPublished(null);
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

  const retry = useCallback(() => {
    void checkRelease();
    void checkChecksums();
  }, [checkRelease, checkChecksums]);

  const offered =
    availability.state === 'available'
      ? MAC_ARCHITECTURES.filter((architecture) => availability.architectures[architecture])
      : [];
  const recommended =
    detected !== 'unknown' && offered.includes(detected) ? detected : (offered[0] ?? null);

  return {
    availability,
    offered,
    checksums:
      availability.state === 'available' && published?.version === availability.version
        ? published.installers.filter(
            (checksum) => checksum.architecture === null || offered.includes(checksum.architecture),
          )
        : [],
    detected,
    recommended,
    retry,
  };
}
