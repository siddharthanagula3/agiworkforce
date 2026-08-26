import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getManagedSkillPluginOwners } from '@/lib/services/skill-catalog-service';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0145_web_pack_example_prompts.sql'),
  'utf8',
);

const DECLARED_SKILLS_BY_PACK: Record<string, string[]> = {
  'engineering-pack': ['code-review', 'systematic-debugging', 'frontend-design-review'],
  'writing-pack': ['document-creation', 'presentation-creation', 'research-and-citations'],
  'data-pack': ['data-analysis', 'document-creation'],
};

describe('0145 web pack example prompts migration', () => {
  it('declares the three new packs with exactly the skills this SQL claims', () => {
    for (const skills of Object.values(DECLARED_SKILLS_BY_PACK)) {
      expect(migration).toContain(`'[${skills.map((skill) => `"${skill}"`).join(', ')}]'::jsonb`);
    }
  });

  it(
    'proves none of the three new packs actually gates a skill it declares — ' +
      'installing them cannot change what GET /api/skills serves',
    async () => {
      const owners = await getManagedSkillPluginOwners();
      for (const [pluginId, skills] of Object.entries(DECLARED_SKILLS_BY_PACK)) {
        for (const skill of skills) {
          expect(owners.get(skill), `${skill} declared by ${pluginId}`).toBeUndefined();
        }
      }
    },
  );

  it('keeps research-pack the one pack whose declared skill is actually gated by install', async () => {
    const owners = await getManagedSkillPluginOwners();
    expect(owners.get('literature-review')).toBe('research-pack');
  });
});
