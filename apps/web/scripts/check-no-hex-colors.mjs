#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

const args = process.argv.slice(2);

function flagValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const WRITE_BASELINE = args.includes('--write-baseline');
const ROOT = resolve(flagValue('--root') ?? new URL('..', import.meta.url).pathname);
const BASELINE_PATH = resolve(
  flagValue('--baseline') ?? join(ROOT, 'scripts', '.no-hex-baseline.json'),
);

const SRC_DIRS = ['app', 'components', 'lib', 'features'].map((dir) => join(ROOT, dir));

const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

const EXCLUDE_DIRS = new Set(
  ['__tests__', '.next', 'node_modules', 'scripts'].map((dir) => join(ROOT, dir)),
);

const EXCLUDE_FILES = new Set([join(ROOT, 'app', 'globals.css')]);

const EXCLUDE_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;

const COLOR_PATTERNS = [
  { re: /#[0-9a-fA-F]{3,8}\b/g, rule: 'hex', label: 'hex color' },
  { re: /rgba?\s*\(/g, rule: 'rgb', label: 'rgb/rgba()' },
  { re: /hsla?\s*\(/g, rule: 'hsl', label: 'hsl/hsla()' },
];

const EXEMPT_LINE_RE = [
  /^\s*\/\//,
  /^\s*\*/,
  /^\s*\/\*/,
  /<!--/,
  /theme-color/,
  /color-scheme/,
  /\b(?:theme_color|background_color)\b/,
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
    if (statSync(full).isDirectory()) {
      if (!EXCLUDE_DIRS.has(full) && entry !== 'node_modules') {
        results.push(...collectFiles(full));
      }
      continue;
    }
    if (!EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) continue;
    if (EXCLUDE_FILES.has(full) || EXCLUDE_FILE_RE.test(entry)) continue;
    results.push(full);
  }
  return results;
}

function scan() {
  const hits = [];
  for (const dir of SRC_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of collectFiles(dir)) {
      const relPath = relative(ROOT, file);
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, idx) => {
          if (isExemptLine(line)) return;
          const stripped = stripHtmlEntities(line);
          for (const { re, rule, label } of COLOR_PATTERNS) {
            re.lastIndex = 0;
            for (const match of stripped.match(re) ?? []) {
              hits.push({ file: relPath, line: idx + 1, rule, label, literal: match });
            }
          }
        });
    }
  }
  return hits;
}

function baselineKey(hit) {
  return `${hit.file}:${hit.rule}:${hit.literal}`;
}

function loadBaseline() {
  const counts = new Map();
  if (!existsSync(BASELINE_PATH)) return counts;
  const { violations = [] } = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  for (const violation of violations) {
    const key = baselineKey(violation);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function writeBaseline(hits) {
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  const payload = {
    _description:
      'Grandfathered hardcoded color literals in apps/web (AP-02). New violations fail CI ' +
      'via the check:no-hex-web step. Shrink this list; do not add to it. Replace each entry ' +
      'with a Tailwind class or a var(--color-*) custom property.',
    violations: hits.map(({ file, line, rule, literal }) => ({ file, line, rule, literal })),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `[AP-02] Baseline written: ${relative(ROOT, BASELINE_PATH)} (${hits.length} grandfathered).`,
  );
}

const allHits = scan();

if (WRITE_BASELINE) {
  writeBaseline(allHits);
  process.exit(0);
}

const remaining = loadBaseline();
const newHits = [];

for (const hit of allHits) {
  const key = baselineKey(hit);
  const left = remaining.get(key) ?? 0;
  if (left > 0) remaining.set(key, left - 1);
  else newHits.push(hit);
}

if (newHits.length === 0) {
  console.log('[AP-02] No new hardcoded color literals found.');
  process.exit(0);
}

for (const hit of newHits) {
  console.error(
    `[AP-02] ${hit.file}:${hit.line}, ${hit.label} literal \`${hit.literal}\` found. ` +
      'Use a Tailwind class (bg-primary, text-foreground, etc.) OR a CSS custom property (var(--color-primary)).',
  );
}
console.error(
  `\n[AP-02] ${newHits.length} new hardcoded color literal(s) found. ` +
    'Replace with Tailwind classes or CSS custom properties (var(--color-*)).',
);
process.exit(1);
