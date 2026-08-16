#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC_DIRS = [join(ROOT, 'src')];
const EXTRA_FILES = [join(ROOT, 'popup.html'), join(ROOT, 'side_panel.html')];
const EXTENSIONS = new Set(['.ts', '.tsx', '.html', '.css']);

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
      results.push(full);
    }
  }
  return results;
}

const files = [];
for (const dir of SRC_DIRS) collectFiles(dir);
for (const f of EXTRA_FILES) {
  try {
    statSync(f);
    files.push(f);
  } catch {
    // file doesn't exist — skip
  }
}

let violations = 0;

for (const file of files) {
  const relPath = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (isExemptLine(line)) return;
    for (const { re, label } of COLOR_PATTERNS) {
      re.lastIndex = 0;
      const matches = line.match(re);
      if (matches) {
        for (const match of matches) {
          console.error(
            `[AP-02] ${relPath}:${idx + 1} — ${label} literal \`${match}\` found. ` +
              `Use a var(--agi-ext-*) design token instead.`,
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
    `\n[AP-02] ${violations} hardcoded color literal(s) found. Replace with var(--agi-ext-*) tokens.`,
  );
  process.exit(1);
}
