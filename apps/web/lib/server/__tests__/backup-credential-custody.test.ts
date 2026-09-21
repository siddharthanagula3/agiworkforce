import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  loadBaseline,
  readKeys,
  registeredKeys,
} from '../../../../../scripts/check-config-keys.mjs';

/**
 * Database history lives with the provider, outside Postgres, so no SQL role
 * the application connects as can shorten or delete it. The only credential
 * that can is the provider's control-plane key, which the restore drills read.
 * This keeps that key out of everything a deployment runs.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const DRILLS = ['scripts/db-restore-drill.mjs', 'scripts/key-rotation-drill.mjs'];
const RUNTIME_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features', 'packages', 'services'];

function controlPlaneCredentials(): string[] {
  const keys = new Set<string>();
  for (const drill of DRILLS) {
    const source = readFileSync(path.join(REPO_ROOT, drill), 'utf8');
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (/KEY|TOKEN|SECRET/.test(match[1] as string)) keys.add(match[1] as string);
    }
  }
  return [...keys].sort();
}

describe('the credential that can delete database history', () => {
  const credentials = controlPlaneCredentials();

  it('is read by the restore drills, so there is one to keep out', () => {
    expect(credentials.length).toBeGreaterThan(0);
  });

  it('is never read by code a deployment runs', () => {
    const { keys, files } = readKeys(REPO_ROOT, RUNTIME_ROOTS);

    expect(files).toBeGreaterThan(1_000);
    expect(credentials.filter((key) => keys.has(key))).toEqual([]);
  });

  it('is neither registered for the web runtime nor recorded as read by it', () => {
    const registered = registeredKeys(REPO_ROOT);
    const recorded = new Set(
      (loadBaseline(REPO_ROOT).unregistered as Array<{ key: string }>).map((entry) => entry.key),
    );

    expect(registered.size).toBeGreaterThan(50);
    expect(credentials.filter((key) => registered.has(key) || recorded.has(key))).toEqual([]);
  });
});
