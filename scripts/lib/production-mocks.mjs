const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const MOCK_SPECIFIER_RE = /(?:^|\/)__mocks__(?:\/|$)|(?:^|\/)mocks?(?:\/|$)|[.-]mock(?:s)?(?:\/|$)/;

const MOCK_PACKAGES = new Set([
  'msw',
  'msw/node',
  'msw/browser',
  'faker',
  '@faker-js/faker',
  'nock',
  'sinon',
  'jest-mock',
  'vitest-mock-extended',
  'testdouble',
]);

const INLINE_RULES = [
  {
    id: 'test-double-api',
    regex: /(?:^|[;{}(,]|=>?)\s*(?:await\s+)?(?:vi|jest)\.(?:mock|spyOn|fn)\s*\(/,
    advice: 'a test-double API compiled into the product means the shipped path is the fake one',
  },
  {
    id: 'stub-return',
    regex: /\breturn\s+(?:MOCK|FAKE|STUB|DUMMY|SAMPLE)_[A-Z0-9_]+\b/,
    advice: 'the function answers from a canned constant instead of the system it names',
  },
];

const TEST_PATH_RE =
  /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|tests?|e2e|test-utils|testing|fixtures|\.storybook|stories|mocks)(?:\/|$)|\.(?:test|spec|stories|bench)\.[cm]?[jt]sx?$|(?:^|\/)(?:setup-tests?|vitest\.setup|test-setup)\.[cm]?[jt]sx?$/;

export function isProductionPath(relPath) {
  const normalised = relPath.split('\\').join('/');
  if (!/\.[cm]?[jt]sx?$/.test(normalised)) return false;
  if (/(?:^|\/)(?:node_modules|dist|build|coverage|\.next)(?:\/|$)/.test(normalised)) return false;
  return !TEST_PATH_RE.test(normalised);
}

export function stripComments(source) {
  return source
    .replace(BLOCK_COMMENT_RE, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*(?:\/\/|\*)/.test(line) ? '' : line.replace(/(^|[^:"'`])\/\/.*$/, '$1')))
    .join('\n');
}

function lineOf(code, index) {
  return code.slice(0, index).split('\n').length;
}

function specifierIsMock(specifier) {
  if (MOCK_PACKAGES.has(specifier)) return true;
  const withoutQuery = specifier.split('?')[0];
  return MOCK_SPECIFIER_RE.test(withoutQuery);
}

export function findProductionMocks(source, file) {
  if (!isProductionPath(file)) return [];
  const code = stripComments(source);
  const findings = [];

  for (const pattern of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      if (!specifierIsMock(match[1])) continue;
      findings.push({
        file,
        line: lineOf(code, match.index),
        rule: 'mock-import',
        detail: match[1],
      });
    }
  }

  code.split('\n').forEach((line, index) => {
    for (const rule of INLINE_RULES) {
      if (rule.regex.test(line)) {
        findings.push({ file, line: index + 1, rule: rule.id, detail: line.trim().slice(0, 80) });
      }
    }
  });

  return findings;
}

export function countByRule(findings) {
  const counts = { 'mock-import': 0 };
  for (const rule of INLINE_RULES) counts[rule.id] = 0;
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
  return counts;
}

export function checkAgainstRatchet(counts, ratchet) {
  const errors = [];
  for (const rule of Object.keys(counts)) {
    const allowed = ratchet.maxFindings?.[rule];
    if (typeof allowed !== 'number') {
      errors.push(`ratchet has no maxFindings entry for ${rule}`);
      continue;
    }
    if (counts[rule] > allowed) {
      errors.push(`${rule}: ${counts[rule]} in production paths, above the ratchet of ${allowed}`);
    }
  }
  return errors;
}

export { INLINE_RULES, MOCK_PACKAGES };
