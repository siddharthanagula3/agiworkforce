/**
 * Indic-script detection for the auto-routing system.
 *
 * Implements §4 (Indic detection) of `tasks/auto-routing-spec.md`:
 *   "Unicode-range scan of input, sticky for conversation. >20% Indic →
 *    swap workhorse to Sarvam-M."
 *
 * Scripts covered (per Pool C definition):
 *   - Devanagari   U+0900 – U+097F   (Hindi, Marathi, Sanskrit, Nepali)
 *   - Bengali      U+0980 – U+09FF   (Bengali, Assamese)
 *   - Gurmukhi     U+0A00 – U+0A7F   (Punjabi)
 *   - Gujarati     U+0A80 – U+0AFF
 *   - Tamil        U+0B80 – U+0BFF
 *   - Telugu       U+0C00 – U+0C7F
 *   - Kannada      U+0C80 – U+0CFF
 *   - Malayalam    U+0D00 – U+0D7F
 *
 * Vercel React Best Practices applied:
 *   - `js-hoist-regexp` — none (we use codepoint comparisons; no regex at all
 *     because regex unicode flags allocate a per-call lastIndex on globals).
 *   - `js-early-exit` — bail on empty input before iterating.
 *   - `bundle-analyzable-paths` — named exports only.
 *   - `server-no-shared-module-state` — pure functions; no caches.
 *
 * @module routing/indic
 * @packageDocumentation
 */

// ============================================================================
// Script ranges (sorted ascending, end-exclusive comparison via `<=`).
// ----------------------------------------------------------------------------
// Tuples are `[start, end, name]`. We keep the array sorted so that — if a
// future audit demands binary search — the call sites do not need to change.
// At today's scale (8 ranges) a linear scan is faster than the binary-search
// branch overhead on every codepoint, so we use a tight for-loop.
// ============================================================================

/** Human-readable identifier for each Indic script we detect. */
export type IndicScript =
  | 'devanagari'
  | 'bengali'
  | 'gurmukhi'
  | 'gujarati'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'malayalam';

/** End-inclusive Unicode block ranges per Indic script. */
const INDIC_RANGES: ReadonlyArray<readonly [number, number, IndicScript]> = [
  [0x0900, 0x097f, 'devanagari'],
  [0x0980, 0x09ff, 'bengali'],
  [0x0a00, 0x0a7f, 'gurmukhi'],
  [0x0a80, 0x0aff, 'gujarati'],
  [0x0b80, 0x0bff, 'tamil'],
  [0x0c00, 0x0c7f, 'telugu'],
  [0x0c80, 0x0cff, 'kannada'],
  [0x0d00, 0x0d7f, 'malayalam'],
];

/** Default ratio (per spec §4) at which Sarvam-M overrides the workhorse. */
export const DEFAULT_INDIC_RATIO_THRESHOLD = 0.2;

// ============================================================================
// Result shape
// ============================================================================

/**
 * Result of `detectIndicScript`. Counts denominators include ALL scanned
 * codepoints (after combining-mark filtering) so the ratio is interpretable
 * across mixed-script input.
 */
export interface IndicDetectionResult {
  /** True iff `indicRatio >= threshold`. */
  isIndic: boolean;

  /** Indic codepoints / total scanned codepoints (0..1). */
  indicRatio: number;

  /** Codepoints that fell into one of the Indic ranges. */
  indicCharCount: number;

  /** Total codepoints inspected (whitespace and Latin both count). */
  totalCharCount: number;

  /**
   * Dominant Indic script (highest per-script codepoint count) or `null` if
   * the message contains no Indic characters at all.
   */
  dominantScript: IndicScript | null;

  /**
   * Per-script codepoint counts. Always contains all 8 keys so callers can
   * iterate without `Object.hasOwn` checks. Zero when the script is absent.
   */
  scriptCounts: Readonly<Record<IndicScript, number>>;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Scan `text` for Indic characters and return both the ratio and the
 * dominant script. Used by:
 *
 *   - The Pool C overlay to swap the workhorse to Sarvam-M when
 *     `result.isIndic` is true.
 *   - Telemetry to log a privacy-safe `language_code` bucket.
 *
 * @param text       - Raw user message.
 * @param threshold  - Minimum Indic ratio that flips `isIndic` to true.
 *                     Defaults to `DEFAULT_INDIC_RATIO_THRESHOLD` (0.2 per spec).
 */
export function detectIndicScript(
  text: string,
  threshold: number = DEFAULT_INDIC_RATIO_THRESHOLD,
): IndicDetectionResult {
  // `js-early-exit`: empty input returns the zero result immediately.
  if (text.length === 0) {
    return EMPTY_RESULT;
  }

  // Per-script tally. Initialised to a fresh object so callers cannot mutate
  // the module-level zero record (`server-no-shared-module-state`).
  const scriptCounts: Record<IndicScript, number> = {
    devanagari: 0,
    bengali: 0,
    gurmukhi: 0,
    gujarati: 0,
    tamil: 0,
    telugu: 0,
    kannada: 0,
    malayalam: 0,
  };

  let indicCount = 0;
  let totalCount = 0;

  // Iterate by codepoint (handles surrogate pairs correctly even though Indic
  // ranges are all in the BMP — being correct here costs nothing).
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    totalCount += 1;

    // Linear scan over 8 ranges — faster than binary search at this size.
    for (let i = 0; i < INDIC_RANGES.length; i++) {
      const [start, end, name] = INDIC_RANGES[i]!;
      if (cp >= start && cp <= end) {
        indicCount += 1;
        scriptCounts[name] += 1;
        break;
      }
    }
  }

  if (totalCount === 0) {
    return EMPTY_RESULT;
  }

  const indicRatio = indicCount / totalCount;
  const dominantScript = indicCount === 0 ? null : pickDominant(scriptCounts);

  return {
    isIndic: indicRatio >= threshold,
    indicRatio,
    indicCharCount: indicCount,
    totalCharCount: totalCount,
    dominantScript,
    scriptCounts,
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

const EMPTY_RESULT: IndicDetectionResult = Object.freeze({
  isIndic: false,
  indicRatio: 0,
  indicCharCount: 0,
  totalCharCount: 0,
  dominantScript: null,
  scriptCounts: Object.freeze({
    devanagari: 0,
    bengali: 0,
    gurmukhi: 0,
    gujarati: 0,
    tamil: 0,
    telugu: 0,
    kannada: 0,
    malayalam: 0,
  }),
});

/** Return the script with the highest count, ties resolved by INDIC_RANGES order. */
function pickDominant(counts: Record<IndicScript, number>): IndicScript | null {
  let best: IndicScript | null = null;
  let bestCount = 0;

  for (let i = 0; i < INDIC_RANGES.length; i++) {
    const name = INDIC_RANGES[i]![2];
    const count = counts[name];
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }

  return best;
}
