import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_ALLOWLIST_STORAGE_KEY } from '../src/background/policy';

const SRC_ROOT = resolve(process.cwd(), 'src');
const DEFINITION_FILE = 'background/policy.ts';

const PENDING_MIGRATION = new Set(['side_panel.ts', 'inPagePanel/setup.ts']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function filesQuotingTheKey(): string[] {
  const quoted = new RegExp(`['"]${SITE_ALLOWLIST_STORAGE_KEY}['"]`);
  return sourceFiles(SRC_ROOT)
    .filter((file) => quoted.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC_ROOT, file));
}

function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length] as number;
}

const NORMALIZED_KEY = normalizeKey(SITE_ALLOWLIST_STORAGE_KEY);
const STRING_LITERAL = /['"`]([A-Za-z0-9_$.:-]{8,64})['"`]/g;
const NEAR_MISS_DISTANCE = 2;

function nearMisses(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    const rel = relative(SRC_ROOT, file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(STRING_LITERAL)) {
      const literal = match[1] as string;
      if (literal === SITE_ALLOWLIST_STORAGE_KEY) continue;
      const normalized = normalizeKey(literal);
      if (Math.abs(normalized.length - NORMALIZED_KEY.length) > NEAR_MISS_DISTANCE) continue;
      if (editDistance(normalized, NORMALIZED_KEY) <= NEAR_MISS_DISTANCE) {
        found.push(`${rel}: ${literal}`);
      }
    }
  }
  return found;
}

describe('agi_site_allowlist storage key', () => {
  it('is exported with the value the stored data already uses', () => {
    expect(SITE_ALLOWLIST_STORAGE_KEY).toBe('agi_site_allowlist');
  });

  it('is quoted only where it is defined', () => {
    const offenders = filesQuotingTheKey().filter(
      (file) => file !== DEFINITION_FILE && !PENDING_MIGRATION.has(file),
    );
    expect(offenders).toEqual([]);
  });

  it('has no stale entry in the pending-migration set', () => {
    const quoting = new Set(filesQuotingTheKey());
    const alreadyMigrated = [...PENDING_MIGRATION].filter((file) => !quoting.has(file));
    expect(alreadyMigrated).toEqual([]);
  });

  it('detects a near-miss spelling, which reads as an empty allowlist at runtime', () => {
    expect(nearMisses()).toEqual([]);
  });

  it('the near-miss detector actually fires on a plausible typo', () => {
    for (const typo of ['agi_site_allow_list', 'agi_site_allowlst', 'agi_sites_allowlist']) {
      expect(editDistance(normalizeKey(typo), NORMALIZED_KEY)).toBeLessThanOrEqual(
        NEAR_MISS_DISTANCE,
      );
      expect(typo).not.toBe(SITE_ALLOWLIST_STORAGE_KEY);
    }
  });
});
