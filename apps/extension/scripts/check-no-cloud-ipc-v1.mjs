#!/usr/bin/env node
/* global URL, console, process */
/**
 * AP-10: Scan extension src for cloud egress outside the cloud-bridge gate.
 *
 * The rule is no longer "v1 LOCAL ONLY". Chrome automatically mirrors eligible
 * Managed-Cloud-only conversations to the signed-in account.
 * What is still locked down is WHERE that egress may live: every cloud call —
 * IPC action, chat-conversations endpoint, or Managed Cloud chat client — must
 * be inside `src/features/cloud-bridge/`, which is the audited gate. A copy
 * anywhere else fails this check.
 *
 * Exit 0 = clean, 1 = cloud egress found outside the gate.
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
  // Account-backed chat persistence. The endpoint and the shared client are the
  // two ways to reach it; both belong to the cloud-bridge gate only.
  { re: /['"`]\/api\/chat\/conversations/g, label: 'direct chat-conversations endpoint' },
  { re: /\bcreateManagedCloudChatClient\b/g, label: 'managed cloud chat client construction' },
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
    `\n[AP-10] ${violations} cloud egress site(s) found outside the cloud-bridge gate.` +
      `\n        Move the call into src/features/cloud-bridge/, which is the audited gate.`,
  );
  process.exit(1);
}
