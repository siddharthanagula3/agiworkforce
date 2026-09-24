#!/usr/bin/env node

// The shell draws text at a closed set of sizes, and every one of them is
// legible. Sizes are enumerated from the source rather than from a list of
// places to look, and normalised to pixels first: the existing invariant check
// reads px literals only, so a size written in rem slipped past it.

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compareToBaseline,
  lineOf,
  loadBaseline,
  read,
  reportBaseline,
  sourceFiles,
  writeBaseline,
} from './lib/ui-systems.mjs';

export const BASELINE_PATH = 'scripts/config/ui-typography-baseline.json';
export const GLOBALS_PATH = 'apps/web/app/globals.css';
export const FOUNDATION_TOKENS_PATH = 'packages/ui/design-tokens/src/foundation.css';
export const CHAT_TOKENS_PATH = 'packages/ui/design-tokens/src/chat.css';
export const SETTINGS_STORE_PATH = 'apps/web/shared/stores/web-settings-store.ts';

/** Below this a label stops being readable at arm's length on a laptop. */
export const MIN_FONT_SIZE_PX = 12;
export const ROOT_FONT_SIZE_PX = 16;

const SIZE_PATTERNS = [
  /\btext-\[(\d+(?:\.\d+)?)(px|rem|em)\]/g,
  /font-size:\s*(\d+(?:\.\d+)?)(px|rem|em)/g,
  /fontSize:\s*['"](\d+(?:\.\d+)?)(px|rem|em)['"]/g,
];

export function toPixels(value, unit) {
  return unit === 'px' ? value : value * ROOT_FONT_SIZE_PX;
}

export function collectSizes(repoRoot, files) {
  const found = [];
  for (const file of files) {
    const source = read(repoRoot, file);
    for (const pattern of SIZE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source)) !== null) {
        found.push({
          file,
          line: lineOf(source, match.index),
          literal: match[0],
          px: toPixels(Number(match[1]), match[2]),
        });
      }
    }
  }
  return found;
}

export function readUnion(source, name) {
  const match = new RegExp(`type\\s+${name}\\s*=\\s*([^;]+);`).exec(source);
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * The reading measure, the mono family and the text-size control: three claims
 * that make long answers, code and tables readable rather than merely present.
 */
export function readingSystemFailures(repoRoot) {
  const globals = read(repoRoot, GLOBALS_PATH);
  const foundation = read(repoRoot, FOUNDATION_TOKENS_PATH);
  const chat = read(repoRoot, CHAT_TOKENS_PATH);
  const store = read(repoRoot, SETTINGS_STORE_PATH);
  const failures = [];

  const literalMeasure = /max-width:\s*\d+(?:\.\d+)?ch/.test(globals);
  const tokenMeasure =
    /max-width:\s*var\(--measure-prose\)/.test(globals) &&
    /--measure-prose:\s*\d+(?:\.\d+)?ch/.test(foundation);
  if (!literalMeasure && !tokenMeasure) {
    failures.push(
      `${GLOBALS_PATH}: the reading column declares no measure in ch, so a long answer runs the full window width`,
    );
  }

  const sans = /--chat-font-sans:\s*([^;]+);/.exec(chat);
  const mono = /--chat-font-mono:\s*([^;]+);/.exec(chat);
  if (!sans || !mono) {
    failures.push(`${CHAT_TOKENS_PATH}: the sans and mono family tokens are not both defined`);
  } else {
    const value = mono[1].trim();
    if (/var\(--chat-font-(?:sans|serif|display)\b/.test(value) || value === sans[1].trim()) {
      failures.push(
        `${CHAT_TOKENS_PATH}: the mono family points at a prose family, so code is not distinct`,
      );
    }
    if (!/\bmonospace\b/.test(value)) {
      failures.push(
        `${CHAT_TOKENS_PATH}: the mono family ends in no monospace generic, so code falls back to prose`,
      );
    }
  }

  // 'default' is the unstyled state: it deliberately sets no attribute.
  for (const size of readUnion(store, 'ChatTextSize').filter((value) => value !== 'default')) {
    for (const subtree of ['.prose', '.code-block-body']) {
      const rule = new RegExp(
        `html\\[data-chat-text-size='${size}'\\][^{]*\\${subtree}[^{]*\\{[^}]*font-size`,
      );
      if (!rule.test(globals)) {
        failures.push(
          `${GLOBALS_PATH}: the ${size} text size does not resize ${subtree}, so the control moves prose and code apart`,
        );
      }
    }
  }

  for (const font of readUnion(store, 'ChatFont').filter((value) => value !== 'default')) {
    if (!new RegExp(`html\\[data-chat-font='${font}'\\]`).test(globals)) {
      failures.push(`${GLOBALS_PATH}: the ${font} chat font is offered but nothing applies it`);
    }
  }

  return failures;
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkUiTypography(repoRoot) {
  const files = sourceFiles(repoRoot);
  const sizes = collectSizes(repoRoot, files);
  const scale = [
    ...new Set(sizes.filter((size) => size.px >= MIN_FONT_SIZE_PX).map((size) => size.px)),
  ].sort((a, b) => a - b);

  const found = sizes
    .filter((size) => size.px < MIN_FONT_SIZE_PX)
    .map((size) => ({
      key: `${size.file}:${size.line}:${size.literal}`,
      advice: `${size.px}px is under the ${MIN_FONT_SIZE_PX}px legibility floor`,
    }));

  return { files, sizes, scale, found, failures: readingSystemFailures(repoRoot) };
}

function main() {
  const repoRoot = REPO_ROOT;
  const { files, sizes, scale, found, failures } = checkUiTypography(repoRoot);
  const baseline = loadBaseline(repoRoot, BASELINE_PATH);

  if (process.argv.includes('--write-baseline')) {
    writeBaseline(
      repoRoot,
      BASELINE_PATH,
      { generator: 'scripts/check-ui-typography.mjs', scale },
      found.map((item) => ({ key: item.key, reason: '' })),
    );
    console.log(`wrote ${found.length} entries and a ${scale.length} step scale`);
    return;
  }

  const declaredScale = tryRead(repoRoot, BASELINE_PATH)?.scale ?? [];
  const offScale = scale.filter((step) => !declaredScale.includes(step));
  const clean = reportBaseline('check-ui-typography', compareToBaseline(found, baseline));

  for (const step of offScale) {
    console.error(
      `check-ui-typography: ${step}px is not a step of the shell type scale; add it to ${BASELINE_PATH} with the reason it earns a step of its own, or use an existing step`,
    );
  }
  for (const failure of failures) console.error(`check-ui-typography: ${failure}`);

  if (!clean || offScale.length > 0 || failures.length > 0) process.exit(1);
  console.log(
    `check-ui-typography: ${files.length} files, ${sizes.length} size declarations over a ${declaredScale.length} step scale, ${found.length} baselined`,
  );
}

function tryRead(repoRoot, relPath) {
  try {
    return JSON.parse(read(repoRoot, relPath));
  } catch {
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
