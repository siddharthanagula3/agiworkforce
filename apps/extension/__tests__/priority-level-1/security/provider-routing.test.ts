/**
 * L1 Security — Provider Routing / No Silent Cloud Routing.
 *
 * This surface has no LLM provider router (desktop is the brain). The
 * equivalent trust-boundary guarantee is: extension source must not perform
 * direct cloud-IPC that bypasses the cloud-unlock gate, and persisted tasks
 * must re-validate their origin against the live allowlist before firing
 * (a removed origin cannot keep driving privileged actions).
 *
 * We assert the real fire-time gate (shouldExecuteScheduledTask) and run the
 * same cloud-IPC source scan the check:no-cloud-ipc guard uses, so the
 * v1 LOCAL-ONLY contract is enforced by a test in this priority level too.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ORIGIN_EXTENSION_PAGE, shouldExecuteScheduledTask } from '../../../src/background/policy';

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../src');

const CLOUD_IPC_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /['"`]cloud_(?:get|create|delete|update)_[a-z_]+['"`]/g, label: 'cloud CRUD IPC literal' },
  { re: /\blistCloudConversations\b/g, label: 'listCloudConversations call' },
  { re: /\bhandleCloudWebCommand\b/g, label: 'handleCloudWebCommand call' },
  {
    re: /chrome\.runtime\.sendMessage\s*\([^)]*['"`]cloud_[a-z_]+['"`]/g,
    label: 'sendMessage with cloud_ action',
  },
];
const UNLOCK_GUARD_RE = /checkCloudUnlocked|agi_cloud_unlocked|cloudUnlocked/;
const EXCLUDED_DIR = join(SRC_DIR, 'features', 'cloud-bridge'); // the gate itself

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (full !== EXCLUDED_DIR) out.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('L1 Security - Scheduled task origin re-check', () => {
  test('SECURITY: task whose origin left the allowlist does not fire', () => {
    const allowlist = new Set<string>(['https://allowed.example.com']);
    expect(
      shouldExecuteScheduledTask({ createdByOrigin: 'https://removed.example.com' }, allowlist),
    ).toBe(false);
    expect(
      shouldExecuteScheduledTask({ createdByOrigin: 'https://allowed.example.com' }, allowlist),
    ).toBe(true);
  });

  test('HAPPY_PATH: extension-page sentinel always fires regardless of allowlist', () => {
    expect(shouldExecuteScheduledTask({ createdByOrigin: ORIGIN_EXTENSION_PAGE }, new Set())).toBe(
      true,
    );
  });
});

describe('L1 Security - No silent cloud routing (source scan)', () => {
  test('SECURITY: no direct cloud-IPC outside the cloud-unlock gate', () => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(SRC_DIR)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // skip comments
        if (UNLOCK_GUARD_RE.test(line)) return; // behind the unlock gate
        for (const { re, label } of CLOUD_IPC_PATTERNS) {
          re.lastIndex = 0;
          if (re.test(line)) offenders.push(`${file}:${idx + 1} — ${label}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
