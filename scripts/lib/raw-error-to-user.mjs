/**
 * Sinks whose argument is rendered to a person, so a raw exception message
 * reaching one of them puts the browser's own wording on screen: "Failed to
 * fetch" in Chrome, "Load failed" in Safari. Neither names a condition nor
 * suggests an action.
 */
export const USER_VISIBLE_SINKS = [
  'setError',
  'setChatError',
  'setSaveError',
  'setLoadError',
  'setListError',
  'toast.error',
  'toast.warning',
];

const SINK_ALTERNATION = USER_VISIBLE_SINKS.map((s) => s.replace('.', '\\.')).join('|');

/**
 * `sink(err instanceof Error ? err.message : ...)` - the shape that forwards a
 * caught value's own message straight to a person. `toUserMessage` exists for
 * this; the check is that it was used.
 */
const RAW_TO_SINK = new RegExp(
  `(?:${SINK_ALTERNATION})\\(\\s*[^)]*?\\binstanceof Error\\s*\\?\\s*\\w+\\.message`,
);

export function findRawErrorSinks(source, file) {
  const results = [];
  source.split('\n').forEach((line, index) => {
    if (line.trimStart().startsWith('//')) return;
    if (RAW_TO_SINK.test(line)) {
      results.push({ file, line: index + 1, text: line.trim().slice(0, 120) });
    }
  });
  return results;
}

export function countByFile(findings) {
  const counts = {};
  for (const finding of findings) counts[finding.file] = (counts[finding.file] ?? 0) + 1;
  return counts;
}

export function checkAgainstBaseline(counts, baseline) {
  const errors = [];
  for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline.perFile?.[file] ?? 0;
    if (count > allowed) {
      errors.push(`${file}: ${count} raw error message(s) reaching a user (baseline ${allowed})`);
    }
  }
  return errors;
}
