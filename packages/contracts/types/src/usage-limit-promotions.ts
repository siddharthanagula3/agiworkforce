import { usageWorkloadLabel } from './billing-catalog';

export const USAGE_LIMIT_PROMOTION_KINDS = ['limit_reset', 'limit_uplift'] as const;
export type UsageLimitPromotionKind = (typeof USAGE_LIMIT_PROMOTION_KINDS)[number];

export const USAGE_LIMIT_RESET_SOURCES = ['promotion', 'referral'] as const;
export type UsageLimitResetSource = (typeof USAGE_LIMIT_RESET_SOURCES)[number];

export const USAGE_LIMIT_UPLIFT_WINDOWS = ['session', 'weekly'] as const;
export type UsageLimitUpliftWindow = (typeof USAGE_LIMIT_UPLIFT_WINDOWS)[number];

export interface UsageLimitResetOffer {
  grant_id: string;
  expires_at: string;
}

export interface UsageLimitResetState {
  available: number;
  grants: UsageLimitResetOffer[];
  /** Whether a reset can be used now: one is held and a limit is at or near its threshold. */
  can_apply: boolean;
  last_applied_at: string | null;
}

export interface UsageLimitUpliftOffer {
  promotion_id: string;
  percent: number;
  windows: UsageLimitUpliftWindow[];
  /** Empty means every workload. */
  workloads: string[];
  ends_at: string;
}

export interface UsageLimitPromotionState {
  resets: UsageLimitResetState;
  uplifts: UsageLimitUpliftOffer[];
}

export interface UsageLimitResetRequest {
  /** The reset to use; null uses the one that expires soonest. */
  grantId: string | null;
}

export interface UsageLimitResetResponse {
  status: 'applied' | 'already_applied';
  grant_id: string;
  applied_at: string;
}

const PERCENT_SCALE = 100;
const MS_PER_HOUR = 3_600_000;

/** A cap raised by a whole-number percentage, floored so the uplift never rounds past what was configured. */
export function upliftedCap(cap: number | null, percent: number): number | null {
  if (cap === null) return null;
  if (!Number.isFinite(percent) || percent <= 0) return cap;
  return Math.floor((cap * (PERCENT_SCALE + percent)) / PERCENT_SCALE);
}

/**
 * The most extra usage one account can draw from an uplift between now and its
 * end. A rolling window admits at most its raised cap in any span of its own
 * length, so over the remaining time the extra is bounded by the extra per
 * window times the windows that fit. A 5-hour uplift alone cannot lift the
 * weekly cap, so its bound is also held to the weekly cap per week.
 */
export function upliftExposure(input: {
  sessionCap: number | null;
  weeklyCap: number | null;
  percent: number;
  windows: readonly UsageLimitUpliftWindow[];
  remainingMs: number;
  sessionWindowHours: number;
  weeklyWindowHours: number;
}): number {
  if (input.remainingMs <= 0 || input.percent <= 0) return 0;
  const weeks = Math.ceil(input.remainingMs / (input.weeklyWindowHours * MS_PER_HOUR));
  const extra = (cap: number | null) =>
    cap === null ? 0 : (upliftedCap(cap, input.percent) ?? cap) - cap;
  const weeklyExtra = input.windows.includes('weekly') ? extra(input.weeklyCap) : 0;
  let sessionExtra = 0;
  if (input.windows.includes('session')) {
    const sessions = Math.ceil(input.remainingMs / (input.sessionWindowHours * MS_PER_HOUR));
    const bySession = sessions * extra(input.sessionCap);
    sessionExtra =
      input.weeklyCap === null
        ? bySession
        : Math.min(bySession, weeks * (input.weeklyCap + weeklyExtra));
  }
  return weeks * weeklyExtra + sessionExtra;
}

export function formatResetsAvailable(count: number): string {
  if (count <= 0) return 'No resets right now';
  return count === 1 ? '1 reset available' : `${count} resets available`;
}

const UPLIFT_WINDOW_LABEL: Readonly<Record<UsageLimitUpliftWindow, string>> = {
  session: '5-hour',
  weekly: 'weekly',
};

export function formatUpliftLine(
  uplift: Pick<UsageLimitUpliftOffer, 'percent' | 'windows' | 'workloads'>,
  endsOn: string,
): string {
  const windows = uplift.windows.map((window) => UPLIFT_WINDOW_LABEL[window]).join(' and ');
  const scope =
    uplift.workloads.length === 0
      ? ''
      : ` for ${uplift.workloads.map((workload) => usageWorkloadLabel(workload)).join(', ')}`;
  const noun = uplift.windows.length > 1 ? 'limits' : 'limit';
  const label = windows.charAt(0).toUpperCase() + windows.slice(1);
  return `${label} ${noun} +${uplift.percent}%${scope} until ${endsOn}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readTimestamp(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${key} must be an ISO timestamp`);
  }
  return value;
}

function readCount(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${key} must be a whole number`);
  }
  return value;
}

function readStrings(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new TypeError(`${key} must be a list of strings`);
  }
  return value as string[];
}

function isUpliftWindow(value: string): value is UsageLimitUpliftWindow {
  return (USAGE_LIMIT_UPLIFT_WINDOWS as readonly string[]).includes(value);
}

export function parseUsageLimitPromotionState(value: unknown): UsageLimitPromotionState {
  if (!isRecord(value) || !isRecord(value['resets']) || !Array.isArray(value['uplifts'])) {
    throw new TypeError('limit_promotions must carry resets and uplifts');
  }
  const resets = value['resets'];
  if (!Array.isArray(resets['grants'])) throw new TypeError('resets.grants must be a list');
  const lastApplied = resets['last_applied_at'];
  return {
    resets: {
      available: readCount(resets, 'available'),
      grants: resets['grants'].map((grant) => {
        if (!isRecord(grant) || typeof grant['grant_id'] !== 'string') {
          throw new TypeError('a reset grant must carry its id');
        }
        return { grant_id: grant['grant_id'], expires_at: readTimestamp(grant, 'expires_at') };
      }),
      can_apply: resets['can_apply'] === true,
      last_applied_at: lastApplied === null ? null : readTimestamp(resets, 'last_applied_at'),
    },
    uplifts: value['uplifts'].map((uplift) => {
      if (!isRecord(uplift) || typeof uplift['promotion_id'] !== 'string') {
        throw new TypeError('an uplift must carry its promotion id');
      }
      const percent = uplift['percent'];
      if (typeof percent !== 'number' || !Number.isInteger(percent) || percent <= 0) {
        throw new TypeError('an uplift percent must be a positive whole number');
      }
      const windows = readStrings(uplift, 'windows');
      if (windows.length === 0 || !windows.every(isUpliftWindow)) {
        throw new TypeError('an uplift must name the windows it raises');
      }
      return {
        promotion_id: uplift['promotion_id'],
        percent,
        windows: windows as UsageLimitUpliftWindow[],
        workloads: readStrings(uplift, 'workloads'),
        ends_at: readTimestamp(uplift, 'ends_at'),
      };
    }),
  };
}
