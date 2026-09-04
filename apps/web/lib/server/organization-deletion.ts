import 'server-only';

/**
 * How long an owner has to cancel a requested workspace decommission before
 * `GET /api/cron/purge-deleted-organizations` erases it. Same shape as the
 * account-deletion grace window (`apps/web/app/api/user/delete-account`), sized
 * longer because a workspace deletion can strand every other member, not just
 * the requester.
 */
export const ORGANIZATION_DELETION_COOLING_PERIOD_DAYS = 14;

export const ORGANIZATION_DELETION_COOLING_PERIOD_MS =
  ORGANIZATION_DELETION_COOLING_PERIOD_DAYS * 24 * 60 * 60 * 1000;

export const ORGANIZATION_DELETION_COOLING_PERIOD_LABEL = `${ORGANIZATION_DELETION_COOLING_PERIOD_DAYS} days`;

export function organizationDeletionScheduledFor(from: Date = new Date()): Date {
  return new Date(from.getTime() + ORGANIZATION_DELETION_COOLING_PERIOD_MS);
}

const PG_UNDEFINED_COLUMN = '42703';

export function isMissingOrganizationDeletionColumns(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)['code'] === PG_UNDEFINED_COLUMN;
}
