#!/usr/bin/env node
/* global URL, console, process */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC_DIRS = [join(ROOT, 'src')];
const EXTENSIONS = new Set(['.ts', '.tsx', '.html', '.css']);

// Lower bound on the file count this guard must reach. It shipped green while
// scanning zero files, because collectFiles() recursed but discarded the
// recursion's result; a guard that can pass on nothing is worse than no guard.
const MIN_SCANNED_FILES = 20;

/**
 * Files that still carry raw colour literals, with the exact number each is
 * allowed. A new literal in a listed file, or any literal in an unlisted file,
 * fails. Removing one fails too, with the number to lower it to, so the debt
 * can only ever shrink.
 */
const KNOWN_VIOLATIONS = {
  'src/content.ts': 6,
  'src/features/cloud-bridge/InviteCodeModal.ts': 4,
  'src/options.ts': 3,
  'src/side_panel.ts': 6,
};

const EXCLUDE_DIRS = new Set([
  join(ROOT, '__tests__'),
  join(ROOT, 'dist'),
  join(ROOT, 'scripts'),
  join(ROOT, 'node_modules'),
]);

const COLOR_PATTERNS = [
  { re: /#[0-9a-fA-F]{3,8}\b/g, label: 'hex color' },
  { re: /rgba?\s*\(/g, label: 'rgb/rgba()' },
  { re: /hsla?\s*\(/g, label: 'hsl/hsla()' },
];

const EXEMPT_LINE_RE = [
  /^\s*\/\//, // single-line TS/JS comment
  /^\s*\*/, // JSDoc / block comment continuation
  /^\s*\/\*/, // block comment open
  /<!--/, // HTML comment
  /theme-color/, // <meta name="theme-color" ...>
  /color-scheme/, // <meta name="color-scheme" ...>
  /<meta[^>]+content/, // any <meta> with content attribute (covers theme-color meta)
];

// A literal used as the fallback arm of a design token, var(--token, #hex).
// is the token being used correctly, not a bypass of it.
const TOKEN_FALLBACK_RE = /var\(\s*--[\w-]+\s*,[^)]*\)/g;

function stripTokenFallbacks(line) {
  return line.replace(TOKEN_FALLBACK_RE, 'var()');
}

function isExemptLine(line) {
  return EXEMPT_LINE_RE.some((re) => re.test(line));
}

function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDE_DIRS.has(full)) results.push(...collectFiles(full));
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      results.push(full);
    }
  }
  return results;
}

const files = [];
for (const dir of SRC_DIRS) files.push(...collectFiles(dir));

const failures = [];
const foundPerFile = new Map();

for (const file of files) {
  const relPath = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (isExemptLine(line)) return;
    const scannable = stripTokenFallbacks(line);
    for (const { re, label } of COLOR_PATTERNS) {
      re.lastIndex = 0;
      for (const match of scannable.match(re) ?? []) {
        foundPerFile.set(relPath, (foundPerFile.get(relPath) ?? 0) + 1);
        if (!Object.hasOwn(KNOWN_VIOLATIONS, relPath)) {
          failures.push(
            `[AP-02] ${relPath}:${idx + 1}, ${label} literal \`${match}\` found. ` +
              `Use a var(--agi-ext-*) design token instead.`,
          );
        }
      }
    }
  });
}

if (files.length < MIN_SCANNED_FILES) {
  console.error(
    `[AP-02] scanned only ${files.length} file(s), expected at least ${MIN_SCANNED_FILES}. ` +
      'The file walker is broken, this guard is not checking anything.',
  );
  process.exit(1);
}

for (const [relPath, allowed] of Object.entries(KNOWN_VIOLATIONS)) {
  const found = foundPerFile.get(relPath) ?? 0;
  if (found > allowed) {
    failures.push(
      `[AP-02] ${relPath}, ${found} colour literal(s), ${allowed} allowed. ` +
        'Use a var(--agi-ext-*) design token for the new one.',
    );
  } else if (found < allowed) {
    failures.push(
      `[AP-02] ${relPath}, ${found} colour literal(s) remain but ${allowed} are allowed. ` +
        `Lower KNOWN_VIOLATIONS['${relPath}'] to ${found} so the debt cannot grow back.`,
    );
  }
}

if (failures.length === 0) {
  console.log(
    `[AP-02] scanned ${files.length} files. No unapproved colour literals; ` +
      `${[...foundPerFile.values()].reduce((sum, n) => sum + n, 0)} known literal(s) remain.`,
  );
  process.exit(0);
}

for (const failure of failures) console.error(failure);
console.error(`\n[AP-02] ${failures.length} colour-literal failure(s).`);
process.exit(1);
