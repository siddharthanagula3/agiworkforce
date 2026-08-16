#!/usr/bin/env node
/* global URL, console, process */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC_DIR = join(ROOT, 'src');

const EXCLUDE_DIRS = new Set([
  join(SRC_DIR, 'features', 'cloud-bridge'),
  join(ROOT, '__tests__'),
  join(ROOT, 'dist'),
  join(ROOT, 'node_modules'),
]);

const CLOUD_IPC_PATTERNS = [
  { re: /['"`]cloud_(?:get|create|delete|update)_[a-z_]+['"`]/g, label: 'cloud CRUD IPC literal' },
  { re: /\blistCloudConversations\b/g, label: 'listCloudConversations call' },
  { re: /\bhandleCloudWebCommand\b/g, label: 'handleCloudWebCommand call' },
  {
    re: /chrome\.runtime\.sendMessage\s*\([^)]*['"`]cloud_[a-z_]+['"`]/g,
    label: 'sendMessage with cloud_ action',
  },
  { re: /['"`]\/api\/chat\/conversations/g, label: 'direct chat-conversations endpoint' },
  { re: /\bcreateManagedCloudChatClient\b/g, label: 'managed cloud chat client construction' },
];

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
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
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
    `\n[AP-10] ${violations} cloud egress site(s) found outside the cloud-bridge gate.` +
      `\n        Move the call into src/features/cloud-bridge/, which is the audited gate.`,
  );
  process.exit(1);
}
