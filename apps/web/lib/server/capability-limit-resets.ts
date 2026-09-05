import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getRollingUsage } from '@/lib/server/rolling-usage';
import type { CapabilityLimitResets } from '@/lib/services/capability-handshake-service';

export const ROLLING_SESSION_WINDOW_HOURS = 5;
export const ROLLING_WEEKLY_WINDOW_HOURS = 7 * 24;

export function rollingResetAt(oldestAt: string | null, windowHours: number): string | null {
  if (!oldestAt) return null;
  const oldestTimestamp = Date.parse(oldestAt);
  if (Number.isNaN(oldestTimestamp)) return null;
  return new Date(oldestTimestamp + windowHours * 60 * 60 * 1000).toISOString();
}

export function toIsoTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getCapabilityLimitResets(
  db: DatabaseAdapter,
  userId: string,
  billingPeriodEnd: string | Date | null | undefined,
): Promise<CapabilityLimitResets> {
  const [session, weekly] = await Promise.all([
    getRollingUsage(db, userId, ROLLING_SESSION_WINDOW_HOURS, false),
    getRollingUsage(db, userId, ROLLING_WEEKLY_WINDOW_HOURS, false),
  ]);
  return {
    billingPeriodEndsAt: toIsoTimestamp(billingPeriodEnd),
    rollingFiveHourResetsAt: rollingResetAt(session.oldestAt, ROLLING_SESSION_WINDOW_HOURS),
    rollingWeeklyResetsAt: rollingResetAt(weekly.oldestAt, ROLLING_WEEKLY_WINDOW_HOURS),
  };
}
