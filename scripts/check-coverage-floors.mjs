#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  checkFloors,
  collectFloors,
  parseProjects,
  parseRootFloor,
  unflooredProjects,
} from './lib/coverage-floors.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
const RECORD_PATH = 'scripts/.coverage-floors.json';

function read(relPath) {
  const abs = path.join(scanRoot, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

const rootConfig = read('vitest.config.ts');
if (rootConfig === null) {
  console.error('vitest.config.ts is missing; there is no projects list to measure.');
  process.exit(1);
}

const projects = parseProjects(rootConfig);
const { floors, missingConfigs } = collectFloors(projects, (project) =>
  read(path.join(project, 'vitest.config.ts')),
);
const rootFloor = parseRootFloor(read('package.json') ?? '');

if (process.argv.includes('--write')) {
  const payload = {
    _description:
      'Per-package line coverage floors, and how many projects still declare none. Each floor was ' +
      'measured by running that package with coverage and set a point or two below the result, so ' +
      'it holds today and cannot be lowered tomorrow. The unfloored count only shrinks: a package ' +
      'joining the projects list brings a floor with it, and the rest are a named debt rather than ' +
      'an open-ended exemption.',
    _measuredAt: process.env.RATCHET_REVISION ?? 'unrecorded',
    rootFloor,
    maxUnfloored: unflooredProjects(floors).length,
    floors,
  };
  fs.writeFileSync(path.join(repoRoot, RECORD_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `Wrote ${RECORD_PATH}: rootFloor ${rootFloor}, ${
      Object.values(floors).filter((f) => f !== null).length
    } floored, ${payload.maxUnfloored} unfloored.`,
  );
  process.exit(0);
}

const recordAbs = path.join(repoRoot, RECORD_PATH);
if (!fs.existsSync(recordAbs)) {
  console.error(`Missing ${RECORD_PATH}. Run: node scripts/check-coverage-floors.mjs --write`);
  process.exit(1);
}
const recorded = JSON.parse(fs.readFileSync(recordAbs, 'utf8'));
const errors = checkFloors({ floors, missingConfigs, rootFloor }, recorded);

if (errors.length > 0) {
  console.error(
    'A coverage floor is a promise about what the next change may not undo. Lowering one, or\n' +
      'adding a package without one, converts an untested path into an invisible one.\n',
  );
  for (const error of errors) console.error(`  - ${error}`);
  console.error('');
  process.exit(1);
}

const floored = Object.values(floors).filter((floor) => floor !== null).length;
console.log(
  `Coverage floor check passed (${floored}/${projects.length} projects floored, ` +
    `${unflooredProjects(floors).length}/${recorded.maxUnfloored} still unfloored, ` +
    `repository floor ${rootFloor}).`,
);
