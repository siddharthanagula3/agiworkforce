import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { toSkill } from '@/features/plugins/server/directory/installed-skills';
import { loadSkillOrigins } from '@/lib/services/skill-origin-service';

const SKILL = {
  name: 'fixture-brief',
  description: 'Writes a brief.',
  body: 'Write it.',
  path: 'skills/fixture-brief/SKILL.md',
};

function recordingDb(rows: unknown[] = []) {
  const query = vi.fn(async () => rows);
  return { db: { query } as unknown as DatabaseAdapter, query };
}

describe('loadSkillOrigins', () => {
  it('names a skill provisioned by a workspace plugin as coming from the workspace', async () => {
    const { db, query } = recordingDb();
    const skill = toSkill('fixture-workspace-pack', SKILL, 'Fixture workspace pack');

    const originOf = await loadSkillOrigins(db, 'user-1', [skill]);

    expect(originOf(skill)).toEqual({
      kind: 'workspace',
      pluginId: 'fixture-workspace-pack',
      pluginName: 'Fixture workspace pack',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps a skill from a plugin the account installed itself out of the workspace group', async () => {
    const { db } = recordingDb([
      {
        plugin_key: 'fixture-own-pack',
        name: 'Fixture own pack',
        source_name: 'fixture-marketplace',
        kind: 'repository',
        installed_at: null,
      },
    ]);
    const skill = toSkill('fixture-own-pack', SKILL);

    const originOf = await loadSkillOrigins(db, 'user-1', [skill]);

    expect(originOf(skill)).toMatchObject({ kind: 'repository', pluginName: 'Fixture own pack' });
  });
});
