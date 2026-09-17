const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

const LOGGER_IMPORT_RE = /from\s*['"][^'"]*\/logger['"]/;
const LOGGER_CALL_RE = /\blogger\.(?:debug|info|warn|error|fatal)\s*\(/;

const LOGGING_WRAPPERS = ['withErrorHandler', 'withScim', 'withSeatAccountingErrors'];

const CONSOLE_RE = /(?:^|[^.\w])console\.(?:log|info|warn|error|debug)\s*\(/;

export function stripComments(source) {
  return source
    .replace(BLOCK_COMMENT_RE, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*(?:\/\/|\*)/.test(line) ? '' : line.replace(/(^|[^:"'`])\/\/.*$/, '$1')))
    .join('\n');
}

export function isApiRoute(relPath) {
  const normalised = relPath.split('\\').join('/');
  return /^apps\/web\/app\/api\/.*\/route\.tsx?$/.test(normalised);
}

export function hasStructuredLogging(source) {
  const code = stripComments(source);
  if (LOGGER_IMPORT_RE.test(code) || LOGGER_CALL_RE.test(code)) return true;
  return LOGGING_WRAPPERS.some((wrapper) => new RegExp(`\\b${wrapper}\\s*\\(`).test(code));
}

export function findConsoleLogging(source, file) {
  const code = stripComments(source);
  return code
    .split('\n')
    .map((line, index) => (CONSOLE_RE.test(line) ? { file, line: index + 1 } : null))
    .filter(Boolean);
}

export function scanRoute(source, file) {
  if (!isApiRoute(file)) return [];
  const findings = [];
  if (!hasStructuredLogging(source)) findings.push({ file, rule: 'unlogged-route' });
  for (const hit of findConsoleLogging(source, file)) {
    findings.push({ file, line: hit.line, rule: 'console-in-route' });
  }
  return findings;
}

export function countByRule(findings) {
  const counts = { 'unlogged-route': 0, 'console-in-route': 0 };
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
  return counts;
}

export function checkAgainstRatchet(counts, ratchet) {
  const advice = {
    'unlogged-route':
      'import the logger or wrap the handler in withErrorHandler; a route that logs nothing ' +
      'leaves an incident with no record that it was ever called',
    'console-in-route':
      'console output carries no request id, level or structure, so it is unsearchable in ' +
      'production; use the logger',
  };
  const errors = [];
  for (const rule of Object.keys(counts)) {
    const allowed = ratchet.maxFindings?.[rule];
    if (typeof allowed !== 'number') {
      errors.push(`ratchet has no maxFindings entry for ${rule}`);
      continue;
    }
    if (counts[rule] > allowed) {
      errors.push(
        `${rule}: ${counts[rule]} routes, above the ratchet of ${allowed}: ${advice[rule]}`,
      );
    }
  }
  return errors;
}

export { LOGGING_WRAPPERS };
