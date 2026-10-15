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

export function macDownloadHref(architecture: MacArchitecture): string {
  return `/api/download?platform=mac&arch=${architecture}`;
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
      ? MAC_ARCHITECTURES.filter((architecture) => availability.architectures[architecture])
      : [];
  const recommended =
    detected !== 'unknown' && offered.includes(detected) ? detected : (offered[0] ?? null);

  return {
    availability,
    offered,
    checksums: checksums.filter(
      (checksum) => checksum.architecture === null || offered.includes(checksum.architecture),
    ),
    detected,
    recommended,
    retry: () => void checkRelease(),
  };
}
