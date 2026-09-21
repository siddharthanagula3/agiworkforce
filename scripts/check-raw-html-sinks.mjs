#!/usr/bin/env node
// Nothing a model, a tool or a user wrote reaches the DOM as markup unless a
// sanitizer, a literal or a sandboxed document stands in the way. Every sink on
// every client surface is enumerated; one that none of those explains must be
// in the inventory with a reason, and the inventory may only shrink.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { SINK_KINDS, classifySinks } from './lib/raw-html-sinks.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
export const INVENTORY_PATH = 'scripts/config/raw-html-sinks.json';

export const SCAN_ROOTS = [
  'apps/web/app',
  'apps/web/features',
  'apps/web/shared',
  'apps/web/lib',
  'apps/web/components',
  'apps/desktop/src',
  'apps/extension/src',
  'apps/extension-vscode/src',
  'apps/mobile/src',
  'apps/mobile/app',
  'packages/ui',
];

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  'target',
  '__tests__',
  '__mocks__',
  'e2e',
]);
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const TEST = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\.d\.ts$/;
const SHORTEST_REASON = 60;

function walk(directory, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (SOURCE.test(entry.name) && !TEST.test(entry.name)) files.push(full);
  }
  return files;
}

export function readInventory(root) {
  const file = path.join(root, INVENTORY_PATH);
  if (!fs.existsSync(file)) return { structuralSanitizers: [], sinks: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function checkRawHtmlSinks(root) {
  const inventory = readInventory(root);
  const structuralSanitizers = inventory.structuralSanitizers ?? [];
  const failures = [];
  const unaccepted = new Map();
  const totals = { sinks: 0, sanitized: 0, static: 0, framed: 0, inventoried: 0 };

  for (const scanRoot of SCAN_ROOTS) {
    for (const full of walk(path.join(root, scanRoot))) {
      const source = fs.readFileSync(full, 'utf8');
      if (
        !/innerhtml|outerhtml|insertadjacenthtml|document\.write|srcdoc|html\b|rehype-raw/i.test(
          source,
        )
      ) {
        continue;
      }
      const file = path.relative(root, full).split(path.sep).join('/');
      for (const sink of classifySinks({
        repoRoot: root,
        file: full,
        source,
        structuralSanitizers,
      })) {
        totals.sinks += 1;
        if (sink.verdict) {
          totals[sink.verdict] += 1;
          continue;
        }
        const key = `${file}|${sink.kind}`;
        if (!unaccepted.has(key)) unaccepted.set(key, []);
        unaccepted.get(key).push(sink.line);
      }
    }
  }

  const listed = new Set();
  for (const entry of inventory.sinks ?? []) {
    const key = `${entry.file}|${entry.kind}`;
    listed.add(key);
    if (!SINK_KINDS.includes(entry.kind)) {
      failures.push(
        `${INVENTORY_PATH}: ${entry.file} lists "${entry.kind}", which is not a sink kind.`,
      );
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < SHORTEST_REASON) {
      failures.push(
        `${INVENTORY_PATH}: ${entry.file} (${entry.kind}) carries no reason a reviewer could check.`,
      );
    }
    const lines = unaccepted.get(key) ?? [];
    if (lines.length > entry.count) {
      failures.push(
        `${entry.file} has ${lines.length} ${entry.kind} sinks nothing sanitizes (lines ` +
          `${lines.join(', ')}); the inventory allows ${entry.count}. Sanitize the new one.`,
      );
    } else if (lines.length < entry.count) {
      failures.push(
        `${INVENTORY_PATH}: ${entry.file} (${entry.kind}) is listed at ${entry.count} and now has ` +
          `${lines.length}; lower the count so the next unsanitized sink shows.`,
      );
    }
    totals.inventoried += Math.min(lines.length, entry.count);
  }

  for (const [key, lines] of unaccepted) {
    if (listed.has(key)) continue;
    const [file, kind] = key.split('|');
    failures.push(
      `${file}:${lines.join(',')} hands markup to the DOM (${kind}) and nothing between the value ` +
        'and the sink is a sanitizer, a literal or a sandboxed document.',
    );
  }

  for (const entry of structuralSanitizers) {
    if (
      !fs.existsSync(path.join(root, entry.module)) ||
      !fs.existsSync(path.join(root, entry.test))
    ) {
      failures.push(
        `${INVENTORY_PATH}: the structural sanitizer ${entry.name} names ${entry.module} and ` +
          `${entry.test}; both must exist.`,
      );
    }
  }

  return { failures, totals };
}

function main() {
  const root = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
  const { failures, totals } = checkRawHtmlSinks(root);
  if (failures.length > 0) {
    console.error('Markup reaches the DOM without a sanitizer:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-raw-html-sinks: ${totals.sinks} sinks, ${totals.sanitized} sanitized, ` +
      `${totals.static} literal, ${totals.framed} in a sandboxed document, ` +
      `${totals.inventoried} inventoried with a reason.`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
