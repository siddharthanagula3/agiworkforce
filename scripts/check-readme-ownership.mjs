#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const warnings = [];

const scanRoots = [
  'apps',
  // T-wave 2026-07-16: packages/ regrouped into domain dirs; each group is a
  // scan root so every nested package keeps per-package README ownership.
  'packages/contracts',
  'packages/ai',
  'packages/client',
  'packages/ui',
  'packages/tools',
  'packages/platform',
  'packages/ai/providers',
  'crates',
  'services',
];
const featureRoots = ['apps/web/features', 'apps/mobile/src/features', 'apps/desktop/src/features'];

const missingReadmeDebt = new Set([]);

const requiredReadmeMarkers = ['Status:', 'Owner', 'Purpose'];

function childDirs(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  return (
    fs
      .readdirSync(absoluteRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Installed dependencies are not ours to document. A workspace package that
      // has its own nested node_modules (pnpm does this whenever a dependency
      // cannot be hoisted) would otherwise be reported as a missing ownership
      // README for third-party code.
      .filter((entry) => entry.name !== 'node_modules')
      .map((entry) => `${relativeRoot}/${entry.name}`)
      .sort()
  );
}

function requireReadmeOwnership(dir) {
  const readmePath = path.join(root, dir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    if (missingReadmeDebt.has(dir)) {
      warnings.push(`Known README ownership debt: ${dir}/README.md`);
    } else {
      errors.push(`Missing README ownership file: ${dir}/README.md`);
    }
    return;
  }

  const body = fs.readFileSync(readmePath, 'utf8');
  for (const marker of requiredReadmeMarkers) {
    if (!body.includes(marker)) {
      errors.push(`${dir}/README.md missing required marker: ${marker}`);
    }
  }
}

for (const scanRoot of scanRoots) {
  for (const dir of childDirs(scanRoot)) {
    requireReadmeOwnership(dir);
  }
}

for (const featureRoot of featureRoots) {
  requireReadmeOwnership(featureRoot);
  for (const dir of childDirs(featureRoot)) {
    requireReadmeOwnership(dir);
  }
}

if (errors.length > 0) {
  console.error('README ownership check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    console.error('\nREADME ownership warnings:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('README ownership check passed with known debt:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
} else {
  console.log('README ownership check passed.');
}
