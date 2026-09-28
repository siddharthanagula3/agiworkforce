'use client';

import { useEffect, useState } from 'react';
import type { DevicePresence } from '@agiworkforce/cloud-contracts';
import { codeDeepLink } from '../lib/deep-links';
import { useDesktopHost } from '../lib/host';

const DEVICES_PATH = '/api/settings/devices';
const DESKTOP_SHELL = 'electron';
const UNNAMED_DESKTOP = 'Your desktop';

const PRESENCE_RANK: Readonly<Record<DevicePresence, number>> = {
  online: 0,
  sleeping: 1,
  offline: 2,
};

const PRESENCE_COPY: Readonly<Record<DevicePresence, string>> = {
  online: 'is online',
  sleeping: 'is asleep and wakes when AGI Cloud opens',
  offline: 'is offline; open AGI Cloud on it first',
};

interface ListedDesktop {
  kind: string;
  name: string | null;
  shell: string | null;
  presence: DevicePresence | null;
  lastSeenAt: string | null;
}

export type PairedDesktop =
  | { kind: 'in-desktop' }
  | { kind: 'no-desktop' }
  | { kind: 'desktop'; href: string; presence: DevicePresence; status: string };

function seenAt(device: ListedDesktop): number {
  const parsed = device.lastSeenAt ? Date.parse(device.lastSeenAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickDesktop(devices: unknown): ListedDesktop | null {
  if (!Array.isArray(devices)) return null;
  const desktops = (devices as ListedDesktop[]).filter(
    (device) => device.kind === 'desktop' && device.shell === DESKTOP_SHELL,
  );
  desktops.sort(
    (a, b) =>
      PRESENCE_RANK[a.presence ?? 'offline'] - PRESENCE_RANK[b.presence ?? 'offline'] ||
      seenAt(b) - seenAt(a),
  );
  return desktops[0] ?? null;
}

export function usePairedDesktop(sessionId?: string): PairedDesktop {
  const host = useDesktopHost();
  const [desktop, setDesktop] = useState<ListedDesktop | null>(null);

  useEffect(() => {
    if (host) return undefined;
    let live = true;
    fetch(DEVICES_PATH, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { devices?: unknown } | null) => {
        if (live) setDesktop(pickDesktop(body?.devices));
      })
      .catch(() => {
        if (live) setDesktop(null);
      });
    return () => {
      live = false;
    };
  }, [host]);

  if (host) return { kind: 'in-desktop' };
  if (!desktop) return { kind: 'no-desktop' };
  const presence = desktop.presence ?? 'offline';
  return {
    kind: 'desktop',
    href: codeDeepLink(sessionId),
    presence,
    status: `${desktop.name?.trim() || UNNAMED_DESKTOP} ${PRESENCE_COPY[presence]}`,
  };
}
