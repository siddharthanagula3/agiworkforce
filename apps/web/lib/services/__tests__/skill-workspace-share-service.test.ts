import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

type SkillModule = typeof import('@/lib/services/user-skill-service');

const mocks = vi.hoisted(() => ({ findUserSkillByName: vi.fn(), findUserSkillWithFiles: vi.fn() }));

vi.mock('@/lib/services/user-skill-service', async (importOriginal) => ({
  ...(await importOriginal<SkillModule>()),
  findUserSkillByName: mocks.findUserSkillByName,
  findUserSkillWithFiles: mocks.findUserSkillWithFiles,
}));

import { personalSkillAsWorkspacePlugin } from '../skill-workspace-share-service';

const db = {} as DatabaseAdapter;

beforeEach(() => {
  mocks.findUserSkillByName.mockReset();
  mocks.findUserSkillWithFiles.mockReset();
});

describe('personal skill to workspace plugin', () => {
  it('packages the SKILL.md and every bundled file under the plugin skills folder', async () => {
    mocks.findUserSkillByName.mockResolvedValue({
      id: 'skill-1',
      name: 'release-notes',
      description: 'Draft release notes.',
      body: 'Group by area.',
      createdAt: '',
      updatedAt: '',
    });
    mocks.findUserSkillWithFiles.mockResolvedValue({
      skill: { name: 'release-notes' },
      access: {
        listFiles: async () => [{ path: 'templates/notes.md', size: 10 }],
        readFile: async (_skill: unknown, path: string) => ({ ok: true, path, content: '# Notes' }),
      },
    });
    const plugin = await personalSkillAsWorkspacePlugin(db, 'user_1', 'release-notes');
    expect(plugin).toMatchObject({ key: 'release-notes', name: 'release-notes' });
    expect(plugin.skills[0]).toMatchObject({
      name: 'release-notes',
      path: 'skills/release-notes/SKILL.md',
      files: [{ path: 'skills/release-notes/templates/notes.md', content: '# Notes' }],
    });
    expect(plugin.skills[0]?.content).toContain('name: release-notes');
    expect(plugin.skills[0]?.content).toContain('Group by area.');
  });

  it('refuses a skill that is not the caller’s, and one whose file cannot be read', async () => {
    mocks.findUserSkillByName.mockResolvedValue(null);
    mocks.findUserSkillWithFiles.mockResolvedValue(null);
    await expect(personalSkillAsWorkspacePlugin(db, 'user_1', 'nope')).rejects.toThrow(
      'Skill not found',
    );

    mocks.findUserSkillByName.mockResolvedValue({
      id: 'skill-1',
      name: 'release-notes',
      description: 'Draft release notes.',
      body: 'Group by area.',
      createdAt: '',
      updatedAt: '',
    });
    mocks.findUserSkillWithFiles.mockResolvedValue({
      skill: { name: 'release-notes' },
      access: {
        listFiles: async () => [{ path: 'big.bin', size: 10 }],
        readFile: async () => ({ ok: false, reason: 'too_large' }),
      },
    });
    await expect(personalSkillAsWorkspacePlugin(db, 'user_1', 'release-notes')).rejects.toThrow(
      'big.bin could not be read',
    );
  });
});
