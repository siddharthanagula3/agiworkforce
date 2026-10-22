import 'server-only';

import { getOptionalEnv } from '@/shared/utils/env';
import { resolveRedisOutagePolicy } from '@/lib/redis-outage-policy';
import { getCachedHealthChecks, type HealthCheckResult } from '@/lib/server/health-check';
import {
  parseMaintenanceWindow,
  type MaintenanceWindow,
} from '@/lib/service-notices/maintenance-window';
import type { ServiceNotice } from '@/lib/service-notices/types';

const ANNOUNCE_AHEAD_MS = 72 * 60 * 60 * 1000;
const HEALTH_READ_TIMEOUT_MS = 3_000;

const CHAT_BLOCKING_CHECKS = ['database', 'chat', 'identity'] as const;

const CHAT_BLOCKING_CONFIGURATION = ['identity'] as const;

const BILLING_DEPENDENCY = 'billing';

function formatInstant(at: Date): string {
  return at.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
    scope: 'product',
    message: underway
      ? `Planned maintenance is under way until ${formatInstant(window.endsAt)}. Some features may not respond until it ends.`
      : `Planned maintenance from ${formatInstant(window.startsAt)} to ${formatInstant(window.endsAt)}. Some features may not respond while it runs.`,
    href: '/maintenance',
    linkLabel: 'Details',
  };
}

function sharedStoreRefusesTurns(health: HealthCheckResult, unready: ReadonlySet<string>): boolean {
  const storeDown = health.checks.cache.status === 'unhealthy' || unready.has('key_value');
  return storeDown && resolveRedisOutagePolicy() === 'fail-closed';
}

function chatBlocked(health: HealthCheckResult): boolean {
  const unready = new Set(
    (health.checks.environment.unreadyDependencies ?? []).map((dependency) => dependency.id),
  );
  return (
    CHAT_BLOCKING_CHECKS.some((name) => health.checks[name].status === 'unhealthy') ||
    CHAT_BLOCKING_CONFIGURATION.some((id) => unready.has(id)) ||
    sharedStoreRefusesTurns(health, unready)
  );
}

function billingBlocked(health: HealthCheckResult): boolean {
  const billing = health.dependencies?.find((dependency) => dependency.id === BILLING_DEPENDENCY);
  return billing?.observation === 'failing' && health.checks.stripe.blocksBilling === true;
}

function incidentNotices(health: HealthCheckResult): ServiceNotice[] {
  const notices: ServiceNotice[] = [];
  if (chatBlocked(health)) {
    notices.push({
      id: 'incident:product',
      kind: 'incident',
      tone: 'danger',
      scope: 'product',
      message:
        'AGI is having a problem right now, and some requests may fail. We are working on it.',
      href: '/status',
      linkLabel: 'Status',
    });
  }
  if (billingBlocked(health)) {
    notices.push({
      id: 'incident:billing',
      kind: 'incident',
      tone: 'warning',
      scope: 'billing',
      message:
        'Billing is having a problem right now, so upgrades and billing changes may not go through. We are working on it.',
      href: '/status',
      linkLabel: 'Status',
    });
  }
  return notices;
}

async function readIncidentNotices(): Promise<ServiceNotice[]> {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), HEALTH_READ_TIMEOUT_MS);
  });
  const health = await Promise.race([getCachedHealthChecks(), timeout]).catch(() => null);
  return health ? incidentNotices(health) : [];
}

export async function readServiceNotices(now: Date = new Date()): Promise<ServiceNotice[]> {
  const window = parseMaintenanceWindow(getOptionalEnv('AGI_MAINTENANCE_WINDOW'));
  const maintenance = window ? maintenanceNotice(window, now) : null;
  const incidents = await readIncidentNotices();
  return maintenance ? [...incidents, maintenance] : incidents;
}
