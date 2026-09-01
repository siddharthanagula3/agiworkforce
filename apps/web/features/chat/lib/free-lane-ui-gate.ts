export const FREE_LANE_UI_QUERY_PARAM = 'freelane';
export const FREE_LANE_UI_STORAGE_KEY = 'agi.free-lane-ui';

export const FREE_LANE_UI_MODES = {
  on: 'on',
  off: 'off',
} as const;

export type FreeLaneUiMode = (typeof FREE_LANE_UI_MODES)[keyof typeof FREE_LANE_UI_MODES];

function parseMode(raw: string | null | undefined): FreeLaneUiMode | null {
  if (raw === FREE_LANE_UI_MODES.on) return FREE_LANE_UI_MODES.on;
  if (raw === FREE_LANE_UI_MODES.off) return FREE_LANE_UI_MODES.off;
  return null;
}

function readQueryOverride(): FreeLaneUiMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseMode(new URLSearchParams(window.location.search).get(FREE_LANE_UI_QUERY_PARAM));
  } catch {
    // A malformed query string is not a reason to describe the lane differently.
    return null;
  }
}

function readStoredOverride(): FreeLaneUiMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseMode(window.localStorage.getItem(FREE_LANE_UI_STORAGE_KEY));
  } catch {
    // Storage blocked by the browser falls through to the build-time default.
    return null;
  }
}

/**
 * The mode a server render resolves to. Both overrides are client-only, so this
 * is also the only mode a first client render may use: the two arms label the
 * same slot differently, and hydrating against the override would mean the
 * server and the browser disagreed about what that slot says.
 */
export function resolveFreeLaneUiBuildMode(): FreeLaneUiMode {
  // Must stay a literal bracket read: Next inlines NEXT_PUBLIC_* by matching
  // the source text, and scripts/env-doctor.mjs scans for the same shape.
  return parseMode(process.env['NEXT_PUBLIC_FREE_LANE_UI']) ?? FREE_LANE_UI_MODES.off;
}

export function resolveFreeLaneUiMode(): FreeLaneUiMode {
  return readQueryOverride() ?? readStoredOverride() ?? resolveFreeLaneUiBuildMode();
}

/**
 * Whether the UI may describe the free tier as the community-model lane. The
 * lane itself is owned by the server's `AGI_FREE_LANE_MODE`, which this cannot
 * read; turning this on while the server lane is off would put copy on screen
 * that the routing does not honour, so it stays off by default and is opted
 * into per environment alongside the server knob.
 */
export function resolveFreeLaneUiEnabled(): boolean {
  return resolveFreeLaneUiMode() === FREE_LANE_UI_MODES.on;
}

export function resolveFreeLaneUiBuildEnabled(): boolean {
  return resolveFreeLaneUiBuildMode() === FREE_LANE_UI_MODES.on;
}
