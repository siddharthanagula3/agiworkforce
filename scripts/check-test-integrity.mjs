#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();

const SKIP_DIRS = new Set([
  '.agent',
  '.claude',
  '.git',
  '.next',
  '.vercel',
  '.vscode-test',
  'build',
  'coverage',
  'dist',
  'dist-web',
  'node_modules',
  'out',
  'Pods',
  'playwright-report',
  'target',
  'test-results',
]);

/**
 * Unit and integration tests only. A `.spec.` file in this repository drives a
 * browser or a device, where the runner's own waits fail the test and a capture
 * run legitimately asserts nothing; `scripts/check-vacuous-e2e.mjs` is the gate
 * for those.
 */
const TEST_FILE_RE = /\.test\.[cm]?[jt]sx?$/;
const EXEMPT_FILES = new Set([
  'scripts/check-test-integrity.mjs',
  'scripts/check-test-integrity.test.mjs',
]);

const ALLOW_ANNOTATION = /test-integrity-allow:/;

/**
 * What counts as this test having checked something. Deliberately generous: a
 * missing entry here reads as a test asserting nothing, and a guard that cries
 * wolf gets suppressed rather than obeyed.
 */
const ASSERTION_TOKENS = [
  'expect(',
  'expect.',
  'expectTypeOf',
  'assertType',
  'assert(',
  'assert.',
  'assert!',
  'toHaveBeenCalled',
  'toMatchSnapshot',
  'toMatchInlineSnapshot',
  'toMatchFileSnapshot',
  'toThrowErrorMatchingSnapshot',
  '.should.',
  'should(',
  // A testing-library getBy/findBy throws when the element is not there, and a
  // waitFor rethrows what its callback threw, so each one can fail the test.
  'getBy',
  'getAllBy',
  'findBy',
  'findAllBy',
  'waitFor(',
  'waitForElement',
  // Throw on a non-zero exit, so the test fails when the command does.
  'execSync(',
  'execFileSync(',
];

// A call whose name says it checks something and that throws when it does not
// hold: assertPinnedImages(...), validateFamilyCatalog(...), requireEnv(...).
const CHECKING_CALL = /\b(?:assert|validate|verify|require|ensure|expect)[A-Z_]\w*\s*\(/;

/**
 * A matcher that passes whatever the code under test does. Each entry is a
 * defect in its own right, not a style preference: the test reports green
 * without having constrained the value it was written to constrain.
 */
const VACUOUS_ASSERTIONS = [
  {
    regex: /\bexpect\s*\(\s*(?:true|1|'[^']*'|"[^"]*"|\[\]|\{\})\s*\)\s*\.\s*toBeTruthy\s*\(/g,
    label: 'expect(<literal>).toBeTruthy() asserts nothing about the code under test',
  },
  {
    regex:
      /\bexpect\s*\(\s*(?:true|false|null|undefined|\d+|'[^']*'|"[^"]*")\s*\)\s*\.\s*toBeDefined\s*\(/g,
    label: 'expect(<literal>).toBeDefined() asserts nothing about the code under test',
  },
  {
    regex: /\.\s*(?:toEqual|toBe|toStrictEqual)\s*\(\s*expect\s*\.\s*anything\s*\(\s*\)\s*\)/g,
    label: 'toEqual(expect.anything()) accepts every value but undefined and null',
  },
  {
    regex: /\.\s*length\s*\)\s*\.\s*toBeGreaterThanOrEqual\s*\(\s*0\s*\)/g,
    label: 'a length is never below zero, so this passes on an empty result',
  },
  {
    regex: /\.\s*toMatch\s*\(\s*(?:\/(?:\.\*)?\/[gimsuy]*|''|"")\s*\)/g,
    label: 'toMatch() against an empty or match-all pattern passes on any string',
  },
  {
    regex: /\.\s*toContain\s*\(\s*(?:''|"")\s*\)/g,
    label: 'every string contains the empty string',
  },
  {
    regex: /\bassert\s*\.\s*ok\s*\(\s*true\s*[,)]/g,
    label: 'assert.ok(true) asserts nothing',
  },
  {
    regex:
      /\bassert\s*\.\s*(?:equal|strictEqual|deepEqual|deepStrictEqual)\s*\(\s*true\s*,\s*true\s*\)/g,
    label: 'assert.equal(true, true) asserts nothing',
  },
];

// Identifiers and member chains only: `expect(f(x)).toBe(f(x))` is a real
// determinism or reference-identity check, `expect(a).toBe(a)` never is.
const SELF_COMPARISON =
  /\bexpect\s*\(\s*([\w$]+(?:\s*\.\s*[\w$]+)*)\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*([\w$]+(?:\s*\.\s*[\w$]+)*)\s*\)/g;

const CATCH_BLOCK = /\bcatch\s*(?:\(\s*[\w$]*(?:\s*:\s*[\w$<>.[\]|]+)?\s*\))?\s*\{/g;

const MOCK_CALL = /\b(?:vi|jest)\s*\.\s*(?:mock|doMock)\s*\(\s*['"]([^'"]+)['"]/g;

const TEST_CALL =
  /(?:^|[^.\w$])(?:it|test)(?:\s*\.\s*(?:only|concurrent|sequential|fails|extend|each\s*(?:\([^)]*\)|`(?:[^`\\]|\\.)*`)))?\s*\(/g;

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = lstatSync(full);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(full, files);
    else if (TEST_FILE_RE.test(entry)) files.push(full);
  }
  return files;
}

function gitFiles(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && TEST_FILE_RE.test(line))
      .map((file) => path.join(root, file))
      .filter((file) => existsSync(file));
  } catch {
    return [];
  }
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function isAnnotated(lines, lineNo) {
  for (let i = lineNo - 3; i <= lineNo + 1; i += 1) {
    if (ALLOW_ANNOTATION.test(lines[i - 1] ?? '')) return true;
  }
  return false;
}

/**
 * Where the callback body of a test call starts.
 *
 * Not the first `{` after the call site: a test name is a string and routinely
 * contains one, and an arrow can destructure its parameter. The body is the
 * block that opens the callback, so the scan looks for the `=>` or `function`
 * that introduces it at the call's own argument depth, stepping over strings,
 * template literals and comments on the way.
 */
function callbackBody(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const char = text[i];
    if (char === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const end = text[i + 1] === '/' ? text.indexOf('\n', i) : text.indexOf('*/', i + 2) + 1;
      if (end <= 0) return null;
      i = end;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const end = closingQuote(text, i, char);
      if (end === -1) return null;
      i = end;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      if (depth < 0) return null;
    } else if (depth === 0 && char === '=' && text[i + 1] === '>') {
      const open = text.slice(i + 2).search(/\S/);
      if (open === -1 || text[i + 2 + open] !== '{') return null;
      return i + 2 + open;
    } else if (depth === 0 && text.startsWith('function', i) && !/[\w$]/.test(text[i - 1] ?? '')) {
      const params = text.indexOf('(', i);
      if (params === -1) return null;
      const close = matchingDelimiter(text, params, '(', ')');
      if (close === -1) return null;
      const open = text.slice(close + 1).search(/\S/);
      return open !== -1 && text[close + 1 + open] === '{' ? close + 1 + open : null;
    }
  }
  return null;
}

export function testBodies(text) {
  const bodies = [];
  TEST_CALL.lastIndex = 0;
  let call;
  while ((call = TEST_CALL.exec(text)) !== null) {
    TEST_CALL.lastIndex = call.index + call[0].length;
    const open = callbackBody(text, call.index + call[0].length);
    if (open === null) continue;
    const close = matchingBrace(text, open);
    if (close === -1) continue;
    bodies.push({ start: open + 1, end: close, body: text.slice(open + 1, close) });
  }
  return bodies;
}

function matchingDelimiter(text, start, opener, closer) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (char === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const end = text[i + 1] === '/' ? text.indexOf('\n', i) : text.indexOf('*/', i + 2) + 1;
      if (end <= 0) return -1;
      i = end;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const end = closingQuote(text, i, char);
      if (end === -1) return -1;
      i = end;
      continue;
    }
    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchingBrace(text, open) {
  return matchingDelimiter(text, open, '{', '}');
}

function closingQuote(text, start, quote) {
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === quote) return i;
    if (quote !== '`' && text[i] === '\n') return -1;
  }
  return -1;
}

function stripComments(body) {
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function hasAssertion(body) {
  const code = stripComments(body);
  return ASSERTION_TOKENS.some((token) => code.includes(token)) || CHECKING_CALL.test(code);
}

/**
 * Helpers this file defines that assert on the caller's behalf. A test that
 * only calls one of them has asserted; without this the guard would report
 * every table-driven suite in the repository.
 */
export function assertingHelpers(text) {
  const helpers = new Set();
  const declaration =
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*(?:<[^>]*>)?\s*\(|(?:^|\n)\s*(?:export\s+)?const\s+([\w$]+)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/g;
  let match;
  while ((match = declaration.exec(text)) !== null) {
    const name = match[1] ?? match[2];
    const open = text.indexOf('{', match.index + match[0].length - 1);
    if (open === -1) continue;
    const close = matchingBrace(text, open);
    if (close === -1) continue;
    if (hasAssertion(text.slice(open, close))) helpers.add(name);
  }
  return helpers;
}

/**
 * A `try` that holds assertions under a `catch` that ignores them. A failing
 * `expect` throws, the empty handler eats it, and the test reports green having
 * proved the opposite of what it claims. A bare try with no assertion in it is
 * a different shape, an intentional "this may throw", and is left alone.
 */
function swallowedFailures(body) {
  const offsets = [];
  CATCH_BLOCK.lastIndex = 0;
  let match;
  while ((match = CATCH_BLOCK.exec(body)) !== null) {
    const open = body.indexOf('{', match.index);
    const close = matchingBrace(body, open);
    if (close === -1) continue;
    const handler = stripComments(body.slice(open + 1, close));
    if (handler.trim() !== '') continue;
    const tryBlock = precedingTryBlock(body, match.index);
    if (tryBlock === null || !hasAssertion(tryBlock)) continue;
    offsets.push(match.index);
  }
  return offsets;
}

function precedingTryBlock(body, catchIndex) {
  const close = body.lastIndexOf('}', catchIndex);
  if (close === -1) return null;
  for (let open = close - 1; open >= 0; open -= 1) {
    if (body[open] !== '{') continue;
    if (matchingBrace(body, open) !== close) continue;
    return /\btry\s*$/.test(body.slice(Math.max(0, open - 8), open))
      ? body.slice(open, close)
      : null;
  }
  return null;
}

function callsAnAssertingHelper(body, helpers) {
  const code = stripComments(body);
  for (const helper of helpers) {
    if (new RegExp(`\\b${helper}\\s*\\(`).test(code)) return true;
  }
  return false;
}

/** Module specifiers that name the file the test is named after. */
function subjectSpecifiers(relativePath) {
  const base = path.basename(relativePath).replace(TEST_FILE_RE, '');
  return new Set([`./${base}`, `../${base}`, `./${base}.js`, `../${base}.js`]);
}

/**
 * A copy with the contents of every string, template literal and comment
 * replaced by spaces, so a test call quoted inside a fixture is not read as a
 * test and `expect(` inside a documentation string is not read as an assertion.
 * Offsets are preserved, so a finding still points at the real line.
 */
export function maskLiterals(text) {
  const out = text.split('');
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const line = text[i + 1] === '/';
      const end = line ? text.indexOf('\n', i) : text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : line ? end : end + 2;
      blank(i, stop);
      i = stop - 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const end = closingQuote(text, i, char);
      if (end === -1) continue;
      blank(i + 1, end);
      i = end;
      continue;
    }
    if (char === '/' && startsRegexLiteral(text, i)) {
      const end = closingSlash(text, i);
      if (end === -1) continue;
      blank(i + 1, end);
      i = end;
    }
  }
  return out.join('');
}

const REGEX_PRECEDING_OPERATORS = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '^',
  '~',
  '<',
  '>',
  undefined,
]);
const REGEX_PRECEDING_KEYWORDS = /\b(?:return|typeof|case|in|of|do|else|yield|await|new|delete)$/;

/**
 * Whether a `/` opens a regex literal rather than a division. A regex body can
 * hold an unbalanced `}` or quote, so leaving them unmasked cuts a test body
 * short and reads the remaining assertions as absent.
 */
function startsRegexLiteral(text, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i])) i -= 1;
  const previous = i >= 0 ? text[i] : undefined;
  if (REGEX_PRECEDING_OPERATORS.has(previous)) return true;
  return REGEX_PRECEDING_KEYWORDS.test(text.slice(Math.max(0, i - 10), i + 1));
}

function closingSlash(text, start) {
  let inClass = false;
  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '\n') return -1;
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return i;
  }
  return -1;
}

function collectFindings(relativePath, source) {
  const text = maskLiterals(source);
  const findings = [];
  const lines = source.split('\n');
  const report = (offset, label) => {
    const line = lineForOffset(text, offset);
    if (isAnnotated(lines, line)) return;
    findings.push({ path: relativePath, line, label });
  };

  for (const { regex, label } of VACUOUS_ASSERTIONS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(source)) !== null) report(match.index, label);
  }

  SELF_COMPARISON.lastIndex = 0;
  let comparison;
  while ((comparison = SELF_COMPARISON.exec(source)) !== null) {
    const actual = (comparison[1] ?? '').trim();
    const expected = (comparison[2] ?? '').trim();
    if (actual !== '' && actual === expected) {
      report(comparison.index, `expect(${actual}) is compared against itself`);
    }
  }

  const subjects = subjectSpecifiers(relativePath);
  MOCK_CALL.lastIndex = 0;
  let mocked;
  while ((mocked = MOCK_CALL.exec(source)) !== null) {
    if (!subjects.has(mocked[1])) continue;
    report(mocked.index, `${mocked[1]} is the unit under test; mocking it tests the mock`);
  }

  const helpers = assertingHelpers(text);
  for (const { start, body } of testBodies(text)) {
    if (!hasAssertion(body) && !callsAnAssertingHelper(body, helpers)) {
      report(start, 'this test asserts nothing');
    }
    for (const offset of swallowedFailures(body)) {
      report(start + offset, 'this catch hides the failure, so the test cannot fail here');
    }
  }

  return findings;
}

export function scanTestFile(relativePath, text) {
  if (EXEMPT_FILES.has(relativePath)) return [];
  return collectFindings(relativePath, text).sort((a, b) => a.line - b.line);
}

export function main(argv = process.argv.slice(2)) {
  const changedMode = argv.includes('--changed');
  const stagedMode = argv.includes('--staged');
  const files = stagedMode
    ? gitFiles('diff --cached --name-only --diff-filter=ACMRTUXB')
    : changedMode
      ? gitFiles('diff --name-only --diff-filter=ACMRTUXB HEAD')
      : walk(root);

  const findings = [];
  for (const file of files) {
    const relativePath = rel(file);
    if (EXEMPT_FILES.has(relativePath)) continue;
    findings.push(...scanTestFile(relativePath, readFileSync(file, 'utf8')));
  }

  console.log(`test integrity: scanned ${files.length} test file(s)`);
  if (findings.length > 0) {
    console.error('check:test-integrity FAIL');
    for (const finding of findings) {
      console.error(`- ${finding.path}:${finding.line} ${finding.label}`);
    }
    console.error(
      'Each finding is a test that reports green without constraining the behaviour it names. Fix the test, or add a `test-integrity-allow: <reason>` comment on the line above if the shape is deliberate.',
    );
    return 1;
  }
  console.log('check:test-integrity PASS');
  return 0;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) process.exit(main());
