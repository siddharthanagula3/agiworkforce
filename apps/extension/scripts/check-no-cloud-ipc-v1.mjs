#!/usr/bin/env node
/**
 * AP-10: Scan extension src for direct cloud-IPC calls that bypass InviteCodeModal.
 * v1 LOCAL ONLY rule — cloud feature paths must go through InviteCodeModal gate.
 * Exit 0 = clean, 1 = direct cloud-IPC found.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC_DIR = join(ROOT, 'src');

const EXCLUDE_DIRS = new Set([
  // The cloud-bridge directory IS the gate — exempt by design
  join(SRC_DIR, 'features', 'cloud-bridge'),
  join(ROOT, '__tests__'),
  join(ROOT, 'dist'),
  join(ROOT, 'node_modules'),
]);

// Patterns that indicate a direct cloud-IPC call
const CLOUD_IPC_PATTERNS = [
  // Named IPC action strings matching cloud_<verb>_*
  { re: /['"`]cloud_(?:get|create|delete|update)_[a-z_]+['"`]/g, label: 'cloud CRUD IPC literal' },
  // Known specific identifiers
  { re: /\blistCloudConversations\b/g, label: 'listCloudConversations call' },
  { re: /\bhandleCloudWebCommand\b/g, label: 'handleCloudWebCommand call' },
  // Any string literal cloud_<name> passed to sendMessage (catch-all)
  {
    re: /chrome\.runtime\.sendMessage\s*\([^)]*['"`]cloud_[a-z_]+['"`]/g,
    label: 'sendMessage with cloud_ action',
  },
];

// A line is exempt if it is behind a cloud-unlock check
const UNLOCK_GUARD_RE = /checkCloudUnlocked|agi_cloud_unlocked|cloudUnlocked/;

function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDE_DIRS.has(full)) collectFiles(full);
    } else if (full.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

const files = collectFiles(SRC_DIR);

let violations = 0;

for (const file of files) {
  const relPath = relative(ROOT, file);
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Skip comment lines
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    // Skip lines that are behind a known unlock guard on the same line
    if (UNLOCK_GUARD_RE.test(line)) return;

    for (const { re, label } of CLOUD_IPC_PATTERNS) {
      re.lastIndex = 0;
      const matches = line.match(re);
      if (matches) {
        for (const match of matches) {
          console.error(
            `[AP-10] ${relPath}:${idx + 1} — ${label}: \`${match.trim()}\`\n` +
              `        Fix: wrap call in cloud-unlock check OR route through InviteCodeModal.`,
          );
          violations++;
        }
      }
    }
  });
}

if (violations === 0) {
  console.log('[AP-10] No direct cloud-IPC calls found outside the cloud-bridge gate.');
  process.exit(0);
} else {
  console.error(
    `\n[AP-10] ${violations} direct cloud-IPC call(s) found outside the cloud-bridge gate.` +
      `\n        All cloud feature paths must route through InviteCodeModal (v1-local-only rule).`,
  );
  process.exit(1);
}
