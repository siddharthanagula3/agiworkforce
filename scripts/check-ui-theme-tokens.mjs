#!/usr/bin/env node

// The theme layer, enumerated from the stylesheets: a token the dark block
// redefines with no light value has no value at all in light, a var() with no
// fallback that nothing defines paints nothing, and an appearance attribute the
// settings control stamps on <html> that no rule reads is a dead control.

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  blockBody,
  compareToBaseline,
  lineOf,
  loadBaseline,
  read,
  reportBaseline,
  sourceFiles,
  stylesheets,
  writeBaseline,
} from './lib/ui-systems.mjs';

export const BASELINE_PATH = 'scripts/config/ui-theme-tokens-baseline.json';
export const TOKEN_SHEETS = [
  'packages/ui/design-tokens/src/foundation.css',
  'packages/ui/design-tokens/src/chat.css',
  'apps/web/app/globals.css',
];
export const APPEARANCE_PATH = 'apps/web/shared/components/AppearancePreferences.tsx';
export const THEME_SCRIPT_PATH = 'apps/web/public/theme-init.js';

const THEME_BLOCK_RE = /(?:^|\n)[ \t]*((?::root|\.dark|html:not\(\.dark\)|html\.dark)[^{\n]*)\{/g;
const DECLARATION_RE = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
const REFERENCE_RE = /var\(\s*(--[a-z0-9-]+)\s*([,)])/gi;

/** Declarations written directly in this block, not in a nested one. */
function ownDeclarations(body) {
  let depth = 0;
  let flat = '';
  for (const ch of body) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (depth === 0) flat += ch;
  }
  return flat;
}

export function readThemeBlocks(source) {
  const light = new Map();
  const dark = new Map();
  THEME_BLOCK_RE.lastIndex = 0;
  let match;
  while ((match = THEME_BLOCK_RE.exec(source)) !== null) {
    const open = THEME_BLOCK_RE.lastIndex - 1;
    const selector = match[1].trim();
    const isDark = /\.dark/.test(selector) && !/not\(\.dark\)/.test(selector);
    const target = isDark ? dark : light;
    const body = ownDeclarations(blockBody(source, open));
    DECLARATION_RE.lastIndex = 0;
    let declaration;
    while ((declaration = DECLARATION_RE.exec(body)) !== null) {
      if (!target.has(declaration[1])) {
        target.set(declaration[1], { value: declaration[2].trim(), line: lineOf(source, open) });
      }
    }
  }
  return { light, dark };
}

export function findDarkOnlyTokens(repoRoot) {
  const light = new Set();
  const dark = new Map();
  for (const file of TOKEN_SHEETS) {
    const blocks = readThemeBlocks(read(repoRoot, file));
    for (const token of blocks.light.keys()) light.add(token);
    for (const [token, meta] of blocks.dark) if (!dark.has(token)) dark.set(token, { file, meta });
  }
  return [...dark.entries()]
    .filter(([token]) => !light.has(token))
    .map(([token, { file, meta }]) => ({
      key: `${file}:${meta.line}:${token}`,
      advice:
        'the dark block is the only definition, so this token resolves to nothing in the light theme',
    }));
}

export function findUndefinedReferences(repoRoot, files) {
  const defined = new Set();
  for (const file of files) {
    const source = read(repoRoot, file);
    for (const m of source.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
    for (const m of source.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/gi)) defined.add(m[1]);
  }

  const found = [];
  const seen = new Set();
  for (const file of files) {
    const source = read(repoRoot, file);
    REFERENCE_RE.lastIndex = 0;
    let match;
    while ((match = REFERENCE_RE.exec(source)) !== null) {
      if (match[2] === ',' || defined.has(match[1]) || seen.has(match[1])) continue;
      seen.add(match[1]);
      found.push({
        key: match[1],
        advice: `first referenced at ${file}:${lineOf(source, match.index)} with no fallback and no definition, so the property it feeds is dropped`,
      });
    }
  }
  return found;
}

export function appearanceAttributes(source) {
  return [
    ...new Set(
      [...source.matchAll(/(?:set|remove)Attribute\(\s*'(data-[a-z-]+)'/g)].map((m) => m[1]),
    ),
  ];
}

export function themeSystemFailures(repoRoot) {
  const failures = [];
  const appearance = read(repoRoot, APPEARANCE_PATH);
  const script = read(repoRoot, THEME_SCRIPT_PATH);
  const sheets = TOKEN_SHEETS.map((file) => read(repoRoot, file)).join('\n');

  for (const attribute of appearanceAttributes(appearance)) {
    if (!sheets.includes(`[${attribute}`)) {
      failures.push(
        `${APPEARANCE_PATH}: nothing in the token sheets reads [${attribute}], so that preference changes nothing`,
      );
    }
  }

  // Before the first paint the theme is already resolved, including the
  // unset case, or the page paints one scheme and then swaps to the other.
  if (!/prefers-color-scheme/.test(script)) {
    failures.push(
      `${THEME_SCRIPT_PATH}: the pre-paint script does not resolve the system preference, so an unset theme flashes`,
    );
  }
  for (const written of ['classList', 'data-theme', 'colorScheme']) {
    if (!script.includes(written)) {
      failures.push(`${THEME_SCRIPT_PATH}: the pre-paint script does not set ${written}`);
    }
  }
  if (!/catch/.test(script)) {
    failures.push(
      `${THEME_SCRIPT_PATH}: the pre-paint storage read is unguarded, so a hardened browser throws before the page paints`,
    );
  }

  return failures;
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkUiThemeTokens(repoRoot) {
  const files = [
    ...new Set([...stylesheets(repoRoot), ...sourceFiles(repoRoot, ['apps/web', 'packages/ui'])]),
  ];
  return {
    files,
    failures: themeSystemFailures(repoRoot),
    found: [...findDarkOnlyTokens(repoRoot), ...findUndefinedReferences(repoRoot, files)],
  };
}

function main() {
  const repoRoot = REPO_ROOT;
  const { files, failures, found } = checkUiThemeTokens(repoRoot);

  if (process.argv.includes('--write-baseline')) {
    writeBaseline(
      repoRoot,
      BASELINE_PATH,
      { generator: 'scripts/check-ui-theme-tokens.mjs' },
      found.map((item) => ({ key: item.key, reason: '' })),
    );
    console.log(`wrote ${found.length} entries to ${BASELINE_PATH}`);
    return;
  }

  const baseline = loadBaseline(repoRoot, BASELINE_PATH);
  const clean = reportBaseline('check-ui-theme-tokens', compareToBaseline(found, baseline));
  for (const failure of failures) console.error(`check-ui-theme-tokens: ${failure}`);

  if (!clean || failures.length > 0) process.exit(1);
  console.log(
    `check-ui-theme-tokens: ${files.length} files, every dark token has a light value, ${found.length} baselined`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
