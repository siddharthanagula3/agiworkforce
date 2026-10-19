const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_RE = /(^|[^:"'`\\])\/\/.*$/gm;

const CLIENT_DIRECTIVE_RE = /^\s*['"]use client['"]\s*;?\s*$/m;

const FETCH_SIGNALS = [
  /\buse(?:Suspense)?(?:Infinite)?Query\s*\(/,
  /\buseSWR(?:Infinite|Immutable)?\s*\(/,
  /\buseQueries\s*\(/,
  /\bfetch\s*\(/,
  /\bfetchWithTimeout\s*\(/,
];

const STATE_RULES = [
  {
    id: 'loading',
    signals: [
      /\bis(?:Loading|Pending|Fetching|Validating|Refetching)\b/,
      /<(?:Spinner|Skeleton|LoadingButton|Progress|AuthProgress)\b/,
      /\baria-busy\b/,
      /\bloadingState\b/,
      /(?:\bkind|(?<![\w$.])(?:state|status))\s*===\s*'(?:loading|checking|working)'/,
    ],
    advice:
      'render a Spinner or Skeleton while the request is in flight; a route that paints nothing reads as broken',
  },
  {
    id: 'empty',
    signals: [
      /<EmptyState\b/,
      /\.length\s*===\s*0/,
      /\.length\s*>\s*0/,
      /\.length\s*\?/,
      /\bisEmpty\b/,
      /\.length\s*&&/,
    ],
    advice:
      'render an EmptyState when the successful response carries no rows; zero results is not a loading state',
  },
  {
    id: 'error',
    signals: [
      /\bis(?:Error|LoadError)\b/,
      /<SectionErrorBoundary\b/,
      /\btoUserMessage\s*\(/,
      /\btoast\.error\s*\(/,
      /\berror\s*(?:&&|\?)/,
      /\berrorMessage\b/,
      /\bloadError\b/,
      /\b(?:kind|state)(?:\.status)?\s*===\s*'(?:error|failed)'/,
    ],
    advice:
      'render a recovery affordance when the request fails; a swallowed rejection leaves the route on its loading state forever',
  },
];

export function stripComments(source) {
  return source.replace(BLOCK_COMMENT_RE, '').replace(LINE_COMMENT_RE, '$1');
}

const SCANNED_ROOTS = ['apps/web/app/', 'apps/web/features/', 'apps/web/shared/'];

export function isRouteComponent(relPath) {
  const normalised = relPath.split('\\').join('/');
  if (!normalised.endsWith('.tsx')) return false;
  if (/\.(?:test|spec|stories)\.tsx$/.test(normalised)) return false;
  if (/(?:^|\/)(?:__tests__|__mocks__|node_modules|\.next|dist)\//.test(normalised)) return false;
  return SCANNED_ROOTS.some((root) => normalised.startsWith(root));
}

export function fetchesData(source) {
  const code = stripComments(source);
  if (!CLIENT_DIRECTIVE_RE.test(code)) return false;
  return FETCH_SIGNALS.some((signal) => signal.test(code));
}

// Only a route that renders rows can come back with none of them; a form, a
// single record or a one-shot action has no empty answer to give.
const RENDERS_ROWS =
  /\.map\(\s*(?:(?:\([^()]*\)|[\w$]+)(?:\s*:\s*[^=]+?)?\s*=>|render[A-Z][\w$]*\s*[,)])/g;

const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;
const RECEIVER_BEFORE_MAP = /(?<![\w$.\])?])([A-Za-z_$][\w$]*)\s*$/;

function importedNames(code) {
  const names = new Set();
  for (const match of code.matchAll(
    /^\s*import\s+(?:type\s+)?([^;]*?)\s+from\s+['"][^'"]+['"]/gm,
  )) {
    for (const name of match[1].matchAll(/[A-Za-z_$][\w$]*/g)) names.add(name[0]);
  }
  return names;
}

// A list mapped from a constant another module exports is fixed at build time,
// so it cannot come back empty; only rows the request returned owe an empty state.
function rendersRows(code) {
  const imported = importedNames(code);
  for (const match of code.matchAll(RENDERS_ROWS)) {
    const receiver = RECEIVER_BEFORE_MAP.exec(code.slice(0, match.index))?.[1];
    if (receiver && CONSTANT_NAME.test(receiver) && imported.has(receiver)) continue;
    return true;
  }
  return false;
}

export function missingStates(source) {
  const code = stripComments(source);
  return STATE_RULES.filter((rule) => rule.id !== 'empty' || rendersRows(code))
    .filter((rule) => !rule.signals.some((signal) => signal.test(code)))
    .map((rule) => rule.id);
}

export function scanRouteStates(source, relPath) {
  if (!isRouteComponent(relPath) || !fetchesData(source)) return [];
  return missingStates(source).map((rule) => ({ file: relPath, rule }));
}

export function countByRule(findings) {
  const counts = {};
  for (const rule of STATE_RULES) counts[rule.id] = 0;
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
  return counts;
}

export function checkAgainstRatchet(counts, ratchet) {
  const errors = [];
  for (const rule of STATE_RULES) {
    const allowed = ratchet.maxMissing?.[rule.id];
    if (typeof allowed !== 'number') {
      errors.push(`ratchet has no maxMissing entry for ${rule.id}`);
      continue;
    }
    if (counts[rule.id] > allowed) {
      errors.push(
        `${counts[rule.id]} data-fetching routes render no ${rule.id} state, above the ratchet of ${allowed}: ${
          STATE_RULES.find((r) => r.id === rule.id).advice
        }`,
      );
    }
  }
  return errors;
}

export { STATE_RULES };
