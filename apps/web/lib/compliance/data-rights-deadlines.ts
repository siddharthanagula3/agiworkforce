export const DATA_RIGHTS_JURISDICTIONS = ['gdpr', 'us_state'] as const;

export type DataRightsJurisdiction = (typeof DATA_RIGHTS_JURISDICTIONS)[number];

// One calendar month is never longer than forty-five days, so a request that
// names no jurisdiction is worked to the tighter of the two rather than to the
// one that happens to suit the queue.
export const DEFAULT_DATA_RIGHTS_JURISDICTION: DataRightsJurisdiction = 'gdpr';

export function isDataRightsJurisdiction(value: unknown): value is DataRightsJurisdiction {
  return (
    typeof value === 'string' && (DATA_RIGHTS_JURISDICTIONS as readonly string[]).includes(value)
  );
}

export interface DataRightsDeadline {
  readonly jurisdiction: DataRightsJurisdiction;
  readonly dueAt: string;
  readonly extendable: boolean;
  readonly extendedDueAt: string;
  readonly daysRemaining: number;
  readonly overdue: boolean;
}

export interface DataRightsDeadlineInput {
  readonly createdAt: string | Date;
  readonly jurisdiction?: DataRightsJurisdiction | string | null;
  readonly now?: Date;
}

const MS_PER_DAY = 86_400_000;
const US_STATE_RESPONSE_DAYS = 45;
const GDPR_RESPONSE_MONTHS = 1;
const GDPR_EXTENSION_MONTHS = 2;

function addMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();
  const lastDayOfTarget = new Date(Date.UTC(year, month + months + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month + months,
      Math.min(day, lastDayOfTarget),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

export function resolveDataRightsDeadline(input: DataRightsDeadlineInput): DataRightsDeadline {
  const receivedAt = input.createdAt instanceof Date ? input.createdAt : new Date(input.createdAt);
  if (Number.isNaN(receivedAt.getTime())) {
    throw new Error('A data rights request has no readable receipt time');
  }

  const jurisdiction = isDataRightsJurisdiction(input.jurisdiction)
    ? input.jurisdiction
    : DEFAULT_DATA_RIGHTS_JURISDICTION;

  const due =
    jurisdiction === 'gdpr'
      ? addMonths(receivedAt, GDPR_RESPONSE_MONTHS)
      : addDays(receivedAt, US_STATE_RESPONSE_DAYS);

  const extended =
    jurisdiction === 'gdpr'
      ? addMonths(receivedAt, GDPR_RESPONSE_MONTHS + GDPR_EXTENSION_MONTHS)
      : addDays(receivedAt, US_STATE_RESPONSE_DAYS * 2);

  const now = input.now ?? new Date();
  const remaining = Math.ceil((due.getTime() - now.getTime()) / MS_PER_DAY);

  return {
    jurisdiction,
    dueAt: due.toISOString(),
    extendable: true,
    extendedDueAt: extended.toISOString(),
    daysRemaining: remaining === 0 ? 0 : remaining,
    overdue: now.getTime() > due.getTime(),
  };
}

export function compareByDeadline(
  left: { readonly dueAt: string; readonly createdAt: string },
  right: { readonly dueAt: string; readonly createdAt: string },
): number {
  const byDue = Date.parse(left.dueAt) - Date.parse(right.dueAt);
  return byDue !== 0 ? byDue : Date.parse(left.createdAt) - Date.parse(right.createdAt);
}
