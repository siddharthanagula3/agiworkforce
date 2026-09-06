const CENTS_PER_DOLLAR = 100;
const MONEY_FRACTION_DIGITS = 2;
const PERCENT_SCALE = 100;
const PERCENT_FRACTION_DIGITS = 1;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;
const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;
const DURATION_FRACTION_DIGITS = 0;
const UNIT_PRICE_MAX_FRACTION_DIGITS = 4;
const TOKENS_PER_THOUSAND = 1_000;
const TOKENS_PER_MILLION = 1_000_000;
const TOKEN_FRACTION_DIGITS = 2;

/** A value the source does not hold. Never use it for a state that is simply absent. */
export const NOT_RECORDED = 'not recorded';

/** A state that is genuinely absent, as opposed to a gap in the data. */
export const NONE = 'none';

/** A value the registry does not answer for. Never substitute a guess for it. */
export const UNKNOWN = 'Unknown';

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return NOT_RECORDED;
  return `$${(cents / CENTS_PER_DOLLAR).toLocaleString(undefined, {
    minimumFractionDigits: MONEY_FRACTION_DIGITS,
    maximumFractionDigits: MONEY_FRACTION_DIGITS,
  })}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_RECORDED;
  return value.toLocaleString();
}

export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return NOT_RECORDED;
  return `${(rate * PERCENT_SCALE).toFixed(PERCENT_FRACTION_DIGITS)}%`;
}

export function formatMultiplier(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_RECORDED;
  return `${value.toFixed(MONEY_FRACTION_DIGITS)}x`;
}

export function formatLatencyMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return NOT_RECORDED;
  return `${Math.round(ms).toLocaleString()} ms`;
}

export function formatWindowMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return NOT_RECORDED;
  if (ms >= MS_PER_HOUR) return `${(ms / MS_PER_HOUR).toFixed(DURATION_FRACTION_DIGITS)} h`;
  if (ms >= MS_PER_MINUTE) return `${(ms / MS_PER_MINUTE).toFixed(DURATION_FRACTION_DIGITS)} min`;
  return `${(ms / MS_PER_SECOND).toFixed(DURATION_FRACTION_DIGITS)} s`;
}

export function formatUnitPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: MONEY_FRACTION_DIGITS,
    maximumFractionDigits: UNIT_PRICE_MAX_FRACTION_DIGITS,
  })}`;
}

export function formatPercentPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return `${value.toFixed(PERCENT_FRACTION_DIGITS)}%`;
}

export function formatTokenCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  if (value >= TOKENS_PER_MILLION) {
    return `${(value / TOKENS_PER_MILLION).toLocaleString(undefined, {
      maximumFractionDigits: TOKEN_FRACTION_DIGITS,
    })}M`;
  }
  if (value >= TOKENS_PER_THOUSAND) {
    return `${(value / TOKENS_PER_THOUSAND).toLocaleString(undefined, {
      maximumFractionDigits: TOKEN_FRACTION_DIGITS,
    })}K`;
  }
  return value.toLocaleString();
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return NOT_RECORDED;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return NOT_RECORDED;
  return at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
