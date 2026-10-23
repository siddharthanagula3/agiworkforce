#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  addCargoPackage,
  buildNotices,
  cargoRuntimeClosure,
  renderNoticesText,
} from '../../../scripts/lib/third-party-notices.mjs';

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(cliRoot, '../..');
export const OUTPUT_FILE = path.join(cliRoot, 'assets/THIRD_PARTY_NOTICES.txt');
export const RELEASE_WORKFLOW = path.join(repoRoot, '.github/workflows/release-cli.yml');
export const CLI_PACKAGE = 'agiworkforce-cli';

export function releaseTargets(workflowText) {
  const targets = [...workflowText.matchAll(/^\s*-\s+target:\s*([\w.-]+)\s*$/gm)].map(
    (match) => match[1],
  );
  if (targets.length === 0) throw new Error('release-cli.yml lists no build targets');
  return [...new Set(targets)];
}

export function featuresForTarget(target) {
  return target.includes('linux') ? [] : ['voice'];
}

function cargoMetadata(target) {
  const features = featuresForTarget(target);
  const args = [
    'metadata',
    '--format-version',
    '1',
    '--locked',
    '--manifest-path',
    path.join(cliRoot, 'Cargo.toml'),
    '--filter-platform',
    target,
    ...(features.length > 0 ? ['--features', features.join(',')] : []),
  ];
  const result = spawnSync('cargo', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr.trim().split('\n').pop();
    throw new Error(`cargo metadata failed for ${target}: ${reason}`);
  }
  return JSON.parse(result.stdout);
}

export function generate(targets = releaseTargets(fs.readFileSync(RELEASE_WORKFLOW, 'utf8'))) {
  const records = new Map();
  for (const target of targets) {
    for (const pkg of cargoRuntimeClosure(cargoMetadata(target), CLI_PACKAGE)) {
      addCargoPackage(records, pkg, 'cli');
    }
  }
  return renderNoticesText(buildNotices(records), {
    title: 'Command-line tool open-source notices',
    intro:
      'The agi command-line tool includes the open-source Rust crates below. Each keeps its own copyright and license.',
  });
}

function main() {
  const check = process.argv.includes('--check');
  const text = generate();
  if (check) {
    const current = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, 'utf8') : '';
    if (current !== text) {
      console.error(
        `${path.relative(repoRoot, OUTPUT_FILE)} is out of date. Run node apps/cli/scripts/generate-third-party-notices.mjs`,
      );
      process.exit(1);
    }
    console.log(`${path.relative(repoRoot, OUTPUT_FILE)} is up to date.`);
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, text, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, OUTPUT_FILE)}.`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
