#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;

const SRC_DIRS = [
  join(ROOT, 'app'),
  join(ROOT, 'components'),
  join(ROOT, 'lib'),
  join(ROOT, 'features'),
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

const EXCLUDE_DIRS = new Set([
  join(ROOT, '__tests__'),
  join(ROOT, '.next'),
  join(ROOT, 'node_modules'),
  join(ROOT, 'scripts'),
]);

const EXCLUDE_FILES = new Set([
  join(ROOT, 'app', 'globals.css'),
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
];

function stripHtmlEntities(line) {
  return line.replace(/&#[0-9a-fA-F]+;/g, '');
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
      if (!EXCLUDE_DIRS.has(full)) collectFiles(full);
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      if (!EXCLUDE_FILES.has(full)) results.push(full);
    }
  }
  return results;
}

const allFiles = [];
for (const dir of SRC_DIRS) {
  try {
    statSync(dir);
    allFiles.push(...collectFiles(dir));
  } catch {
    // directory doesn't exist — skip
  }
}

let violations = 0;

for (const file of allFiles) {
  const relPath = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (isExemptLine(line)) return;
    const stripped = stripHtmlEntities(line);
    for (const { re, label } of COLOR_PATTERNS) {
      re.lastIndex = 0;
      const matches = stripped.match(re);
      if (matches) {
        for (const match of matches) {
          console.error(
            `[AP-02] ${relPath}:${idx + 1} — ${label} literal \`${match}\` found. ` +
              `Use a Tailwind class (bg-primary, text-foreground, etc.) OR a CSS custom property (var(--color-primary)).`,
          );
          violations++;
        }
      }
    }
  });
}

if (violations === 0) {
  console.log('[AP-02] No hardcoded color literals found.');
  process.exit(0);
} else {
  console.error(
    `\n[AP-02] ${violations} hardcoded color literal(s) found. ` +
      `Replace with Tailwind classes or CSS custom properties (var(--color-*)).`,
  );
  process.exit(1);
}
