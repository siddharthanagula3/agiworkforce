#!/usr/bin/env node

// Every control the shared primitives can draw, read from the variant tables
// themselves rather than from a list of the ones somebody remembered: a size
// that cannot be hit, a control with no focus ring and a control with no
// disabled state are each a defect the table can be asked about directly.

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
  walkFiles,
  writeBaseline,
} from './lib/ui-systems.mjs';

export const BASELINE_PATH = 'scripts/config/ui-buttons-baseline.json';
export const PRIMITIVES_ROOT = 'packages/ui/ui/src';

/** WCAG 2.2 target size (minimum) is 24 by 24 CSS pixels. */
export const MIN_TARGET_PX = 24;
export const TAILWIND_SPACING_PX = 4;

/** The height a Tailwind sizing utility resolves to, or null if it sets none. */
export function heightOf(classes) {
  const arbitrary = /\b(?:h|size|min-h)-\[(\d+(?:\.\d+)?)(px|rem)\]/.exec(classes);
  if (arbitrary) {
    return arbitrary[2] === 'px' ? Number(arbitrary[1]) : Number(arbitrary[1]) * 16;
  }
  const step = /\b(?:h|size|min-h)-(\d+(?:\.\d+)?)\b/.exec(classes);
  if (step) return Number(step[1]) * TAILWIND_SPACING_PX;
  if (/\b(?:h|size|min-h)-px\b/.test(classes)) return 1;
  return null;
}

function balancedFrom(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return source.slice(openIndex);
}

/** Every `cva(...)` call in a file, with its base string and its size map. */
export function readVariantTables(source, file) {
  const tables = [];
  for (const match of source.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*cva\(/g)) {
    const call = balancedFrom(source, match.index + match[0].length - 1);
    const base = /^\(\s*(?:\/\/[^\n]*\n\s*)*(['"`])([\s\S]*?)\1/.exec(call);
    const sizeBlock =
      /size:\s*\{([\s\S]*?)\n\s{6}\}/.exec(call) ?? /size:\s*\{([^}]*)\}/.exec(call);
    const sizes = sizeBlock
      ? [...sizeBlock[1].matchAll(/([A-Za-z0-9_'"]+)\s*:\s*(['"`])([\s\S]*?)\2/g)].map((m) => ({
          name: m[1].replace(/['"]/g, ''),
          classes: m[3],
        }))
      : [];
    tables.push({
      file,
      name: match[1],
      line: lineOf(source, match.index),
      base: base ? base[2].replace(/\s+/g, ' ') : '',
      sizes,
    });
  }
  return tables;
}

export function variantTableFailures(repoRoot) {
  const files = walkFiles(
    repoRoot,
    PRIMITIVES_ROOT,
    (rel) => rel.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(rel),
  );
  const failures = [];
  const inspected = [];

  for (const file of files) {
    const source = read(repoRoot, file);
    for (const table of readVariantTables(source, file)) {
      if (table.sizes.length === 0) continue;
      // A table with no disabled state anywhere in its module is presentational,
      // not a control: a spinner has sizes and nothing to press.
      if (!/\bdisabled\b/.test(source)) continue;
      inspected.push(`${file}:${table.name}`);

      if (!/\bfocus-visible:/.test(table.base)) {
        failures.push(
          `${file}:${table.line}: ${table.name} draws a control with no focus-visible style, so a keyboard user cannot see where they are`,
        );
      }
      if (!/\bdisabled:/.test(table.base)) {
        failures.push(
          `${file}:${table.line}: ${table.name} draws a control with no disabled style, so a refused control looks pressable`,
        );
      }
      for (const size of table.sizes) {
        const height = heightOf(size.classes);
        if (height === null) continue;
        if (height < MIN_TARGET_PX) {
          failures.push(
            `${file}:${table.line}: ${table.name} size "${size.name}" is ${height}px tall, under the ${MIN_TARGET_PX}px target minimum`,
          );
        }
      }
    }
  }

  return { failures, inspected };
}

const CONTROL_RE = /<(?:button|Button|LoadingButton|IconButton)\b([\s\S]{0,600}?)\/?>/g;
const CLASS_RE = /class(?:Name)?=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{cn\(([\s\S]*?)\)\})/;

export function findUndersizedControls(repoRoot, files) {
  const found = [];
  for (const file of files) {
    if (!file.endsWith('.tsx')) continue;
    const source = read(repoRoot, file);
    CONTROL_RE.lastIndex = 0;
    let match;
    while ((match = CONTROL_RE.exec(source)) !== null) {
      const attrs = match[1];
      const classes = CLASS_RE.exec(attrs);
      if (!classes) continue;
      const value = classes[1] ?? classes[2] ?? classes[3] ?? classes[4] ?? '';
      const height = heightOf(value);
      if (height === null || height >= MIN_TARGET_PX) continue;
      found.push({
        key: `${file}:${lineOf(source, match.index)}:${height}px`,
        advice: `a ${height}px control is under the ${MIN_TARGET_PX}px target minimum; grow the hit area without moving the mark`,
      });
    }
  }
  return found;
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkUiButtons(repoRoot) {
  const files = sourceFiles(repoRoot);
  const { failures, inspected } = variantTableFailures(repoRoot);
  return { files, inspected, failures, found: findUndersizedControls(repoRoot, files) };
}

function main() {
  const repoRoot = REPO_ROOT;
  const { files, inspected, failures, found } = checkUiButtons(repoRoot);

  if (process.argv.includes('--write-baseline')) {
    writeBaseline(
      repoRoot,
      BASELINE_PATH,
      { generator: 'scripts/check-ui-buttons.mjs' },
      found.map((item) => ({ key: item.key, reason: '' })),
    );
    console.log(`wrote ${found.length} entries to ${BASELINE_PATH}`);
    return;
  }

  const baseline = loadBaseline(repoRoot, BASELINE_PATH);
  const clean = reportBaseline('check-ui-buttons', compareToBaseline(found, baseline));
  for (const failure of failures) console.error(`check-ui-buttons: ${failure}`);

  if (!clean || failures.length > 0) process.exit(1);
  console.log(
    `check-ui-buttons: ${inspected.length} variant tables over ${files.length} files, ${found.length} baselined`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
