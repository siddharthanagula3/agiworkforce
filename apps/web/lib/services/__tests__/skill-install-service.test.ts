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

type Settings = Record<string, unknown>;
type Row = { settings: unknown };
type Step = { operation: 'lock' | 'insert' | 'update'; rows?: Row[]; error?: Error };

function fakeDb(initialSettings: Settings | null = null, steps?: Step[], commitError?: Error) {
  let stored = initialSettings;
  let index = 0;
  const events: string[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    expect(sql).toBe('select settings from public.user_settings where user_id = $1 limit 1');
    expect(params).toEqual(['user-1']);
    return stored ? [{ settings: stored }] : [];
  });
  const txQuery = vi.fn(async (sql: string, params: unknown[]) => {
    expect(params[0]).toBe('user-1');
    let operation: Step['operation'];
    if (sql.startsWith('select ')) {
      expect(sql).toBe('select settings from public.user_settings where user_id = $1 for update');
      operation = 'lock';
    } else if (sql.trimStart().startsWith('insert ')) {
      expect(sql).toContain('insert into public.user_settings');
      expect(sql).toContain('on conflict (user_id) do nothing');
      expect(sql).toContain('returning settings');
      operation = 'insert';
    } else {
      expect(sql).toContain('update public.user_settings');
      expect(sql).toContain('set settings = $2::jsonb');
      expect(sql).toContain('where user_id = $1');
      expect(sql).toContain('returning settings');
      operation = 'update';
    }
    events.push(operation);
    if (steps) {
      const step = steps[index++];
      expect(step?.operation).toBe(operation);
      if (!step) throw new Error('Unscripted query');
      if (step.error) throw step.error;
      return step.rows ?? [];
    }
    if (operation === 'lock') return stored ? [{ settings: stored }] : [];
    stored = JSON.parse(String(params[1])) as Settings;
    return [{ settings: stored }];
  });
  const execute = vi.fn(async () => {
    throw new Error('Unexpected execute');
  });
  const transaction = vi.fn(
    async <T>(fn: (tx: { query: typeof txQuery; execute: typeof execute }) => Promise<T>) => {
      const before = stored;
      events.push('begin');
      let result: T;
      try {
        result = await fn({ query: txQuery, execute });
      } catch (error) {
        stored = before;
        events.push('rollback');
        throw error;
      }
      if (commitError) {
        events.push('commit-uncertain');
        throw commitError;
      }
      events.push('commit');
      return result;
    },
  );
  return {
    query,
    execute,
    transaction,
    txQuery,
    events,
    done: () => {
      if (steps) expect(index).toBe(steps.length);
    },
    payload: (call = txQuery.mock.calls.length - 1) =>
      JSON.parse(String(txQuery.mock.calls[call]?.[1]?.[1])) as Settings,
  };
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
    const [row] = await db.query(
      'select settings from public.user_settings where user_id = $1 limit 1',
      ['user-1'],
    );
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

describe('skill writes use locked transaction SQL and modeled interleavings, not a database lock proof', () => {
  it('preserves a privacy denial, workspace selection and skill sibling visible at lock acquisition', async () => {
    const current = {
      privacy: { shareTelemetry: false, keepOutOfProviderTraining: true },
      workspace: { activeOrganizationId: 'personal' },
      skills: { note: 'keep', installs: { first: false, malformed: 'keep' } },
    };
    const next = {
      ...current,
      skills: { ...current.skills, installs: { ...current.skills.installs, second: true } },
    };
    const db = fakeDb(null, [
      { operation: 'lock', rows: [{ settings: current }] },
      { operation: 'update', rows: [{ settings: next }] },
    ]);
    const result = await setSkillInstallOverride(db as never, 'user-1', 'second', true);
    expect(db.payload()).toEqual(next);
    expect(result.get('first')).toBe(false);
    expect(result.get('second')).toBe(true);
    expect(result.has('malformed')).toBe(false);
    expect(db.events).toEqual(['begin', 'lock', 'update', 'commit']);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    db.done();
  });

  it('inserts only the real intended document when the row is absent', async () => {
    const db = fakeDb();
    const result = await setSkillInstallOverride(db as never, 'user-1', 'first', false);
    expect(db.payload()).toEqual({ skills: { installs: { first: false } } });
    expect(result.get('first')).toBe(false);
    expect(db.events).toEqual(['begin', 'lock', 'insert', 'commit']);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rereads and locks the winning insert before recomputing the full document', async () => {
    const winner = { privacy: { shareTelemetry: false }, skills: { installs: { first: true } } };
    const next = { ...winner, skills: { installs: { first: true, second: false } } };
    const db = fakeDb(null, [
      { operation: 'lock' },
      { operation: 'insert' },
      { operation: 'lock', rows: [{ settings: winner }] },
      { operation: 'update', rows: [{ settings: next }] },
    ]);
    const result = await setSkillInstallOverride(db as never, 'user-1', 'second', false);
    expect(db.payload(1)).toEqual({ skills: { installs: { second: false } } });
    expect(db.payload(3)).toEqual(next);
    expect(result.get('first')).toBe(true);
    expect(db.events).toEqual(['begin', 'lock', 'insert', 'lock', 'update', 'commit']);
    db.done();
  });

  it('fails after one reread if the insert winner disappeared', async () => {
    const db = fakeDb(null, [
      { operation: 'lock' },
      { operation: 'insert' },
      { operation: 'lock' },
    ]);
    await expect(setSkillInstallOverride(db as never, 'user-1', 'first', true)).rejects.toThrow(
      'Settings row could not be locked',
    );
    expect(db.events).toEqual(['begin', 'lock', 'insert', 'lock', 'rollback']);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    db.done();
  });

  it.each([{ settings: null }, { settings: [] }, { settings: 'invalid' }, { settings: undefined }])(
    'refuses malformed existing-row write receipt %j',
    async ({ settings }) => {
      const db = fakeDb(null, [
        { operation: 'lock', rows: [{ settings: {} }] },
        { operation: 'update', rows: settings === undefined ? [] : [{ settings }] },
      ]);
      await expect(setSkillInstallOverride(db as never, 'user-1', 'first', true)).rejects.toThrow(
        'Settings were not returned after saving',
      );
      expect(db.events).toEqual(['begin', 'lock', 'update', 'rollback']);
      db.done();
    },
  );

  it('refuses a malformed insert receipt instead of pretending it was an insertion conflict', async () => {
    const db = fakeDb(null, [
      { operation: 'lock' },
      { operation: 'insert', rows: [{ settings: null }] },
    ]);
    await expect(setSkillInstallOverride(db as never, 'user-1', 'first', true)).rejects.toThrow(
      'Settings were not returned after saving',
    );
    expect(db.events).toEqual(['begin', 'lock', 'insert', 'rollback']);
    db.done();
  });

  it('returns the stored receipt rather than its estimated document', async () => {
    const db = fakeDb(null, [
      { operation: 'lock', rows: [{ settings: {} }] },
      { operation: 'update', rows: [{ settings: { skills: { installs: { receipt: false } } } }] },
    ]);
    const result = await setSkillInstallOverride(db as never, 'user-1', 'first', true);
    expect([...result]).toEqual([['receipt', false]]);
    expect(db.payload()).toEqual({ skills: { installs: { first: true } } });
    db.done();
  });

  it.each([{ skills: null }, { skills: [] }, { skills: 'old' }])(
    'retains malformed namespace normalization for %j',
    async ({ skills }) => {
      const db = fakeDb({ profile: { name: 'keep' }, skills });
      await setSkillInstallOverride(db as never, 'user-1', 'first', true);
      expect(db.payload()).toEqual({
        profile: { name: 'keep' },
        skills: { installs: { first: true } },
      });
    },
  );

  it('does not return success or retry an uncertain commit failure', async () => {
    const db = fakeDb({}, undefined, new Error('Commit acknowledgment lost'));
    await expect(setSkillInstallOverride(db as never, 'user-1', 'first', true)).rejects.toThrow(
      'Commit acknowledgment lost',
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect((await getSkillInstallOverrides(db as never, 'user-1')).get('first')).toBe(true);
    expect(db.events).toEqual(['begin', 'lock', 'update', 'commit-uncertain']);
  });

  it('rolls back a write error without retrying or returning an estimated receipt', async () => {
    const db = fakeDb(null, [
      { operation: 'lock', rows: [{ settings: {} }] },
      { operation: 'update', error: new Error('write failed') },
    ]);
    await expect(setSkillInstallOverride(db as never, 'user-1', 'first', true)).rejects.toThrow(
      'write failed',
    );
    expect(db.events).toEqual(['begin', 'lock', 'update', 'rollback']);
    db.done();
  });
});

describe('skill writes share the exact serialized UTF-16 size policy', () => {
  it.each([100_000, 100_001])(
    'handles final size %s including supplementary characters',
    async (length) => {
      const overhead = JSON.stringify({
        profile: { text: '' },
        skills: { installs: { first: true } },
      }).length;
      const remaining = length - overhead;
      const text = '😀'.repeat(Math.floor(remaining / 2)) + 'a'.repeat(remaining % 2);
      const db = fakeDb({ profile: { text } });
      const pending = setSkillInstallOverride(db as never, 'user-1', 'first', true);
      if (length === 100_000) {
        expect((await pending).get('first')).toBe(true);
        expect(JSON.stringify(db.payload()).length).toBe(length);
        expect(db.events).toEqual(['begin', 'lock', 'update', 'commit']);
      } else {
        await expect(pending).rejects.toMatchObject({
          code: 'VALIDATION_ERROR',
          message: 'Settings payload is too large',
        });
        expect(db.events).toEqual(['begin', 'lock', 'rollback']);
      }
    },
  );

  it('revalidates after an insertion conflict using the winning document', async () => {
    const db = fakeDb(null, [
      { operation: 'lock' },
      { operation: 'insert' },
      { operation: 'lock', rows: [{ settings: { profile: { text: 'x'.repeat(100_000) } } }] },
    ]);
    await expect(
      setSkillInstallOverride(db as never, 'user-1', 'first', true),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.events).toEqual(['begin', 'lock', 'insert', 'lock', 'rollback']);
    db.done();
  });

  it('includes existing sibling growth, not only the new override', async () => {
    const current = {
      profile: { text: 'x'.repeat(60_000) },
      general: { text: 'y'.repeat(40_000) },
    };
    const db = fakeDb(current);
    await expect(
      setSkillInstallOverride(db as never, 'user-1', 'first', false),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.events).toEqual(['begin', 'lock', 'rollback']);
  });

  it('rejects an already oversized no-op uninstall rather than silently exempting it', async () => {
    const db = fakeDb({
      profile: { text: 'x'.repeat(100_000) },
      skills: { installs: { first: false } },
    });
    await expect(
      setSkillInstallOverride(db as never, 'user-1', 'first', false),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.events).toEqual(['begin', 'lock', 'rollback']);
  });
});
