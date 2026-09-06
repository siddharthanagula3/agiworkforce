import { describe, expect, it, vi } from 'vitest';

import type { Skill } from '@agiworkforce/skills';
import type { UserSkillRecord } from '@/lib/services/user-skill-service';

vi.mock('@/lib/services/user-skill-service', () => ({
  findUserSkillByName: vi.fn(),
}));
vi.mock('@/features/plugins/server/directory/installed-skills', () => ({
  listInstalledDirectorySkills: vi.fn(async () => []),
}));

import { findUserSkillByName } from '@/lib/services/user-skill-service';
import { listInstalledDirectorySkills } from '@/features/plugins/server/directory/installed-skills';
import {
  applyManagedSkillSelection,
  ChatCompletionRequestSchema,
  collectManagedPromptMaterials,
  resolveManagedSkillCatalogWithUserFallback,
  toManagedSkillFromUserSkill,
} from './request-processor';

const mockedFindUserSkillByName = vi.mocked(findUserSkillByName);

function userSkillRecord(overrides: Partial<UserSkillRecord> = {}): UserSkillRecord {
  return {
    id: 'user-skill-1',
    name: 'my-standup-notes',
    description: 'Format my daily standup notes.',
    body: 'MY STANDUP SKILL BODY',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

const fakeDb = {} as Parameters<typeof findUserSkillByName>[0];

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'design-review',
    description: 'Review UI for release polish.',
    body: 'PRIVATE SKILL BODY',
    contentHash: `sha256:${'0'.repeat(64)}`,
    filePath: '/srv/private/skills/design-review/SKILL.md',
    source: 'personal',
    metadata: {},
    frontmatter: {},
    ...overrides,
  };
}

describe('managed Skill request contract', () => {
  it('accepts a bounded catalog name and rejects path-shaped or control-character input', () => {
    const base = { model: 'test-model', messages: [{ role: 'user', content: 'Review this' }] };

    expect(
      ChatCompletionRequestSchema.safeParse({ ...base, skill_name: 'design-review' }).success,
    ).toBe(true);
    expect(
      ChatCompletionRequestSchema.safeParse({ ...base, skill_name: '../../secret' }).success,
    ).toBe(false);
    expect(
      ChatCompletionRequestSchema.safeParse({ ...base, skill_name: 'bad\\name' }).success,
    ).toBe(false);
    expect(
      ChatCompletionRequestSchema.safeParse({ ...base, skill_name: 'bad\u0000name' }).success,
    ).toBe(false);
  });

  it('injects selected metadata and the server-owned tool without sending the body or host location', () => {
    const request = ChatCompletionRequestSchema.parse({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Review this' }],
      skill_name: 'design-review',
    });

    const result = applyManagedSkillSelection(request, [skill()]);

    expect(result).toEqual({ ok: true });
    expect(request.messages[0]).toMatchObject({ role: 'system' });
    expect(String(request.messages[0]?.content)).toContain('<selected>true</selected>');
    expect(String(request.messages[0]?.content)).toContain('action=load');
    expect(JSON.stringify(request.messages)).not.toContain('PRIVATE SKILL BODY');
    expect(JSON.stringify(request.messages)).not.toContain('/srv/private');
    expect(request.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'skill' }),
      }),
    ]);
    expect(request.tool_choice).toEqual({
      type: 'function',
      function: { name: 'skill' },
    });

    const promptMaterials = collectManagedPromptMaterials(request);
    expect(promptMaterials).toEqual(
      expect.arrayContaining([
        expect.stringContaining('<selected>true</selected>'),
        expect.stringContaining('"name":"skill"'),
      ]),
    );
    expect(JSON.stringify(promptMaterials)).not.toContain('PRIVATE SKILL BODY');
    expect(JSON.stringify(promptMaterials)).not.toContain('/srv/private');
  });

  it('fails explicitly when the selected name is absent instead of silently falling back', () => {
    const request = ChatCompletionRequestSchema.parse({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Review this' }],
      skill_name: 'missing-skill',
    });

    expect(applyManagedSkillSelection(request, [skill()])).toEqual({
      ok: false,
      code: 'skill_not_found',
      message: 'The selected skill is not available.',
    });
    expect(request.messages).toEqual([{ role: 'user', content: 'Review this' }]);
    expect(request.tools).toBeUndefined();
  });
});

describe('user-owned skill fallback', () => {
  it('leaves the managed catalog untouched when the name already resolves there', async () => {
    mockedFindUserSkillByName.mockClear();
    const managedCatalog = [skill()];

    const result = await resolveManagedSkillCatalogWithUserFallback(
      'design-review',
      managedCatalog,
      {
        db: fakeDb,
        userId: 'user-1',
      },
    );

    expect(result).toBe(managedCatalog);
    expect(mockedFindUserSkillByName).not.toHaveBeenCalled();
  });

  it("resolves a chat turn's selected skill from the caller's own skills when absent from the managed catalog", async () => {
    mockedFindUserSkillByName.mockClear();
    mockedFindUserSkillByName.mockResolvedValueOnce(userSkillRecord());
    const managedCatalog = [skill()];

    const catalog = await resolveManagedSkillCatalogWithUserFallback(
      'my-standup-notes',
      managedCatalog,
      { db: fakeDb, userId: 'user-1' },
    );

    expect(mockedFindUserSkillByName).toHaveBeenCalledWith(fakeDb, 'user-1', 'my-standup-notes');
    expect(catalog).toHaveLength(2);
    expect(catalog).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'design-review' })]),
    );

    const request = ChatCompletionRequestSchema.parse({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Format my notes' }],
      skill_name: 'my-standup-notes',
    });
    expect(applyManagedSkillSelection(request, catalog)).toEqual({ ok: true });
    expect(JSON.stringify(request.messages)).not.toContain('MY STANDUP SKILL BODY');
  });

  it('falls back to the installed directory skills after the account skills', async () => {
    mockedFindUserSkillByName.mockClear();
    mockedFindUserSkillByName.mockResolvedValueOnce(null);
    const directorySkill = { ...skill(), name: 'background-removal', source: 'extra' as const };
    vi.mocked(listInstalledDirectorySkills).mockResolvedValueOnce([directorySkill]);
    const managedCatalog = [skill()];

    const catalog = await resolveManagedSkillCatalogWithUserFallback(
      'background-removal',
      managedCatalog,
      { db: fakeDb, userId: 'user-1' },
    );

    expect(listInstalledDirectorySkills).toHaveBeenCalledWith(fakeDb, 'user-1');
    expect(catalog.map((entry) => entry.name)).toEqual([skill().name, 'background-removal']);
  });

  it('keeps the not-found result when the name matches neither catalog', async () => {
    mockedFindUserSkillByName.mockClear();
    mockedFindUserSkillByName.mockResolvedValueOnce(null);
    const managedCatalog = [skill()];

    const catalog = await resolveManagedSkillCatalogWithUserFallback(
      'nowhere-skill',
      managedCatalog,
      {
        db: fakeDb,
        userId: 'user-1',
      },
    );
    expect(catalog).toBe(managedCatalog);

    const request = ChatCompletionRequestSchema.parse({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Format my notes' }],
      skill_name: 'nowhere-skill',
    });
    expect(applyManagedSkillSelection(request, catalog)).toEqual({
      ok: false,
      code: 'skill_not_found',
      message: 'The selected skill is not available.',
    });
  });

  it('carries the record body and a personal source into the converted catalog entry', () => {
    const converted = toManagedSkillFromUserSkill(userSkillRecord());

    expect(converted.name).toBe('my-standup-notes');
    expect(converted.body).toBe('MY STANDUP SKILL BODY');
    expect(converted.source).toBe('personal');
    expect(converted.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
