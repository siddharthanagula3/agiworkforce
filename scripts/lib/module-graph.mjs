/**
 * Shared TypeScript/JavaScript import-graph utilities for repository guardrails.
 *
 * The point of this module is to replace lexical "does the string appear
 * anywhere in the tree" checks with a real reachability walk from a surface's
 * entry points. A lexical check reports green for a module that no entry point
 * can ever load; a reachability walk cannot.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

export const IGNORED_DIRECTORY_NAMES = new Set([
  '.cache',
  '.expo',
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  '.vscode-test',
  'Pods',
  'android',
  'build',
  'coverage',
  'dist',
  'dist-web',
  'ios',
  'node_modules',
  'out',
  'playwright-report',
  'target',
  'test-results',
]);

const TEST_DIRECTORY_PATTERN =
  /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|__snapshots__|e2e|wdio|detox|playwright|archive|fixtures|test|tests)(?:\/|$)/;
const TEST_FILE_PATTERN = /\.(?:test|spec|stories|bench|node-test)\.[cm]?[jt]sx?$/;

/** True for files that are test scaffolding rather than shipped product code. */
export function isTestPath(relativePath) {
  const posix = relativePath.split(path.sep).join('/');
  return TEST_DIRECTORY_PATTERN.test(posix) || TEST_FILE_PATTERN.test(posix);
}

export function isSourceFile(filePath) {
  if (filePath.endsWith('.d.ts')) return false;
  return SOURCE_EXTENSIONS.includes(path.extname(filePath));
}

/** Recursively list source files under `directory` (absolute paths). */
export function listSourceFiles(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && isSourceFile(fullPath)) files.push(fullPath);
  }
  return files;
}

/**
 * Remove comments from JS/TS source while preserving string, template and
 * regular-expression literals, so that a commented-out import never
 * contributes a phantom edge to the graph.
 */
export function stripComments(source) {
  const chunks = [];
  const push = (text) => {
    chunks.push(text);
  };

  // The character (or identifier) most recently emitted, used to tell a regular
  // expression literal apart from a division operator.
  let previousMeaningful = '';
  let index = 0;
  const templateDepth = [];

  const regexAllowedBefore = new Set([
    '',
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
    '~',
    '^',
    '<',
    '>',
    'return',
    'typeof',
    'case',
    'in',
    'of',
    'do',
    'else',
    'yield',
    'await',
  ]);

  // Copies a quoted run verbatim starting at `index` (the opening quote), so
  // that `'// not a comment'` survives. Returns the index after the close.
  const copyQuoted = (quote) => {
    let cursor = index + 1;
    let literal = quote;
    while (cursor < source.length) {
      const current = source[cursor];
      if (current === '\\') {
        literal += current + (source[cursor + 1] ?? '');
        cursor += 2;
        continue;
      }
      literal += current;
      cursor += 1;
      if (current === quote || current === '\n') break;
    }
    push(literal);
    return cursor;
  };

  // Copies a template-literal run; stops at the close backtick or at `${`,
  // which hands control back so the embedded expression is scanned normally.
  const copyTemplateRun = (startIndex) => {
    let cursor = startIndex;
    let literal = '';
    while (cursor < source.length) {
      const current = source[cursor];
      if (current === '\\') {
        literal += current + (source[cursor + 1] ?? '');
        cursor += 2;
        continue;
      }
      if (current === '`') {
        literal += '`';
        cursor += 1;
        templateDepth.pop();
        break;
      }
      if (current === '$' && source[cursor + 1] === '{') {
        literal += '${';
        cursor += 2;
        break;
      }
      literal += current;
      cursor += 1;
    }
    push(literal);
    return cursor;
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      let cursor = index;
      while (cursor < source.length && source[cursor] !== '\n') cursor += 1;
      push(' '.repeat(cursor - index));
      index = cursor;
      continue;
    }

    if (char === '/' && next === '*') {
      let cursor = index + 2;
      let blank = '  ';
      while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) {
        blank += source[cursor] === '\n' ? '\n' : ' ';
        cursor += 1;
      }
      push(blank + '  ');
      index = Math.min(cursor + 2, source.length);
      continue;
    }

    if (char === "'" || char === '"') {
      index = copyQuoted(char);
      previousMeaningful = char;
      continue;
    }

    if (char === '`') {
      push('`');
      templateDepth.push(true);
      index = copyTemplateRun(index + 1);
      previousMeaningful = '`';
      continue;
    }

    if (char === '}' && templateDepth.length > 0) {
      push('}');
      index = copyTemplateRun(index + 1);
      previousMeaningful = '`';
      continue;
    }

    if (char === '/' && regexAllowedBefore.has(previousMeaningful)) {
      let cursor = index + 1;
      let inClass = false;
      let terminated = false;
      let literal = '/';
      while (cursor < source.length) {
        const current = source[cursor];
        if (current === '\n') break;
        if (current === '\\') {
          literal += current + (source[cursor + 1] ?? '');
          cursor += 2;
          continue;
        }
        literal += current;
        cursor += 1;
        if (current === '[') inClass = true;
        else if (current === ']') inClass = false;
        else if (current === '/' && !inClass) {
          terminated = true;
          break;
        }
      }
      if (terminated) {
        push(literal);
        index = cursor;
        previousMeaningful = '/';
        continue;
      }
    }

    if (/[A-Za-z0-9_$]/.test(char)) {
      let cursor = index;
      while (cursor < source.length && /[A-Za-z0-9_$]/.test(source[cursor])) cursor += 1;
      const word = source.slice(index, cursor);
      push(word);
      previousMeaningful = word;
      index = cursor;
      continue;
    }

    push(char);
    if (!/\s/.test(char)) previousMeaningful = char;
    index += 1;
  }

  return chunks.join('');
}

const SPECIFIER_PATTERNS = [
  // `import x from 'm'`, `import type {x} from 'm'`, `export * from 'm'`,
  // `export { x } from 'm'` -- every binding form ends in `from '<specifier>'`.
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  // Side-effect import: `import './m'`
  /\bimport\s+['"]([^'"\n]+)['"]/g,
  // Dynamic `import('m')`. Template-literal specifiers cannot be resolved
  // statically and are reported by the caller instead of silently dropped.
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  // `require('m')` and TS `import x = require('m')`
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  // `new Worker(new URL('./m', import.meta.url))`
  /\bnew\s+URL\s*\(\s*['"]([^'"\n]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
];

/** All module specifiers referenced by a source string. */
export function parseSpecifiers(source) {
  const stripped = stripComments(source);
  const specifiers = new Set();
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of stripped.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return specifiers;
}

// Resolution touches the filesystem thousands of times per surface. Cache one
// directory listing per parent so a whole-repo walk stays under a second.
const directoryEntryCache = new Map();

function directoryEntries(directory) {
  let cached = directoryEntryCache.get(directory);
  if (cached) return cached;
  cached = new Map();
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      cached.set(entry.name, entry.isDirectory() ? 'directory' : 'file');
    }
  } catch {
    // Missing or unreadable directory: an empty listing is the right answer.
  }
  directoryEntryCache.set(directory, cached);
  return cached;
}

/** Clears the resolver's filesystem cache (tests mutate temp trees). */
export function resetModuleGraphCache() {
  directoryEntryCache.clear();
}

function entryKind(candidate) {
  return directoryEntries(path.dirname(candidate)).get(path.basename(candidate)) ?? null;
}

function resolveAsFile(candidate) {
  if (entryKind(candidate) === 'file' && isSourceFile(candidate)) return candidate;
  for (const extension of SOURCE_EXTENSIONS) {
    const withExtension = candidate + extension;
    if (entryKind(withExtension) === 'file') return withExtension;
  }
  // TypeScript NodeNext writes ./x.js for ./x.ts
  const jsMatch = candidate.match(/^(.*)\.(c|m)?js$/);
  if (jsMatch) {
    const prefix = jsMatch[1];
    const modifier = jsMatch[2] ?? '';
    for (const extension of [`.${modifier}ts`, '.ts', '.tsx']) {
      const rewritten = prefix + extension;
      if (entryKind(rewritten) === 'file') return rewritten;
    }
  }
  return null;
}

function resolveAsDirectory(candidate) {
  if (entryKind(candidate) !== 'directory') return null;
  for (const extension of SOURCE_EXTENSIONS) {
    const indexFile = path.join(candidate, 'index' + extension);
    if (entryKind(indexFile) === 'file') return indexFile;
  }
  return null;
}

/**
 * Build a specifier resolver.
 *
 * `aliases` maps an alias to an absolute filesystem target. A trailing `/*`
 * marks a prefix alias (`@/*` -> `<surface>/src`); anything else is an exact
 * package alias that may still be suffixed with a subpath.
 */
export function createResolver(aliases = {}) {
  const entries = Object.entries(aliases).sort(([a], [b]) => b.length - a.length);

  return function resolve(specifier, fromFile) {
    if (specifier.startsWith('.')) {
      const absolute = path.resolve(path.dirname(fromFile), specifier);
      return resolveAsFile(absolute) ?? resolveAsDirectory(absolute);
    }

    for (const [alias, target] of entries) {
      if (alias.endsWith('/*')) {
        const prefix = alias.slice(0, -1);
        if (specifier.startsWith(prefix)) {
          const absolute = path.join(target, specifier.slice(prefix.length));
          const resolved = resolveAsFile(absolute) ?? resolveAsDirectory(absolute);
          if (resolved) return resolved;
        }
        continue;
      }
      if (specifier === alias) {
        return resolveAsFile(target) ?? resolveAsDirectory(target);
      }
      if (specifier.startsWith(alias + '/')) {
        const absolute = path.join(target, specifier.slice(alias.length + 1));
        const resolved = resolveAsFile(absolute) ?? resolveAsDirectory(absolute);
        if (resolved) return resolved;
      }
    }

    return null;
  };
}

/** Walk the import graph and return every file reachable from `entries`. */
export function collectReachable(entries, resolve, options = {}) {
  const { onEdge } = options;
  const reachable = new Set();
  const stack = entries.filter((entry) => fs.existsSync(entry)).map((entry) => path.resolve(entry));

  while (stack.length > 0) {
    const file = stack.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);

    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const specifier of parseSpecifiers(source)) {
      const resolved = resolve(specifier, file);
      if (!resolved) continue;
      const normalized = path.resolve(resolved);
      if (onEdge) onEdge(file, normalized, specifier);
      if (!reachable.has(normalized)) stack.push(normalized);
    }
  }

  return reachable;
}

/**
 * Map every workspace package name to its source entry point so cross-package
 * imports keep the walk connected instead of stopping at a bare specifier.
 */
export function collectWorkspacePackageAliases(repoRoot, roots = ['packages', 'services']) {
  const aliases = {};

  const visit = (directory, depth) => {
    if (depth > 3 || !fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
      const packageDirectory = path.join(directory, entry.name);
      const manifestPath = path.join(packageDirectory, 'package.json');
      if (fs.existsSync(manifestPath)) {
        let manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch {
          manifest = null;
        }
        if (manifest?.name) {
          const sourceDirectory = path.join(packageDirectory, 'src');
          if (fs.existsSync(sourceDirectory)) {
            aliases[manifest.name] = sourceDirectory;
          }
        }
        continue;
      }
      visit(packageDirectory, depth + 1);
    }
  };

  for (const root of roots) visit(path.join(repoRoot, root), 0);
  return aliases;
}

export function toRepoRelative(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}
