const MONTHLY_SUBSCRIPTION_MAX_DURATION_MS = 45 * 24 * 60 * 60 * 1_000;

export interface ManagedUsagePeriod {
  periodStart: Date;
  periodEnd: Date;
}

function addCalendarMonths(anchor: Date, months: number): Date {
  const targetMonth = anchor.getUTCMonth() + months;
  const targetYear = anchor.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(anchor.getUTCDate(), lastDayOfTargetMonth),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

export function resolveManagedUsagePeriod(input: {
  subscriptionPeriodStart: Date;
  subscriptionPeriodEnd: Date;
  referenceAt?: Date;
}): ManagedUsagePeriod {
  const subscriptionStartMs = input.subscriptionPeriodStart.getTime();
  const subscriptionEndMs = input.subscriptionPeriodEnd.getTime();
  const referenceAt = input.referenceAt ?? new Date();
  const referenceMs = referenceAt.getTime();

  if (
    !Number.isFinite(subscriptionStartMs) ||
    !Number.isFinite(subscriptionEndMs) ||
    !Number.isFinite(referenceMs) ||
    subscriptionEndMs <= subscriptionStartMs
  ) {
    throw new Error('Invalid managed usage subscription period');
  }

  if (subscriptionEndMs - subscriptionStartMs <= MONTHLY_SUBSCRIPTION_MAX_DURATION_MS) {
    return {
      periodStart: new Date(subscriptionStartMs),
      periodEnd: new Date(subscriptionEndMs),
    };
  }

  const boundedReferenceMs = Math.min(
    Math.max(referenceMs, subscriptionStartMs),
    subscriptionEndMs - 1,
  );
  const calendarMonthSpan =
    (input.subscriptionPeriodEnd.getUTCFullYear() -
      input.subscriptionPeriodStart.getUTCFullYear()) *
      12 +
    input.subscriptionPeriodEnd.getUTCMonth() -
    input.subscriptionPeriodStart.getUTCMonth();

  let periodStart = new Date(subscriptionStartMs);
  for (let offset = 1; offset <= calendarMonthSpan + 1; offset += 1) {
    const anchoredBoundary = addCalendarMonths(input.subscriptionPeriodStart, offset);
    const periodEnd = new Date(Math.min(anchoredBoundary.getTime(), subscriptionEndMs));

    if (boundedReferenceMs < periodEnd.getTime()) {
      return { periodStart, periodEnd };
    }
    periodStart = periodEnd;
  }

  throw new Error('Unable to resolve managed usage period');
}
