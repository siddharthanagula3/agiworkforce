#!/usr/bin/env node

// Every cookie this product sets, found by sweeping the tree rather than by a
// list, and measured one write at a time. A cookie that carries a session or
// the proof bound to one is readable by script without HttpOnly, sent in the
// clear without Secure, attached to somebody else's form post without SameSite,
// and reachable from a sibling host the moment a Domain widens it.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const COOKIE_ROOTS = [
  'apps/web/app',
  'apps/web/lib',
  'apps/web/features',
  'apps/web/middleware.ts',
  'packages/platform/identity/src',
];

/** A tree with no cookie write means the sweep stopped finding them, not that none exist. */
export const MINIMUM_COOKIE_WRITES = 5;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', '__tests__', '__mocks__']);

const OBJECT_WRITE = /(?:cookieStore|cookies\(\)|\.cookies)\s*\.set\s*\(/g;
const STRING_LITERAL = /(['"`])((?:(?!\1)[^\n])*)\1/g;
const COOKIE_ATTRIBUTE = /;\s*(Path|HttpOnly|Secure|SameSite|Max-Age|Domain|Expires)\b/i;

/** `<name>=<value>` before the first attribute is what makes a string a Set-Cookie value. */
const COOKIE_HEADER_SHAPE = /^[^;]*=[^;]*;/;

const REQUIRED = [
  { name: 'HttpOnly', match: /\bhttpOnly\s*:|;\s*HttpOnly\b/i },
  { name: 'Secure', match: /\bsecure\s*:|;\s*Secure\b/i },
  { name: 'SameSite', match: /\bsameSite\s*:|;\s*SameSite\s*=/i },
  { name: 'Path', match: /\bpath\s*:|;\s*Path\s*=/i },
];

const WEAKENED = [
  { name: 'httpOnly: false', match: /\bhttpOnly\s*:\s*false\b/ },
  { name: 'secure: false', match: /\bsecure\s*:\s*false\b/ },
  { name: "sameSite: 'none'", match: /\bsameSite\s*:\s*['"]none['"]/i },
  { name: 'SameSite=None', match: /;\s*SameSite\s*=\s*None\b/i },
];

const WIDENED = /\bdomain\s*:|;\s*Domain\s*=/i;

const DELETION = /\bmaxAge\s*:\s*0\b|;\s*Max-Age\s*=\s*0\b/;

function isTestPath(relativePath) {
  return (
    /\.(test|spec)\.[cm]?tsx?$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|e2e)\//.test(relativePath)
  );
}

export function sourceFiles(repoRoot, roots) {
  const found = [];
  const walk = (relativePath) => {
    const absolute = path.join(repoRoot, relativePath);
    let stats;
    try {
      stats = statSync(absolute);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (!stats.isDirectory()) {
      if (SOURCE_EXTENSIONS.has(path.extname(relativePath)) && !isTestPath(relativePath)) {
        found.push(relativePath);
      }
      return;
    }
    for (const entry of readdirSync(absolute).sort()) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      walk(path.posix.join(relativePath, entry));
    }
  };
  for (const root of roots) walk(root);
  return found;
}

function balanced(source, start, open, close) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

/**
 * Almost no cookie carries its attributes at the call site: they live in a
 * shared options object one line above. Inlining that object is what makes the
 * per-write measurement honest instead of a search of the whole file.
 */
function inlineLocalObjects(fragment, source, depth = 0) {
  if (depth >= 3) return fragment;
  let resolved = fragment;
  const names = new Set();
  for (const match of fragment.matchAll(
    /(?:\.{3}|,\s*|\(\s*)([A-Z][A-Za-z0-9_]*|[a-z][A-Za-z0-9_]*)\s*(?=[,)}\s])/g,
  )) {
    names.add(match[1]);
  }
  for (const name of names) {
    const declaration = new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]+)?=\\s*\\{`).exec(source);
    if (!declaration) continue;
    const body = balanced(source, declaration.index + declaration[0].length - 1, '{', '}');
    resolved = resolved.split(name).join(body);
  }
  return resolved === fragment ? fragment : inlineLocalObjects(resolved, source, depth + 1);
}

export function cookieWritesIn(source) {
  const writes = [];

  for (const match of source.matchAll(OBJECT_WRITE)) {
    const start = match.index + match[0].length - 1;
    writes.push({
      kind: 'object',
      text: inlineLocalObjects(balanced(source, start, '(', ')'), source),
    });
  }

  for (const match of source.matchAll(STRING_LITERAL)) {
    const literal = match[2];
    if (!COOKIE_ATTRIBUTE.test(literal) || !COOKIE_HEADER_SHAPE.test(literal)) continue;
    writes.push({ kind: 'header', text: literal });
  }

  return writes;
}

export function checkSessionCookieAttributes(repoRoot = REPO_ROOT, options = {}) {
  const roots = options.roots ?? COOKIE_ROOTS;
  const minimum = options.minimumWrites ?? MINIMUM_COOKIE_WRITES;
  const errors = [];
  const report = { files: 0, writes: 0, deletions: 0 };

  for (const relativePath of sourceFiles(repoRoot, roots)) {
    const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
    const writes = cookieWritesIn(source);
    if (writes.length === 0) continue;
    report.files += 1;

    for (const write of writes) {
      report.writes += 1;
      const where = `${relativePath}: ${write.text.replace(/\s+/g, ' ').slice(0, 90)}`;

      if (WIDENED.test(write.text)) {
        errors.push(
          `${where}: widens the cookie to a Domain, so every sibling host of this deployment receives it.`,
        );
      }

      if (DELETION.test(write.text)) {
        report.deletions += 1;
        if (!/\bpath\s*:|;\s*Path\s*=/i.test(write.text)) {
          errors.push(`${where}: clears a cookie without naming its Path, so the cookie survives.`);
        }
        continue;
      }

      const missing = REQUIRED.filter((flag) => !flag.match.test(write.text)).map(
        (flag) => flag.name,
      );
      if (missing.length > 0) {
        errors.push(`${where}: sets a cookie without ${missing.join(', ')}.`);
      }

      for (const weak of WEAKENED) {
        if (weak.match.test(write.text)) {
          errors.push(`${where}: sets ${weak.name}, which is the attribute turned off, not set.`);
        }
      }
    }
  }

  if (report.writes < minimum) {
    errors.push(
      `the sweep found ${report.writes} cookie write(s) under ${roots.join(', ')} and expected at least ` +
        `${minimum}: the patterns no longer match how this product writes cookies.`,
    );
  }

  return { errors, report };
}

function main() {
  const { errors, report } = checkSessionCookieAttributes();

  if (errors.length > 0) {
    console.error('Session cookie attribute check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-session-cookie-attributes: OK (${report.writes} cookie write(s) in ${report.files} file(s), ` +
      `${report.deletions} of them clearing a cookie)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
