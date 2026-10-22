import path from 'node:path';

const APP_ROOT = 'apps/web/app';
const API_ROOT = `${APP_ROOT}/api`;

const DYNAMIC_SEGMENT_RE = /\[\[?\.\.\.[^\]]+\]\]?|\[[^\]]+\]/g;
const GROUP_SEGMENT_RE = /\([^)]*\)\//g;

function posix(relPath) {
  return relPath.split('\\').join('/');
}

export function isApiRoute(relPath) {
  return new RegExp(`^${API_ROOT}/.*/route\\.tsx?$`).test(posix(relPath));
}

export function isPageRoute(relPath) {
  const normalised = posix(relPath);
  return (
    normalised.startsWith(`${APP_ROOT}/`) &&
    !normalised.startsWith(`${API_ROOT}/`) &&
    path.basename(normalised) === 'page.tsx'
  );
}

/** `/api/admin/sso/[id]/route.ts` -> `/api/admin/sso`, the prefix a test can name. */
export function routePath(relPath) {
  const directory = posix(path.dirname(relPath)).replace(APP_ROOT, '');
  const withoutGroups = `${directory.replace(/^\//, '')}/`.replace(GROUP_SEGMENT_RE, '');
  const literal = `/${withoutGroups}`.replace(DYNAMIC_SEGMENT_RE, '').replace(/\/+/g, '/');
  return literal.replace(/\/+$/, '') || '/';
}

/**
 * A route counts as tested when a test sits beside it or under its own
 * `__tests__`, or when any web test names its path. Naming the path is what a
 * route test does whether it calls the handler directly or goes through a
 * request; requiring a particular file layout would only teach people to move
 * files.
 */
export function apiRouteIsTested(relPath, { testPaths, testSources }) {
  const directory = posix(path.dirname(relPath));
  const beside = testPaths.some((test) => {
    const testDirectory = posix(path.dirname(test));
    return testDirectory === directory || testDirectory === `${directory}/__tests__`;
  });
  if (beside) return true;
  const apiPath = routePath(relPath);
  return testSources.some((source) => source.includes(apiPath));
}

const DYNAMIC_SEGMENT_ONLY_RE = /^\[\[?(?:\.\.\.)?[^\]]+\]\]?$/;
const CATCH_ALL_SEGMENT_RE = /^\[\[?\.\.\./;
const SEGMENT_VALUE = String.raw`(?:\$\{[^}]+\}|[^/'"\x60\s$]+)`;
const SEGMENTS_VALUE = String.raw`${SEGMENT_VALUE}(?:/${SEGMENT_VALUE})*`;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Segments with layout groups removed and trailing dynamic segments dropped,
 * so `/skills/[...path]` keeps counting a spec that names `/skills`.
 */
function pageSegments(relPath) {
  const directory = posix(path.dirname(relPath)).replace(APP_ROOT, '');
  const segments = `${directory}/`
    .replace(GROUP_SEGMENT_RE, '')
    .split('/')
    .filter((segment) => segment.length > 0);
  while (segments.length > 0 && DYNAMIC_SEGMENT_ONLY_RE.test(segments.at(-1))) segments.pop();
  return segments;
}

/**
 * A dynamic segment in the middle of a path is visited with a value in its
 * place, a literal id or a template interpolation such as
 * `/code/${sessionId}/security`, never by the path with the segment deleted.
 */
function innerDynamicRoutePattern(relPath) {
  const segments = pageSegments(relPath);
  if (!segments.some((segment) => DYNAMIC_SEGMENT_ONLY_RE.test(segment))) return null;
  const body = segments
    .map((segment) => {
      if (!DYNAMIC_SEGMENT_ONLY_RE.test(segment)) return escapeRegExp(segment);
      return CATCH_ALL_SEGMENT_RE.test(segment) ? SEGMENTS_VALUE : SEGMENT_VALUE;
    })
    .join('/');
  return new RegExp(`/${body}(?![\\w-])`);
}

export function pageRouteHasSpec(relPath, specSources) {
  const pattern = innerDynamicRoutePattern(relPath);
  if (pattern) return specSources.some((source) => pattern.test(source));
  const route = routePath(relPath);
  return specSources.some((source) => source.includes(route));
}

export function scan({ apiRoutes, pageRoutes, testPaths, testSources, specSources }) {
  const findings = [];
  for (const route of apiRoutes) {
    if (!apiRouteIsTested(route, { testPaths, testSources })) {
      findings.push({ file: route, rule: 'untested-api-route' });
    }
  }
  for (const page of pageRoutes) {
    if (!pageRouteHasSpec(page, specSources)) {
      findings.push({ file: page, rule: 'unspecced-page-route' });
    }
  }
  return findings;
}

export function countByRule(findings) {
  const counts = { 'untested-api-route': 0, 'unspecced-page-route': 0 };
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
  return counts;
}

export function checkAgainstRatchet(counts, ratchet) {
  const advice = {
    'untested-api-route':
      'add a test that names the route path; a handler nothing exercises is a contract nobody ' +
      'has read since it was written',
    'unspecced-page-route':
      'add a spec under apps/web/e2e that visits the route; a user-facing page with no spec is ' +
      'only ever verified by the person who shipped it',
  };
  const errors = [];
  for (const rule of Object.keys(counts)) {
    const allowed = ratchet.maxFindings?.[rule];
    if (typeof allowed !== 'number') {
      errors.push(`ratchet has no maxFindings entry for ${rule}`);
      continue;
    }
    if (counts[rule] > allowed) {
      errors.push(`${rule}: ${counts[rule]}, above the ratchet of ${allowed}: ${advice[rule]}`);
    }
  }
  return errors;
}
