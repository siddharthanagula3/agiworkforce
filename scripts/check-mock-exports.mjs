#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const TEST_ROOTS = Object.freeze(['apps/web', 'packages/ui', 'packages/client']);
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:tsx?|jsx?)$/;
const SOURCE_EXTENSIONS = Object.freeze([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
]);
const WEB_ROOT = 'apps/web';
const WEB_ALIASES = Object.freeze([
  { prefix: '@shared/', target: `${WEB_ROOT}/shared` },
  { prefix: '@features/', target: `${WEB_ROOT}/features` },
  { prefix: '@/', target: WEB_ROOT },
]);

const CLOSE_FOR_OPEN = Object.freeze({ '(': ')', '{': '}', '[': ']' });

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function relFromRoot(repoRoot, absolutePath) {
  return toPosixPath(path.relative(repoRoot, absolutePath));
}

function skipQuoted(text, index, quote) {
  let i = index + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

function skipTemplate(text, index) {
  let i = index + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === '`') return i + 1;
    if (text[i] === '$' && text[i + 1] === '{') {
      const closeIndex = scanBalanced(text, i + 1);
      i = closeIndex === -1 ? text.length : closeIndex + 1;
      continue;
    }
    i += 1;
  }
  return i;
}

export function scanBalanced(text, openIndex) {
  const openChar = text[openIndex];
  const closeChar = CLOSE_FOR_OPEN[openChar];
  if (!closeChar) throw new Error(`scanBalanced: unsupported opening character at ${openIndex}`);
  const stack = [closeChar];
  let i = openIndex + 1;
  while (i < text.length && stack.length > 0) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = skipQuoted(text, i, ch);
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i);
      i = newline === -1 ? text.length : newline + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') {
      stack.push(CLOSE_FOR_OPEN[ch]);
      i += 1;
      continue;
    }
    if (ch === ')' || ch === '}' || ch === ']') {
      if (stack[stack.length - 1] === ch) {
        stack.pop();
        i += 1;
        if (stack.length === 0) return i - 1;
        continue;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return -1;
}

function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = skipQuoted(text, i, ch);
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(text, i);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i);
      i = newline === -1 ? text.length : newline + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') {
      const end = scanBalanced(text, i);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (ch === ',') {
      parts.push(text.slice(start, i));
      i += 1;
      start = i;
      continue;
    }
    i += 1;
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function extractEntryKey(entry) {
  const stripped = entry.replace(/^(async\s+)?(\*\s*)?(get\s+|set\s+)?/, '');
  if (stripped.startsWith('...')) return { spread: true };
  if (stripped.startsWith('[')) return { computed: true };
  const quoted = stripped.match(/^(['"])((?:\\.|(?!\1).)*)\1/);
  if (quoted) return { key: quoted[2] };
  const identifier = stripped.match(/^([A-Za-z_$][\w$]*)/);
  if (identifier) return { key: identifier[1] };
  const numeric = stripped.match(/^([0-9]+(?:\.[0-9]+)?)/);
  if (numeric) return { key: numeric[1] };
  return { unknown: true };
}

/**
 * Parses the object literal a `vi.mock` factory returns and reports its
 * fixed key set. Returns null when the factory is not a statically fixed
 * object literal (a spread, a computed key, or an unparsable entry), which
 * callers must treat as "never flag".
 */
export function parseFactoryObjectKeys(objectContent) {
  const keys = new Set();
  for (const entry of splitTopLevel(objectContent)) {
    const parsed = extractEntryKey(entry);
    if (parsed.spread || parsed.computed || parsed.unknown) return null;
    keys.add(parsed.key);
  }
  return keys;
}

function findArrowObjectBody(factoryText) {
  const arrowIndex = factoryText.indexOf('=>');
  if (arrowIndex === -1) return null;
  let i = arrowIndex + 2;
  while (i < factoryText.length && /\s/.test(factoryText[i])) i += 1;
  if (factoryText[i] === '(') {
    const parenEnd = scanBalanced(factoryText, i);
    if (parenEnd === -1) return null;
    let j = i + 1;
    while (j < parenEnd && /\s/.test(factoryText[j])) j += 1;
    if (factoryText[j] !== '{') return null;
    const braceEnd = scanBalanced(factoryText, j);
    if (braceEnd === -1 || braceEnd !== parenEnd - 1) {
      if (braceEnd === -1) return null;
    }
    return factoryText.slice(j + 1, scanBalanced(factoryText, j));
  }
  if (factoryText[i] === '{') {
    return findReturnObjectBody(factoryText, i);
  }
  return null;
}

function findReturnObjectBody(factoryText, blockOpenIndex) {
  const blockEnd = scanBalanced(factoryText, blockOpenIndex);
  if (blockEnd === -1) return null;
  const blockBody = factoryText.slice(blockOpenIndex + 1, blockEnd);
  const returnMatch = blockBody.match(/\breturn\s*/);
  if (!returnMatch) return null;
  let i = returnMatch.index + returnMatch[0].length;
  if (blockBody[i] === '(') {
    const parenEnd = scanBalanced(blockBody, i);
    if (parenEnd === -1) return null;
    let j = i + 1;
    while (j < parenEnd && /\s/.test(blockBody[j])) j += 1;
    if (blockBody[j] !== '{') return null;
    return blockBody.slice(j + 1, scanBalanced(blockBody, j));
  }
  if (blockBody[i] !== '{') return null;
  const braceEnd = scanBalanced(blockBody, i);
  if (braceEnd === -1) return null;
  return blockBody.slice(i + 1, braceEnd);
}

/**
 * Extracts the returned object's raw source for a `vi.mock` factory
 * expression. Handles `() => ({...})`, `async () => ({...})`,
 * `() => { return {...}; }`, and `function() { return {...}; }`. Returns
 * null when the factory does not statically return an object literal.
 */
export function extractFactoryObjectSource(factoryText) {
  const trimmed = factoryText.trim();
  if (/^(async\s+)?function\b/.test(trimmed)) {
    const braceIndex = trimmed.indexOf('{');
    if (braceIndex === -1) return null;
    return findReturnObjectBody(trimmed, braceIndex);
  }
  return findArrowObjectBody(trimmed);
}

function parseStringLiteralAt(text, index) {
  const quote = text[index];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;
  let i = index + 1;
  let value = '';
  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\') {
      value += text[i + 1];
      i += 2;
      continue;
    }
    value += text[i];
    i += 1;
  }
  return { value, endIndex: i + 1 };
}

/**
 * Finds every `vi.mock(<specifier>, <factory>)` call in test source text.
 * Only calls with a string-literal first argument are considered; other
 * shapes (dynamic specifiers, no factory) are skipped.
 */
export function findMockFactoryCalls(text) {
  const calls = [];
  const callSite = /\bvi\.mock\s*\(/g;
  let match;
  while ((match = callSite.exec(text))) {
    const openParenIndex = match.index + match[0].length - 1;
    const closeParenIndex = scanBalanced(text, openParenIndex);
    if (closeParenIndex === -1) continue;
    const argsText = text.slice(openParenIndex + 1, closeParenIndex);
    let i = 0;
    while (i < argsText.length && /\s/.test(argsText[i])) i += 1;
    const literal = parseStringLiteralAt(argsText, i);
    if (!literal) continue;
    let j = literal.endIndex;
    while (j < argsText.length && /[\s,]/.test(argsText[j])) j += 1;
    const factoryText = argsText.slice(j);
    calls.push({ specifier: literal.value, factoryText, index: match.index });
  }
  return calls;
}

const IMPORT_ORIGINAL_PATTERN = /\bimportOriginal\b|\bimportActual\b/;

/**
 * Determines whether a `vi.mock` factory is analyzable: it must statically
 * return an object literal with a fixed, enumerable key set (no spread,
 * no computed keys). A factory spreading `importOriginal`/`importActual`,
 * or any other dynamic expression, is reported as not fixed so callers
 * never flag it.
 */
export function analyzeMockFactory(factoryText) {
  if (IMPORT_ORIGINAL_PATTERN.test(factoryText)) return { fixed: false };
  const objectSource = extractFactoryObjectSource(factoryText);
  if (objectSource === null) return { fixed: false };
  const keys = parseFactoryObjectKeys(objectSource);
  if (keys === null) return { fixed: false };
  return { fixed: true, keys };
}

const EXPORT_FUNCTION_CLASS =
  /^[ \t]*export\s+(?:abstract\s+)?(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_VARIABLE = /^[ \t]*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_DEFAULT = /^[ \t]*export\s+default\b/m;
const EXPORT_BRACE_BLOCK = /export\s*\{([^}]*)\}(?:\s*from\s*['"][^'"]*['"])?/g;

/**
 * Reads a module's own named-export surface with a light, non-executing
 * regex scan: `export function`, `export const`/`let`/`var`, `export
 * class`, `export default` (a named `export default function Foo` is only
 * importable as the default, so it registers `default`, not `Foo`), and
 * `export { ... }` re-export lists. Type-only exports (`export type`,
 * `export interface`) are intentionally excluded since a mock factory never
 * needs to satisfy them at runtime.
 */
export function extractNamedExports(sourceText) {
  const names = new Set();
  for (const match of sourceText.matchAll(EXPORT_FUNCTION_CLASS)) names.add(match[1]);
  for (const match of sourceText.matchAll(EXPORT_VARIABLE)) names.add(match[1]);
  if (EXPORT_DEFAULT.test(sourceText)) names.add('default');
  for (const match of sourceText.matchAll(EXPORT_BRACE_BLOCK)) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const aliased = trimmed.match(/^(?:type\s+)?([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (aliased) {
        names.add(aliased[2]);
        continue;
      }
      const plain = trimmed.match(/^(?:type\s+)?([A-Za-z_$][\w$]*)$/);
      if (plain) names.add(plain[1]);
    }
  }
  return names;
}

const IMPORT_STATEMENT =
  /import\s+(type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?(?:\*\s*as\s+([A-Za-z_$][\w$]*))?\s*from\s*(['"])((?:\\.|(?!\5).)*?)\5/g;

/**
 * Collects the runtime import specifiers a module file references, each
 * with the set of names it imports from that specifier (`default` for a
 * default import, real export names for named/aliased imports, and
 * property names accessed off a namespace import). `import type` clauses
 * are skipped since they carry no runtime dependency on the mock.
 */
export function extractImportsBySpecifier(sourceText) {
  const bySpecifier = new Map();
  for (const match of sourceText.matchAll(IMPORT_STATEMENT)) {
    const [, isTypeOnly, defaultName, namedBlock, namespaceName, , specifier] = match;
    if (isTypeOnly) continue;
    const names = bySpecifier.get(specifier) ?? new Set();
    if (defaultName) names.add('default');
    if (namedBlock) {
      for (const part of namedBlock.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const withoutType = trimmed.replace(/^type\s+/, '');
        if (withoutType !== trimmed) continue;
        const aliased = trimmed.match(/^([A-Za-z_$][\w$]*)\s+as\s+[A-Za-z_$][\w$]*$/);
        if (aliased) {
          names.add(aliased[1]);
          continue;
        }
        const plain = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
        if (plain) names.add(plain[1]);
      }
    }
    if (namespaceName) {
      const usage = new RegExp(`\\b${namespaceName}\\.([A-Za-z_$][\\w$]*)`, 'g');
      for (const usageMatch of sourceText.matchAll(usage)) names.add(usageMatch[1]);
    }
    bySpecifier.set(specifier, names);
  }
  return bySpecifier;
}

/**
 * Resolves an import specifier the way the test runner does: relative
 * paths against the importing file's directory, and apps/web's `@/`,
 * `@shared/`, `@features/` tsconfig/vitest aliases against the repo root.
 * Bare specifiers (node_modules packages, virtual modules) resolve to null
 * and are skipped by callers.
 */
export function resolveSpecifier(repoRoot, fromFileAbsolutePath, specifier) {
  let candidateBase = null;
  if (specifier.startsWith('.')) {
    candidateBase = path.resolve(path.dirname(fromFileAbsolutePath), specifier);
  } else {
    const fromRelative = relFromRoot(repoRoot, fromFileAbsolutePath);
    if (fromRelative.startsWith(`${WEB_ROOT}/`)) {
      for (const alias of WEB_ALIASES) {
        if (specifier.startsWith(alias.prefix)) {
          candidateBase = path.join(repoRoot, alias.target, specifier.slice(alias.prefix.length));
          break;
        }
      }
    }
  }
  if (candidateBase === null) return null;
  if (existsSync(candidateBase) && statSync(candidateBase).isFile()) return candidateBase;
  for (const suffix of SOURCE_EXTENSIONS) {
    const candidate = `${candidateBase}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function isTestFilePath(absolutePath) {
  return TEST_FILE_PATTERN.test(path.basename(absolutePath));
}

function readTextFile(absolutePath) {
  try {
    return readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }
}

const TEST_SUFFIX = /\.(?:test|spec)\.(?:tsx?|jsx?)$/;

function fileStem(basename) {
  return basename.replace(/\.[^.]+$/, '');
}

/**
 * A same-directory candidate counts as "the module under test" only when it
 * shares the test file's naming convention: `Subject.tsx` for
 * `Subject.test.tsx` or `Subject.variant.test.tsx`, or `route.ts` for
 * `route.test.ts` / `route.variant.test.ts`. This mirrors how the repo
 * actually pairs a subject with its test file, so a directory holding many
 * unrelated modules (a `lib/server/**` utility folder, for example) does not
 * turn every sibling into a false "required by".
 */
function isCoLocatedSubjectStem(testBasename, candidateBasename) {
  const testStem = fileStem(testBasename.replace(TEST_SUFFIX, ''));
  const candidateStem = fileStem(candidateBasename);
  return testStem === candidateStem || testStem.startsWith(`${candidateStem}.`);
}

/**
 * Finds candidate "module under test" files for a test file: every import
 * specifier the test resolves to a real, non-test repository file, plus
 * any co-located, name-matching non-test file in the test file's own
 * directory.
 */
export function findSubjectFiles(repoRoot, testFileAbsolutePath, testText, mockedSpecifiers) {
  const subjects = new Set();
  const importSpecifiers = new Set();
  const importPattern = /\bfrom\s*(['"])((?:\\.|(?!\1).)*?)\1/g;
  for (const match of testText.matchAll(importPattern)) importSpecifiers.add(match[2]);
  for (const specifier of importSpecifiers) {
    if (mockedSpecifiers.has(specifier)) continue;
    const resolved = resolveSpecifier(repoRoot, testFileAbsolutePath, specifier);
    if (resolved && !isTestFilePath(resolved)) subjects.add(resolved);
  }

  const testDir = path.dirname(testFileAbsolutePath);
  let siblingNames = [];
  try {
    siblingNames = execFileSync(
      'git',
      [
        '-C',
        repoRoot,
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        toPosixPath(path.relative(repoRoot, testDir)),
      ],
      {
        encoding: 'utf8',
      },
    )
      .split('\n')
      .filter(Boolean);
  } catch {
    siblingNames = [];
  }
  const testBasename = path.basename(testFileAbsolutePath);
  for (const relative of siblingNames) {
    const absolute = path.join(repoRoot, relative);
    if (path.dirname(absolute) !== testDir) continue;
    if (!/\.(?:ts|tsx|js|jsx)$/.test(absolute)) continue;
    if (isTestFilePath(absolute)) continue;
    if (!isCoLocatedSubjectStem(testBasename, path.basename(absolute))) continue;
    subjects.add(absolute);
  }

  return [...subjects];
}

/**
 * Expands relevance one level past `findSubjectFiles`: for each subject
 * file, resolves that subject's own direct import specifiers (first-party
 * files only, resolved the same way any other import is) and returns the
 * resulting files. A subject that reaches the mocked module only through one
 * of its own imports (a route importing a processor that imports the mocked
 * module, for example) is picked up through this set.
 */
export function findTransitiveImportFiles(repoRoot, subjectFiles) {
  const subjectSet = new Set(subjectFiles);
  const transitive = new Set();
  for (const subjectFile of subjectFiles) {
    const bySpecifier = loadImportsBySpecifier(subjectFile);
    for (const specifier of bySpecifier.keys()) {
      const resolved = resolveSpecifier(repoRoot, subjectFile, specifier);
      if (!resolved) continue;
      if (isTestFilePath(resolved)) continue;
      if (subjectSet.has(resolved)) continue;
      transitive.add(resolved);
    }
  }
  return [...transitive];
}

const exportsCache = new Map();
function loadExports(absolutePath) {
  if (exportsCache.has(absolutePath)) return exportsCache.get(absolutePath);
  const text = readTextFile(absolutePath);
  const names = text === null ? new Set() : extractNamedExports(text);
  exportsCache.set(absolutePath, names);
  return names;
}

const importsCache = new Map();
function loadImportsBySpecifier(absolutePath) {
  if (importsCache.has(absolutePath)) return importsCache.get(absolutePath);
  const text = readTextFile(absolutePath);
  const bySpecifier = text === null ? new Map() : extractImportsBySpecifier(text);
  importsCache.set(absolutePath, bySpecifier);
  return bySpecifier;
}

/**
 * Checks one test file for `vi.mock` factories that omit a real named
 * export of the mocked module which the module under test, or a file the
 * module under test directly imports, actually imports from that same
 * specifier.
 */
export function checkTestFile(repoRoot, testFileAbsolutePath) {
  const testText = readTextFile(testFileAbsolutePath);
  if (testText === null) return [];
  const mockCalls = findMockFactoryCalls(testText);
  if (mockCalls.length === 0) return [];

  const mockedSpecifiers = new Set(mockCalls.map((call) => call.specifier));
  const findings = [];

  for (const call of mockCalls) {
    const analysis = analyzeMockFactory(call.factoryText);
    if (!analysis.fixed) continue;

    const mockedAbsolutePath = resolveSpecifier(repoRoot, testFileAbsolutePath, call.specifier);
    if (!mockedAbsolutePath) continue;

    const realExports = loadExports(mockedAbsolutePath);
    if (realExports.size === 0) continue;

    const subjectFiles = findSubjectFiles(
      repoRoot,
      testFileAbsolutePath,
      testText,
      mockedSpecifiers,
    );
    const relevantFiles = [...subjectFiles, ...findTransitiveImportFiles(repoRoot, subjectFiles)];
    const requiredNames = new Map();
    for (const relevantFile of relevantFiles) {
      const bySpecifier = loadImportsBySpecifier(relevantFile);
      for (const [specifier, names] of bySpecifier) {
        const relevantMockedPath = resolveSpecifier(repoRoot, relevantFile, specifier);
        if (relevantMockedPath !== mockedAbsolutePath) continue;
        for (const name of names) {
          if (!requiredNames.has(name)) requiredNames.set(name, new Set());
          requiredNames.get(name).add(relFromRoot(repoRoot, relevantFile));
        }
      }
    }

    const missing = [...requiredNames.keys()]
      .filter((name) => realExports.has(name) && !analysis.keys.has(name))
      .sort();
    if (missing.length === 0) continue;

    findings.push({
      file: relFromRoot(repoRoot, testFileAbsolutePath),
      specifier: call.specifier,
      module: relFromRoot(repoRoot, mockedAbsolutePath),
      missing,
      requiredBy: missing.reduce((acc, name) => {
        for (const subject of requiredNames.get(name)) acc.add(subject);
        return acc;
      }, new Set()),
    });
  }

  return findings;
}

export function discoverTestFiles(repoRoot = REPO_ROOT, roots = TEST_ROOTS) {
  const pathspecs = roots.flatMap((root) => [
    `${root}/**/*.test.ts`,
    `${root}/**/*.test.tsx`,
    `${root}/**/*.spec.ts`,
    `${root}/**/*.spec.tsx`,
  ]);
  let output;
  try {
    output = execFileSync(
      'git',
      [
        '-C',
        repoRoot,
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        ...pathspecs,
      ],
      { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    );
  } catch (error) {
    throw new Error(`Cannot enumerate test files with git ls-files: ${error.message}`);
  }
  return [...new Set(output.split('\0').filter(Boolean))]
    .sort()
    .map((relativePath) => path.join(repoRoot, relativePath));
}

export function runMockExportsGuard({
  repoRoot = REPO_ROOT,
  roots = TEST_ROOTS,
  details = false,
} = {}) {
  const testFiles = discoverTestFiles(repoRoot, roots);
  const findings = testFiles.flatMap((testFile) => checkTestFile(repoRoot, testFile));
  findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.specifier.localeCompare(right.specifier),
  );

  const lines =
    findings.length === 0
      ? [`Mock-export guard passed (${testFiles.length} test file(s) scanned).`]
      : [
          `Mock-export guard FAILED: ${findings.length} vi.mock() factory(ies) omit a real export the module under test uses.`,
          '',
          ...findings.map((finding) => {
            const base = `${finding.file}: vi.mock('${finding.specifier}') is missing ${finding.missing.join(', ')}`;
            if (!details) return base;
            return `${base} (module: ${finding.module}; required by: ${[...finding.requiredBy].sort().join(', ')})`;
          }),
        ];

  return { findings, testFileCount: testFiles.length, output: lines.join('\n') };
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/check-mock-exports.mjs [--details]',
      '',
      '  --details  print the resolved module and requiring subject file',
      '',
    ].join('\n'),
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
  } else {
    const unknown = args.filter((arg) => arg !== '--details');
    if (unknown.length > 0) {
      process.stderr.write(`Unknown argument(s): ${unknown.join(', ')}\n`);
      process.exitCode = 2;
    } else {
      try {
        const result = runMockExportsGuard({ details: args.includes('--details') });
        const stream = result.findings.length === 0 ? process.stdout : process.stderr;
        stream.write(`${result.output}\n`);
        if (result.findings.length > 0) process.exitCode = 1;
      } catch (error) {
        process.stderr.write(`Mock-export guard could not run: ${error.message}\n`);
        process.exitCode = 2;
      }
    }
  }
}
