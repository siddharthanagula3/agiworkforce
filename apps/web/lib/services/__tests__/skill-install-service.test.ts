import { describe, expect, it, vi } from 'vitest';

import type { Skill } from '@agiworkforce/skills';

import {
  getSkillInstallOverrides,
  resolveInstalledManagedSkillNames,
  setSkillInstallOverride,
} from '../skill-install-service';

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'design-review',
    description: 'Review UI for release polish.',
    body: 'BODY',
    contentHash: `sha256:${'0'.repeat(64)}`,
    filePath: '/srv/skills/design-review/SKILL.md',
    source: 'bundled',
    metadata: {},
    frontmatter: {},
    ...overrides,
  };
}

interface FakeDb {
  query: () => Promise<Array<{ settings: Record<string, unknown> }>>;
  execute: (sql: string, params?: unknown[]) => Promise<number>;
  transaction: <T>(fn: (tx: FakeDb) => Promise<T>) => Promise<T>;
}

function fakeDb(initialSettings: Record<string, unknown> = {}): FakeDb {
  let stored: Record<string, unknown> | null =
    Object.keys(initialSettings).length > 0 ? initialSettings : null;
  const query = vi.fn(async () => (stored ? [{ settings: stored }] : []));
  const execute = vi.fn(async (_sql: string, params?: unknown[]) => {
    const payload = JSON.parse(params?.[1] as string) as Record<string, unknown>;
    stored = payload;
    return 1;
  });
  const db: FakeDb = {
    query,
    execute,
    transaction: async <T>(fn: (tx: FakeDb) => Promise<T>) => fn(db),
  };
  return db;
}

describe('getSkillInstallOverrides', () => {
  it('returns an empty map when the user has no settings row', async () => {
    const overrides = await getSkillInstallOverrides(fakeDb() as never, 'user-1');
    expect(overrides.size).toBe(0);
  });

  it('reads boolean overrides from the skills.installs namespace', async () => {
    const db = fakeDb({ skills: { installs: { 'design-review': false, 'other-skill': true } } });
    const overrides = await getSkillInstallOverrides(db as never, 'user-1');
    expect(overrides.get('design-review')).toBe(false);
    expect(overrides.get('other-skill')).toBe(true);
  });

  it('ignores non-boolean entries in the installs map', async () => {
    const db = fakeDb({ skills: { installs: { corrupt: 'not-a-boolean' } } });
    const overrides = await getSkillInstallOverrides(db as never, 'user-1');
    expect(overrides.has('corrupt')).toBe(false);
  });
});

describe('setSkillInstallOverride', () => {
  it('sets an override without disturbing other namespaces', async () => {
    const db = fakeDb({ profile: { bio: 'hello' } });
    await setSkillInstallOverride(db as never, 'user-1', 'design-review', false);
    const overrides = await getSkillInstallOverrides(db as never, 'user-1');
    expect(overrides.get('design-review')).toBe(false);
    const [row] = await db.query();
    expect((row as { settings: Record<string, unknown> }).settings['profile']).toEqual({
      bio: 'hello',
    });
  });

  it('preserves an unrelated skill override already on record', async () => {
    const db = fakeDb({ skills: { installs: { 'other-skill': false } } });
    await setSkillInstallOverride(db as never, 'user-1', 'design-review', true);
    const overrides = await getSkillInstallOverrides(db as never, 'user-1');
    expect(overrides.get('other-skill')).toBe(false);
    expect(overrides.get('design-review')).toBe(true);
  });

  it('flips an existing override back to true on reinstall', async () => {
    const db = fakeDb({ skills: { installs: { 'design-review': false } } });
    await setSkillInstallOverride(db as never, 'user-1', 'design-review', true);
    const overrides = await getSkillInstallOverrides(db as never, 'user-1');
    expect(overrides.get('design-review')).toBe(true);
  });
});

describe('resolveInstalledManagedSkillNames', () => {
  it('applies defaults so a never-overridden skill is installed', async () => {
    const db = fakeDb();
    const names = await resolveInstalledManagedSkillNames(db as never, 'user-1', [skill()]);
    expect(names).toEqual(['design-review']);
  });

  it('hides a skill the user uninstalled', async () => {
    const db = fakeDb({ skills: { installs: { 'design-review': false } } });
    const names = await resolveInstalledManagedSkillNames(db as never, 'user-1', [skill()]);
    expect(names).toEqual([]);
  });
});
