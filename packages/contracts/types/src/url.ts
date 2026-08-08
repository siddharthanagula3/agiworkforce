/**
 * Strip trailing `/` characters from a base URL.
 *
 * WHY NOT `replace(/\/+$/, '')`. That exact expression was hand-rolled in nine
 * files across three packages, and CodeQL flags every one of them as
 * `js/polynomial-redos`. The reason is real: an anchored `+` over a repeated
 * character backtracks quadratically, so a value of many `/` characters costs
 * O(n²) to reject. Base URLs are usually configuration, which makes this a
 * low-severity finding rather than a live denial of service — but
 * `resolveGeneratedFileUri` and the managed-cloud clients take their base from
 * runtime settings, so "configuration" is not the same as "trusted and short".
 *
 * The scan below is a single backward pass: O(n), no backtracking, no engine.
 *
 * Duplication was the larger problem. Nine copies of one expression means a
 * fix in any of them fixes none of the others, which is precisely how all nine
 * ended up flagged at once.
 */
const SLASH = 47; // '/'

export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}
