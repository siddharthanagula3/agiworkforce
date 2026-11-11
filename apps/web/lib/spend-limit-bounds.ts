import { creditsFromCents } from '@agiworkforce/types';

export const MAX_MONTHLY_CAP_CENTS = 100_000_000;
export const MIN_MONTHLY_CAP_CREDITS = 1;
export const MAX_MONTHLY_CAP_CREDITS = creditsFromCents(MAX_MONTHLY_CAP_CENTS);
export const MIN_ALERT_THRESHOLD_PCT = 1;
export const MAX_ALERT_THRESHOLD_PCT = 100;

export function isValidMonthlyCapCredits(value: number): boolean {
  return (
    Number.isInteger(value) && value >= MIN_MONTHLY_CAP_CREDITS && value <= MAX_MONTHLY_CAP_CREDITS
  );
}

export function isValidAlertThresholdPct(value: number): boolean {
  return (
    Number.isInteger(value) && value >= MIN_ALERT_THRESHOLD_PCT && value <= MAX_ALERT_THRESHOLD_PCT
  );
}
