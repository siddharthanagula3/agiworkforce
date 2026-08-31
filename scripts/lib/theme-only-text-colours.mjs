export const LIGHT_SHADES = new Set(['200', '300', '400']);

export const FAMILIES =
  'rose|amber|emerald|sky|violet|blue|green|red|orange|yellow|teal|cyan|indigo|purple|pink|fuchsia|lime';

const CLASS_RE = new RegExp(`(?<prefix>\\S*?)text-(?<family>${FAMILIES})-(?<shade>\\d{2,3})`, 'g');

/**
 * Unpaired light-shade text colours in one file's source.
 *
 * A 200-400 shade is a dark-theme value: measured, text-rose-300 over
 * bg-rose-500/10 on white is 1.66:1 and text-amber-300 is 1.33:1. Paired with a
 * `dark:` counterpart on the same element it is fine, so both the `dark:`
 * prefix and a sibling `dark:text-<family>-*` on the line clear it.
 */
export function findUnpaired(source, file) {
  const results = [];
  source.split('\n').forEach((line, i) => {
    for (const match of line.matchAll(CLASS_RE)) {
      const { prefix, family, shade } = match.groups;
      if (!LIGHT_SHADES.has(shade)) continue;
      if (prefix.endsWith('dark:')) continue;
      if (new RegExp(`dark:text-${family}-\\d`).test(line)) continue;
      results.push({ file, line: i + 1, className: `text-${family}-${shade}` });
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
 * Per-file ceilings rather than pinned line numbers: a line-pinned allowlist
 * goes stale on the next edit above it and trains people to re-baseline
 * reflexively, which is how a ratchet stops ratcheting.
 */
export function checkAgainstBaseline(counts, baseline) {
  const errors = [];
  for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline.perFile?.[file] ?? 0;
    if (count > allowed) {
      errors.push(`${file}: ${count} unpaired (baseline allows ${allowed})`);
    }
  }
  return errors;
}
