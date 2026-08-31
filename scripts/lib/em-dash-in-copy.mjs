const EM_DASH = '—';

/**
 * The literal character and every escape that renders as one. `&mdash;` was
 * the blind spot the first version of this guard shipped with: 103 of them
 * across 23 files rendered on the page while a scan for the character alone
 * reported those files clean.
 */
const ANY_EM_DASH = /—|&mdash;|&#8212;|&#x2014;/gi;

const COMMENT_START = /^\s*(\/\/|\*|\/\*)/;

/**
 * An em dash standing alone is a table placeholder for "no value", not prose,
 * so `'—'` and `{'—'}` are left alone. Everything else on a non-comment line
 * reaches a reader.
 */
const PLACEHOLDER = new RegExp(`(['"\`{>])\\s*(?:${EM_DASH}|&mdash;)\\s*(['"\`}<])`);

/**
 * Em dashes in copy a user reads.
 *
 * The founder's instruction is that this product's writing does not use them:
 * a spaced em dash is one of the reliable tells of generated prose, and the
 * public pages carried 218 of them across 100 files. Comments are exempt
 * because nobody reads them on the page.
 */
export function findEmDashes(source, file) {
  const results = [];
  source.split('\n').forEach((line, i) => {
    if (!ANY_EM_DASH.test(line)) return;
    ANY_EM_DASH.lastIndex = 0;
    if (COMMENT_START.test(line)) return;
    const matches = line.match(ANY_EM_DASH) ?? [];
    if (matches.length === 1 && PLACEHOLDER.test(line)) return;
    for (let n = 0; n < matches.length; n += 1) {
      results.push({ file, line: i + 1, text: line.trim().slice(0, 80) });
    }
  });
  return results;
}

export function countByFile(findings) {
  const counts = {};
  for (const finding of findings) counts[finding.file] = (counts[finding.file] ?? 0) + 1;
  return counts;
}

/**
 * Per-file ceilings, so a file that still carries some cannot gain more while
 * the rest are worked down.
 */
export function checkAgainstBaseline(counts, baseline) {
  const errors = [];
  for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline.perFile?.[file] ?? 0;
    if (count > allowed) {
      errors.push(`${file}: ${count} em dash(es) in copy (baseline allows ${allowed})`);
    }
  }
  return errors;
}
