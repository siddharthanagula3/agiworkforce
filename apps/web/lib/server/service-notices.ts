import 'server-only';

import { getOptionalEnv } from '@/shared/utils/env';
import { getCachedHealthChecks } from '@/lib/server/health-check';
import {
  parseMaintenanceWindow,
  type MaintenanceWindow,
} from '@/lib/service-notices/maintenance-window';
import type { ServiceNotice } from '@/lib/service-notices/types';

const ANNOUNCE_AHEAD_MS = 72 * 60 * 60 * 1000;
const HEALTH_READ_TIMEOUT_MS = 3_000;

function formatInstant(at: Date): string {
  return at.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function maintenanceNotice(window: MaintenanceWindow, now: Date): ServiceNotice | null {
  const nowMs = now.getTime();
  if (nowMs >= window.endsAt.getTime()) return null;
  if (window.startsAt.getTime() - nowMs > ANNOUNCE_AHEAD_MS) return null;
  const underway = nowMs >= window.startsAt.getTime();
  return {
    id: `maintenance:${window.startsAt.toISOString()}`,
    kind: 'maintenance',
    tone: underway ? 'warning' : 'info',
    message: underway
      ? `Planned maintenance is under way until ${formatInstant(window.endsAt)}. Some features may not respond until it ends.`
      : `Planned maintenance from ${formatInstant(window.startsAt)} to ${formatInstant(window.endsAt)}. Some features may not respond while it runs.`,
    href: '/maintenance',
    linkLabel: 'Details',
  };
}

async function incidentNotice(): Promise<ServiceNotice | null> {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), HEALTH_READ_TIMEOUT_MS);
  });
  const health = await Promise.race([getCachedHealthChecks(), timeout]).catch(() => null);
  if (health?.status !== 'unhealthy') return null;
  return {
    id: `incident:${health.timestamp}`,
    kind: 'incident',
    tone: 'danger',
    message:
      'AGI Workforce is having a problem right now, and some requests may fail. We are working on it.',
    href: '/status',
    linkLabel: 'Status',
  };
}

export async function readServiceNotices(now: Date = new Date()): Promise<ServiceNotice[]> {
  const window = parseMaintenanceWindow(getOptionalEnv('AGI_MAINTENANCE_WINDOW'));
  const notices = await Promise.all([
    incidentNotice(),
    Promise.resolve(window ? maintenanceNotice(window, now) : null),
  ]);
  return notices.filter((notice): notice is ServiceNotice => notice !== null);
}
