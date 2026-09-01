import { logger } from '@/lib/logger';

export const FREE_LANE_MODE_ENV = 'AGI_FREE_LANE_MODE';

export const FREE_LANE_MODES = {
  off: 'off',
  shadow: 'shadow',
  prefer: 'prefer',
  strict: 'strict',
} as const;

export type FreeLaneMode = (typeof FREE_LANE_MODES)[keyof typeof FREE_LANE_MODES];

const FREE_LANE_MODE_DEFAULT: FreeLaneMode = FREE_LANE_MODES.off;

function isFreeLaneMode(value: string): value is FreeLaneMode {
  return Object.prototype.hasOwnProperty.call(FREE_LANE_MODES, value);
}

export function parseFreeLaneMode(raw: string | null | undefined): FreeLaneMode {
  const value = raw?.trim().toLowerCase();
  if (!value) return FREE_LANE_MODE_DEFAULT;
  if (isFreeLaneMode(value)) return value;
  logger.error(
    { [FREE_LANE_MODE_ENV]: raw },
    '[free-lane] unrecognised lane mode; keeping the lane off',
  );
  return FREE_LANE_MODE_DEFAULT;
}

export function resolveFreeLaneMode(): FreeLaneMode {
  return parseFreeLaneMode(process.env[FREE_LANE_MODE_ENV]);
}

/**
 * The mode this request actually runs under.
 *
 * A request outside the lane's population is `off` whatever the knob says, and
 * that is the single gate the slot preference rides. It matters because the
 * resolver's `normalizeTier` folds `basic`, `hobby` and every unrecognised or
 * absent tier into the `free` ceiling: without this, turning the lane on would
 * hand free-lane preference to paying Basic customers and to any request whose
 * tier could not be read. `isFreePlan` must come from the exact-`free` check,
 * not from the resolver's notion of the free tier.
 */
export function freeLaneModeFor(configured: FreeLaneMode, isFreePlan: boolean): FreeLaneMode {
  return isFreePlan ? configured : FREE_LANE_MODES.off;
}

/** `off` must not even compute a decision: no snapshot read, no log line. */
export function freeLaneObserves(mode: FreeLaneMode): boolean {
  return mode !== FREE_LANE_MODES.off;
}

export function freeLaneDispatches(mode: FreeLaneMode): boolean {
  return mode === FREE_LANE_MODES.prefer || mode === FREE_LANE_MODES.strict;
}

/**
 * Whether an unavailable lane strands the request instead of falling through.
 *
 * Only `strict` strands. `prefer` exists precisely so a sparse pool set degrades
 * to the subsidized path rather than to an error page.
 */
export function freeLaneStrandsWhenUnavailable(mode: FreeLaneMode): boolean {
  return mode === FREE_LANE_MODES.strict;
}
