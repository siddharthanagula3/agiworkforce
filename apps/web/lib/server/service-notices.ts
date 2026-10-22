import 'server-only';

import { SERVICE_NOTICE_SCOPES } from '@agiworkforce/cloud-contracts';
import { PRODUCT_BRAND } from '@agiworkforce/types';
import { getOptionalEnv } from '@/shared/utils/env';
import { logger } from '@/lib/logger';
import { resolveRedisOutagePolicy } from '@/lib/redis-outage-policy';
import { getCachedHealthChecks, type HealthCheckResult } from '@/lib/server/health-check';
import { getKeyValueStore } from '@/lib/server/key-value';
import {
  isMaintenanceUnderway,
  parseMaintenanceWindow,
  type MaintenanceWindow,
} from '@/lib/service-notices/maintenance-window';
import type { ServiceNotice, ServiceNoticeScope } from '@/lib/service-notices/types';

const ANNOUNCE_AHEAD_MS = 72 * 60 * 60 * 1000;
const HEALTH_READ_TIMEOUT_MS = 3_000;
const RECOVERY_MONITORING_SECONDS = 60 * 60;
const RECENT_INCIDENT_KEY_PREFIX = 'agi-service-notice:last-failing';

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
  const underway = isMaintenanceUnderway(window, now);
  return {
    id: `maintenance:${window.startsAt.toISOString()}`,
    kind: 'maintenance',
    tone: underway ? 'warning' : 'info',
    scope: 'product',
    message: underway
      ? `Planned maintenance is under way until ${formatInstant(window.endsAt)}. New chats are paused, and chats already open may be interrupted.`
      : `Planned maintenance from ${formatInstant(window.startsAt)} to ${formatInstant(window.endsAt)}. New chats will be paused while it runs, and open chats may be interrupted.`,
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

const INCIDENT_MESSAGE: Record<ServiceNoticeScope, string> = {
  product: `${PRODUCT_BRAND} is having a problem right now, and some requests may fail. We are working on it.`,
  billing:
    'Billing is having a problem right now, so upgrades and billing changes may not go through. We are working on it.',
};

const INCIDENT_TONE: Record<ServiceNoticeScope, ServiceNotice['tone']> = {
  product: 'danger',
  billing: 'warning',
};

const RESTORED_MESSAGE: Record<ServiceNoticeScope, string> = {
  product: `${PRODUCT_BRAND} is working again after a problem. We are monitoring it and have not called it fully recovered yet.`,
  billing:
    'Billing is working again after a problem. We are monitoring it and have not called it fully recovered yet.',
};

export interface IncidentRecovery {
  scope: ServiceNoticeScope;
  lastFailingAt: Date;
}

interface LastFailing {
  atMs: number;
}

function blockedScopes(health: HealthCheckResult): ReadonlySet<ServiceNoticeScope> {
  const blocked = new Set<ServiceNoticeScope>();
  if (chatBlocked(health)) blocked.add('product');
  if (billingBlocked(health)) blocked.add('billing');
  return blocked;
}

function recentIncidentKey(scope: ServiceNoticeScope): string {
  return `${RECENT_INCIDENT_KEY_PREFIX}:${scope}`;
}

async function trackRecoveries(
  blocked: ReadonlySet<ServiceNoticeScope>,
  now: Date,
): Promise<IncidentRecovery[]> {
  try {
    const store = getKeyValueStore();
    if (!store) return [];
    const tracked = await Promise.all(
      SERVICE_NOTICE_SCOPES.map(async (scope): Promise<IncidentRecovery | null> => {
        if (blocked.has(scope)) {
          await store.set(recentIncidentKey(scope), { atMs: now.getTime() } satisfies LastFailing, {
            ttlSeconds: RECOVERY_MONITORING_SECONDS,
          });
          return null;
        }
        const last = await store.get<LastFailing>(recentIncidentKey(scope));
        return typeof last?.atMs === 'number' && Number.isFinite(last.atMs)
          ? { scope, lastFailingAt: new Date(last.atMs) }
          : null;
      }),
    );
    return tracked.filter((recovery): recovery is IncidentRecovery => recovery !== null);
  } catch (error) {
    logger.warn({ error }, 'Service incident recovery state could not be read or written');
    return [];
  }
}

function incidentNotice(scope: ServiceNoticeScope): ServiceNotice {
  return {
    id: `incident:${scope}`,
    kind: 'incident',
    tone: INCIDENT_TONE[scope],
    scope,
    message: INCIDENT_MESSAGE[scope],
    href: '/status',
    linkLabel: 'Status',
  };
}

function restoredNotice({ scope }: IncidentRecovery): ServiceNotice {
  return {
    id: `restored:${scope}`,
    kind: 'incident',
    tone: 'warning',
    scope,
    message: RESTORED_MESSAGE[scope],
    href: '/status',
    linkLabel: 'Status',
  };
}

async function readHealth(): Promise<HealthCheckResult | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), HEALTH_READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([getCachedHealthChecks(), timeout]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readIncidentNotices(now: Date): Promise<ServiceNotice[]> {
  const health = await readHealth();
  if (!health) return [];
  const blocked = blockedScopes(health);
  const recoveries = await trackRecoveries(blocked, now);
  return [
    ...SERVICE_NOTICE_SCOPES.filter((scope) => blocked.has(scope)).map(incidentNotice),
    ...recoveries.map(restoredNotice),
  ];
}

export async function readIncidentRecoveries(now: Date = new Date()): Promise<IncidentRecovery[]> {
  const health = await readHealth();
  return health ? trackRecoveries(blockedScopes(health), now) : [];
}

function readMaintenanceWindow(): MaintenanceWindow | null {
  return parseMaintenanceWindow(getOptionalEnv('AGI_MAINTENANCE_WINDOW'));
}

export function maintenanceUnderway(now: Date = new Date()): MaintenanceWindow | null {
  const window = readMaintenanceWindow();
  return window && isMaintenanceUnderway(window, now) ? window : null;
}

export function formatMaintenanceEnd(window: MaintenanceWindow): string {
  return formatInstant(window.endsAt);
}

export async function readServiceNotices(now: Date = new Date()): Promise<ServiceNotice[]> {
  const window = readMaintenanceWindow();
  const maintenance = window ? maintenanceNotice(window, now) : null;
  const incidents = await readIncidentNotices(now);
  return maintenance ? [...incidents, maintenance] : incidents;
}
