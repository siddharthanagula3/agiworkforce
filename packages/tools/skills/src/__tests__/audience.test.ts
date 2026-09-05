import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  filterSkillsForProductAudience,
  parseSkillAudienceManifest,
  skillAudience,
  skillManifestId,
  DEVELOPER_SKILL_AUDIENCE,
  PRODUCT_SKILL_AUDIENCE,
} from '../audience';
import type { Skill } from '../types';

const MANIFEST_ROOT = join('/repo', '.agents', 'skills');

const MANIFEST = JSON.stringify({
  skills: {
    'data-analysis': { audience: PRODUCT_SKILL_AUDIENCE },
    'model-orchestration': { audience: DEVELOPER_SKILL_AUDIENCE },
    'loose-note': { audience: PRODUCT_SKILL_AUDIENCE },
    'mislabelled-skill': { audience: 'everyone' },
    unclassified: {},
  },
});

function skill(filePath: string, name: string): Skill {
  return {
    name,
    description: `${name} does things`,
    body: 'Body.',
    contentHash: 'sha256:test',
    filePath,
    source: 'bundled',
    metadata: {},
    frontmatter: {},
  };
}

function packagedSkill(id: string, name = id): Skill {
  return skill(join(MANIFEST_ROOT, id, 'SKILL.md'), name);
}

describe('parseSkillAudienceManifest', () => {
  it('reads only the declared audiences it recognises', () => {
    const manifest = parseSkillAudienceManifest(MANIFEST);

    expect(manifest.get('data-analysis')).toBe(PRODUCT_SKILL_AUDIENCE);
    expect(manifest.get('model-orchestration')).toBe(DEVELOPER_SKILL_AUDIENCE);
    expect(manifest.has('mislabelled-skill')).toBe(false);
    expect(manifest.has('unclassified')).toBe(false);
  });

  it('returns an empty manifest for a lock file with no skills object', () => {
    expect(parseSkillAudienceManifest(JSON.stringify({ version: 2 })).size).toBe(0);
  });
});

describe('skillManifestId', () => {
  it('uses the package directory rather than the declared skill name', () => {
    expect(
      skillManifestId(packagedSkill('ms-frontend-design-review', 'frontend-design-review')),
    ).toBe('ms-frontend-design-review');
  });

  it('uses the file name for a single-file skill', () => {
    expect(skillManifestId(skill(join(MANIFEST_ROOT, 'loose-note.md'), 'loose-note'))).toBe(
      'loose-note',
    );
  });
});

describe('skillAudience', () => {
  it('treats an unlisted, unrecognised or unclassified skill as developer only', () => {
    const manifest = parseSkillAudienceManifest(MANIFEST);

    expect(skillAudience(packagedSkill('data-analysis'), manifest)).toBe(PRODUCT_SKILL_AUDIENCE);
    expect(skillAudience(packagedSkill('mislabelled-skill'), manifest)).toBe(
      DEVELOPER_SKILL_AUDIENCE,
    );
    expect(skillAudience(packagedSkill('unclassified'), manifest)).toBe(DEVELOPER_SKILL_AUDIENCE);
    expect(skillAudience(packagedSkill('never-locked'), manifest)).toBe(DEVELOPER_SKILL_AUDIENCE);
  });
});

describe('filterSkillsForProductAudience', () => {
  const manifest = parseSkillAudienceManifest(MANIFEST);

  it('keeps a product skill and drops every developer skill under the manifest root', () => {
    const kept = filterSkillsForProductAudience(
      [
        packagedSkill('data-analysis'),
        packagedSkill('model-orchestration'),
        packagedSkill('mislabelled-skill'),
        packagedSkill('never-locked'),
      ],
      manifest,
      MANIFEST_ROOT,
    );

    expect(kept.map((entry) => entry.name)).toEqual(['data-analysis']);
  });

  it('leaves skills outside the manifest root untouched', () => {
    const deploymentSkill = skill(join('/srv', 'skills', 'house-style', 'SKILL.md'), 'house-style');
    const siblingRootSkill = skill(
      join('/repo', '.agents', 'skills-archive', 'model-orchestration', 'SKILL.md'),
      'model-orchestration',
    );

    const kept = filterSkillsForProductAudience(
      [deploymentSkill, siblingRootSkill],
      manifest,
      MANIFEST_ROOT,
    );

    expect(kept).toEqual([deploymentSkill, siblingRootSkill]);
  });
});
