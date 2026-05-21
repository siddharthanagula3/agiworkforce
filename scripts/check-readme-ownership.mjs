#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const warnings = [];

const scanRoots = ['apps', 'packages', 'packages/providers', 'crates', 'services'];

const missingReadmeDebt = new Set([]);

const requiredReadmeMarkers = ['Status:', 'Owner', 'Purpose'];

function childDirs(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  return fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${relativeRoot}/${entry.name}`)
    .sort();
}

for (const scanRoot of scanRoots) {
  for (const dir of childDirs(scanRoot)) {
    const readmePath = path.join(root, dir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      if (missingReadmeDebt.has(dir)) {
        warnings.push(`Known README ownership debt: ${dir}/README.md`);
      } else {
        errors.push(`Missing README ownership file: ${dir}/README.md`);
      }
      continue;
    }

    const body = fs.readFileSync(readmePath, 'utf8');
    for (const marker of requiredReadmeMarkers) {
      if (!body.includes(marker)) {
        warnings.push(`${dir}/README.md missing recommended marker: ${marker}`);
      }
    }
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
