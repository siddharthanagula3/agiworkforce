#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sourceFiles } from './lib/workspace-cache-scope.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

/**
 * The product makes one promise about model improvement: it does not happen.
 * The eligibility contract is therefore that nothing is eligible, and that is
 * only true while no surface offers the choice and no path carries content to
 * a training sink. Both halves are checked here, because a promise on a page
 * that code has quietly outgrown is worse than no promise.
 */
const CLAIM_PAGES = [
  {
    file: 'apps/web/app/privacy/page.tsx',
    must: [/does not train AGI-owned models on customer prompts/i],
  },
  {
    file: 'apps/web/features/settings/sections/PrivacySection.tsx',
    must: [/There is\s*\n?\s*no training opt-in, because that data path does not exist/i],
  },
];

const SCAN_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features', 'apps/web/shared'];

/** A control that would make content eligible, or a path that would ship it. */
const ELIGIBILITY_SURFACES = [
  {
    id: 'training-preference',
    pattern: /\b(?:improveModelTraining|improve_model_training|allowModelTraining|trainingOptIn)\b/,
    detail: 'a training preference the settings screen deliberately does not offer',
  },
  {
    id: 'training-export',
    pattern: /\b(?:trainingDataset|training_dataset|exportForTraining|fineTuneUpload)\b/,
    detail: 'an export built for training a model',
  },
  {
    id: 'fine-tune-call',
    pattern: /\/v1\/fine[_-]?tun|createFineTun|fineTuningJobs/i,
    detail: 'a call that submits content to a fine-tuning endpoint',
  },
];

/**
 * A mention that is not a control. Each names the file and why the words are
 * there; the guard refuses a new one.
 */
const NOT_A_CONTROL = [
  {
    file: 'apps/web/features/settings/sections/PrivacySection.tsx',
    surface: 'training-preference',
    reason:
      'The name appears only in the comment that records why the toggle was removed: it persisted correctly and had no consumer, so it was a switch that saved and changed nothing. Removing the comment would invite the next author to add it back.',
  },
];

const failures = [];

for (const page of CLAIM_PAGES) {
  const full = path.join(scanRoot, page.file);
  if (!fs.existsSync(full)) {
    failures.push(`${page.file} is gone; the promise it carried is now unstated`);
    continue;
  }
  const source = fs.readFileSync(full, 'utf8');
  for (const must of page.must) {
    if (!must.test(source)) {
      failures.push(
        `${page.file} no longer states that customer content is not used for model improvement; ` +
          `either restore the sentence or this guard is describing a product that changed`,
      );
    }
  }
}

const honoured = new Set();
let scanned = 0;

for (const root of SCAN_ROOTS) {
  for (const file of sourceFiles(path.join(scanRoot, root))) {
    scanned += 1;
    const relative = path.relative(scanRoot, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    for (const surface of ELIGIBILITY_SURFACES) {
      if (!surface.pattern.test(source)) continue;
      const allowed = NOT_A_CONTROL.find(
        (entry) => entry.file === relative && entry.surface === surface.id,
      );
      if (allowed) {
        honoured.add(`${allowed.file}::${allowed.surface}`);
        continue;
      }
      failures.push(
        `${relative} carries ${surface.detail}. The privacy page says this data path does not ` +
          `exist; one of the two is now wrong.`,
      );
    }
  }
}

if (scanned === 0) failures.push('no source files scanned; the check would pass vacuously');

for (const entry of NOT_A_CONTROL) {
  const full = path.join(scanRoot, entry.file);
  if (!fs.existsSync(full)) {
    if (scanRoot === repoRoot) failures.push(`stale exemption: ${entry.file} no longer exists`);
    continue;
  }
  if (!honoured.has(`${entry.file}::${entry.surface}`)) {
    failures.push(`stale exemption: ${entry.file} no longer mentions ${entry.surface}; remove it`);
  }
  if (entry.reason.trim().length < 80) {
    failures.push(`the exemption for ${entry.file} needs a real reason`);
  }
}

if (failures.length > 0) {
  console.error('Model-improvement eligibility does not match what the product promises:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} finding(s).`);
  process.exit(1);
}

console.log(
  `check-model-improvement-eligibility: ${scanned} modules scanned, ` +
    `${ELIGIBILITY_SURFACES.length} eligibility surfaces absent, ${CLAIM_PAGES.length} claims kept.`,
);
