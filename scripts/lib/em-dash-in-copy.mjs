const ANY_EM_DASH = /\u2014|\\u2014|\\x\{2014\}|&mdash;|&#8212;|&#x2014;/gi;

const ALLOW_MARKER = 'em-dash-allow:';

export function findEmDashes(source, file) {
  const results = [];
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER) || (i > 0 && lines[i - 1].includes(ALLOW_MARKER))) return;
    ANY_EM_DASH.lastIndex = 0;
    const matches = line.match(ANY_EM_DASH) ?? [];
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
