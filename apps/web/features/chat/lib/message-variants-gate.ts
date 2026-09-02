export const MESSAGE_VARIANTS_QUERY_PARAM = 'variants';
export const MESSAGE_VARIANTS_STORAGE_KEY = 'agi.message-variants';

export const MESSAGE_VARIANTS_MODES = {
  on: 'on',
  off: 'off',
} as const;

export type MessageVariantsMode =
  (typeof MESSAGE_VARIANTS_MODES)[keyof typeof MESSAGE_VARIANTS_MODES];

function parseMode(raw: string | null | undefined): MessageVariantsMode | null {
  if (raw === MESSAGE_VARIANTS_MODES.on) return MESSAGE_VARIANTS_MODES.on;
  if (raw === MESSAGE_VARIANTS_MODES.off) return MESSAGE_VARIANTS_MODES.off;
  return null;
}

function readQueryOverride(): MessageVariantsMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseMode(new URLSearchParams(window.location.search).get(MESSAGE_VARIANTS_QUERY_PARAM));
  } catch {
    // A malformed query string is not a reason to change how regenerate behaves.
    return null;
  }
}

function readStoredOverride(): MessageVariantsMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseMode(window.localStorage.getItem(MESSAGE_VARIANTS_STORAGE_KEY));
  } catch {
    // Storage blocked by the browser falls through to the build-time default.
    return null;
  }
}

/**
 * The mode a server render resolves to. Both overrides are client-only, so this
 * is also the only mode a first client render may use: the pager occupies a slot
 * in the action row, and hydrating against the override would mean the server
 * and the browser disagreed about whether that slot is filled.
 */
export function resolveMessageVariantsBuildMode(): MessageVariantsMode {
  // Must stay a literal bracket read: Next inlines NEXT_PUBLIC_* by matching
  // the source text, and scripts/env-doctor.mjs scans for the same shape.
  // Edit and regenerate are non-destructive by default; NEXT_PUBLIC_MESSAGE_VARIANTS=off
  // stays available as a kill switch.
  return parseMode(process.env['NEXT_PUBLIC_MESSAGE_VARIANTS']) ?? MESSAGE_VARIANTS_MODES.on;
}

export function resolveMessageVariantsMode(): MessageVariantsMode {
  return readQueryOverride() ?? readStoredOverride() ?? resolveMessageVariantsBuildMode();
}

/**
 * Whether regenerate and edit keep the previous answer as a sibling instead of
 * replacing it. Path resolution is deliberately NOT gated: a conversation the
 * server already reports as threaded has to render its active path whatever this
 * says, or the flag would turn abandoned variants back into visible turns.
 */
export function resolveMessageVariantsEnabled(): boolean {
  return resolveMessageVariantsMode() === MESSAGE_VARIANTS_MODES.on;
}

export function resolveMessageVariantsBuildEnabled(): boolean {
  return resolveMessageVariantsBuildMode() === MESSAGE_VARIANTS_MODES.on;
}
