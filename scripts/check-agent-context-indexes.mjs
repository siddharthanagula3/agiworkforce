#!/usr/bin/env node
/**
 * Drift check for docs/agent-context/generated/*.json (see
 * scripts/generate-agent-context-indexes.mjs for what these are and how
 * they're built). Regenerates all three indexes into an isolated temp
 * directory — never touches the committed tree — and diffs byte-for-byte
 * against what's checked in. Mirrors the missing/stale/changed reporting
 * pattern in scripts/generate-protocol-types.mjs's --check mode.
 *
 * Usage:
 *   node scripts/check-agent-context-indexes.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { outDir, renderIndexes, serialize } from './generate-agent-context-indexes.mjs';

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-agent-context-indexes-'));

try {
  const indexes = renderIndexes();
  const expectedFiles = new Set(Object.keys(indexes));

  for (const [fileName, value] of Object.entries(indexes)) {
    fs.writeFileSync(path.join(stagingDir, fileName), serialize(value));
  }

  const existingFiles = new Set(
    fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((name) => name.endsWith('.json')) : [],
  );

  const missingFiles = [...expectedFiles].filter((file) => !existingFiles.has(file));
  const staleFiles = [...existingFiles].filter((file) => !expectedFiles.has(file));
  const changedFiles = [...expectedFiles].filter(
    (file) =>
      existingFiles.has(file) &&
      !fs
        .readFileSync(path.join(stagingDir, file))
        .equals(fs.readFileSync(path.join(outDir, file))),
  );

  const drift = [
    ...missingFiles.map((file) => `missing ${file}`),
    ...staleFiles.map((file) => `stale ${file} (no longer generated)`),
    ...changedFiles.map((file) => `changed ${file}`),
  ];

  if (drift.length > 0) {
    console.error('docs/agent-context/generated/ is stale:');
    for (const item of drift) {
      console.error(`- ${item}`);
    }
    console.error('Run: node scripts/generate-agent-context-indexes.mjs');
    process.exitCode = 1;
  } else {
    console.log(
      `Verified ${expectedFiles.size} generated agent-context indexes match committed state.`,
    );
  }
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
