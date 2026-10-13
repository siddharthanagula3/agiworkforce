#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { reportNotRun } from './lib/ci-prerequisites.mjs';

export function reportUnreleasedPairs(matrix, { env = process.env, report = reportNotRun } = {}) {
  if (!Array.isArray(matrix?.pairs)) throw new Error('The cross-version matrix has no pairs array');
  const blocked = [];
  for (const pair of matrix.pairs) {
    if (pair.status === 'covered') continue;
    if (
      pair.status !== 'blocked' ||
      !pair.title?.trim() ||
      !pair.reason?.trim() ||
      !pair.unblockedBy?.trim()
    ) {
      throw new Error(`Invalid blocked cross-version pair: ${pair.id ?? '(no id)'}`);
    }
    blocked.push(pair);
  }
  for (const pair of blocked) {
    report(
      {
        title: pair.title,
        reason: pair.reason,
        unblockedBy: pair.unblockedBy,
        flawId: 'CI-CROSS-VERSION-PREDECESSORS-MISSING-01',
      },
      { env },
    );
  }
  console.log(`${blocked.length} of ${matrix.pairs.length} §109 pairs could not be tested.`);
  return 0;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const matrix = JSON.parse(readFileSync('.github/cross-version-matrix.json', 'utf8'));
  process.exitCode = reportUnreleasedPairs(matrix);
}
