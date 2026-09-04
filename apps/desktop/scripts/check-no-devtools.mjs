#!/usr/bin/env node
/* global console */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_FEATURE = 'devtools';
const FORBIDDEN_DEPENDENCY_FEATURE = 'tauri/devtools';
const DEFAULT_FEATURE = 'default';

export function parseFeatureTable(manifestText) {
  const lines = manifestText.split(/\r?\n/u);
  const table = new Map();
  let inFeatures = false;
  let pending = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/u, '').trim();
    if (/^\[[^\]]+\]$/u.test(line)) {
      inFeatures = line === '[features]';
      pending = null;
      continue;
    }
    if (!inFeatures || line.length === 0) continue;

    if (pending === null) {
      const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/u.exec(line);
      if (!assignment) continue;
      pending = { name: assignment[1], body: assignment[2] };
    } else {
      pending.body += ` ${line}`;
    }

    const opened = (pending.body.match(/\[/gu) ?? []).length;
    const closed = (pending.body.match(/\]/gu) ?? []).length;
    if (opened === 0 || opened > closed) continue;

    const members = [...pending.body.matchAll(/"([^"]*)"/gu)].map((match) => match[1]);
    table.set(pending.name, members);
    pending = null;
  }
  return table;
}

export function resolveFeatureClosure(table, requested) {
  const seen = new Set();
  const queue = [...requested];
  while (queue.length > 0) {
    const feature = queue.pop();
    if (feature === undefined || seen.has(feature)) continue;
    seen.add(feature);
    for (const member of table.get(feature) ?? []) {
      if (!seen.has(member)) queue.push(member);
    }
  }
  return seen;
}

export function findDevtoolsActivation(manifestText, requestedFeatures, { noDefaultFeatures }) {
  const table = parseFeatureTable(manifestText);
  const roots = [...requestedFeatures];
  if (!noDefaultFeatures && table.has(DEFAULT_FEATURE)) roots.push(DEFAULT_FEATURE);

  const closure = resolveFeatureClosure(table, roots);
  const activated = [FORBIDDEN_FEATURE, FORBIDDEN_DEPENDENCY_FEATURE].filter((feature) =>
    closure.has(feature),
  );
  return activated;
}

/** Splits the bundler's `--features a,b --no-default-features` tail into a feature set. */
export function parseCargoFeatureArgs(args) {
  const requested = [];
  let noDefaultFeatures = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--no-default-features') {
      noDefaultFeatures = true;
      continue;
    }
    if (arg === '--features' || arg === '-F') {
      requested.push(...splitFeatureList(args[index + 1] ?? ''));
      index += 1;
      continue;
    }
    const inline = /^(?:--features=|-F)(.+)$/u.exec(arg ?? '');
    if (inline) requested.push(...splitFeatureList(inline[1]));
  }
  return { requested, noDefaultFeatures };
}

function splitFeatureList(value) {
  return value
    .split(/[\s,]+/u)
    .map((feature) => feature.trim())
    .filter((feature) => feature.length > 0)
    .map((feature) => feature.replace(/^agiworkforce-desktop\//u, ''));
}

const manifestPath = path.resolve(import.meta.dirname, '../src-tauri/Cargo.toml');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { requested, noDefaultFeatures } = parseCargoFeatureArgs(process.argv.slice(2));
  const manifestText = readFileSync(manifestPath, 'utf8');
  const activated = findDevtoolsActivation(manifestText, requested, { noDefaultFeatures });

  if (activated.length > 0) {
    console.error(
      `ERROR: the release feature set enables the webview inspector via ${activated.join(', ')}`,
    );
    console.error(`  requested: ${requested.join(', ') || '(none)'}`);
    console.error(`  default features: ${noDefaultFeatures ? 'disabled' : 'enabled'}`);
    process.exit(1);
  }
  console.log(
    `OK: devtools is not reachable from the resolved feature set (${requested.join(', ') || 'default'})`,
  );
}
