import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createUserSkill,
  deleteUserSkill,
  findUserSkillByName,
  listUserSkills,
  toUserSkillSummary,
  updateUserSkill,
} from './user-skill-service';

interface FakeDb {
  query: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
}

const ROW = {
  id: 'skill-1',
  name: 'release-notes',
  description: 'Draft release notes from a diff.',
  body: 'Summarize the diff.',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

const DRAFT = {
  name: 'release-notes',
  description: 'Draft release notes from a diff.',
  body: 'Summarize the diff.',
};

function makeDb(overrides: Partial<FakeDb> = {}): FakeDb {
  return {
    query: vi.fn(async () => [ROW]),
    execute: vi.fn(async () => 1),
    ...overrides,
  };
}

describe('user skill service', () => {
  it('lists a user skill scoped to their own id', async () => {
    const db = makeDb();
    await listUserSkills(db as never, 'user_1');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('from user_skills'), ['user_1']);
  });

  it('finds one skill by user and name', async () => {
    const db = makeDb();
    const found = await findUserSkillByName(db as never, 'user_1', 'release-notes');
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['user_1', 'release-notes']);
    expect(found).toEqual({
      id: 'skill-1',
      name: 'release-notes',
      description: 'Draft release notes from a diff.',
      body: 'Summarize the diff.',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('returns null when a skill lookup finds nothing', async () => {
    const db = makeDb({ query: vi.fn(async () => []) });
    await expect(findUserSkillByName(db as never, 'user_1', 'missing')).resolves.toBeNull();
  });

  it('rejects an invalid draft before issuing any query', async () => {
    const db = makeDb();
    await expect(createUserSkill(db as never, 'user_1', { ...DRAFT, name: '' })).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('creates a skill for the authenticated user', async () => {
    const db = makeDb();
    const created = await createUserSkill(db as never, 'user_1', DRAFT);
    expect(created.name).toBe('release-notes');
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into user_skills');
    expect(params).toEqual(['user_1', 'release-notes', DRAFT.description, DRAFT.body]);
  });

  it('turns a unique-constraint violation into a conflict error', async () => {
    const db = makeDb({
      query: vi.fn(async () => {
        throw { code: '23505' };
      }),
    });
    await expect(createUserSkill(db as never, 'user_1', DRAFT)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('updates a skill scoped to the current name and owner', async () => {
    const db = makeDb();
    const updated = await updateUserSkill(db as never, 'user_1', 'old-name', DRAFT);
    expect(updated?.name).toBe('release-notes');
    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['user_1', 'old-name', 'release-notes', DRAFT.description, DRAFT.body]);
  });

  it('returns null updating a skill that does not belong to this user', async () => {
    const db = makeDb({ query: vi.fn(async () => []) });
    await expect(updateUserSkill(db as never, 'user_1', 'old-name', DRAFT)).resolves.toBeNull();
  });

  it('deletes a skill scoped to the owning user and reports whether a row was removed', async () => {
    const db = makeDb();
    await expect(deleteUserSkill(db as never, 'user_1', 'release-notes')).resolves.toBe(true);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('delete from user_skills'), [
      'user_1',
      'release-notes',
    ]);

    const emptyDb = makeDb({ execute: vi.fn(async () => 0) });
    await expect(deleteUserSkill(emptyDb as never, 'user_1', 'missing')).resolves.toBe(false);
  });

  it('projects a record into the merged-catalog summary shape', () => {
    expect(
      toUserSkillSummary({
        id: 'skill-1',
        name: 'release-notes',
        description: 'Draft release notes from a diff.',
        body: 'Summarize the diff.',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }),
    ).toEqual({
      name: 'release-notes',
      description: 'Draft release notes from a diff.',
      source: 'personal',
      lifecycle: 'included',
      downloadable: false,
      editable: true,
    });
  });
});
