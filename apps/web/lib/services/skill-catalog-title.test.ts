import { describe, expect, it } from 'vitest';
import { hashSkillContent, type Skill } from '@agiworkforce/skills';
import { MANAGED_SKILL_TITLE_MAX_CHARS } from '@agiworkforce/cloud-contracts';
import { managedSkillTitle } from './skill-catalog-service';

function skill(body: string): Skill {
  return {
    name: 'catalog-fixture',
    description: 'Canonical description.',
    body,
    contentHash: hashSkillContent(Buffer.from(body, 'utf8')),
    filePath: '/fixture/SKILL.md',
    source: 'bundled',
    metadata: {},
    frontmatter: {},
  };
}

describe('canonical skill summary titles', () => {
  it('projects a plain-text title from the canonical heading without changing identity', () => {
    const entry = skill('# **A/B** Test [Setup](https://example.test)\n\nInstructions.');
    expect(managedSkillTitle(entry)).toBe('A/B Test Setup');
    expect(entry.name).toBe('catalog-fixture');
    expect(entry.description).toBe('Canonical description.');
  });

  it('ignores code-fenced headings and removes inline HTML markup', () => {
    expect(managedSkillTitle(skill('~~~md\n# Example\n~~~\n\n# <span>NDA</span> Triage'))).toBe(
      'NDA Triage',
    );
  });

  it('leaves older heading-free summaries without an invented title', () => {
    expect(managedSkillTitle(skill('Instructions without a heading.'))).toBeUndefined();
  });

  it('bounds titles through the shared wire contract', () => {
    expect(
      managedSkillTitle(skill(`# ${'x'.repeat(MANAGED_SKILL_TITLE_MAX_CHARS + 1)}`)),
    ).toBeUndefined();
  });

  it('recomputes derived titles when the canonical content hash changes', () => {
    const entry = skill('# Original title');
    expect(managedSkillTitle(entry)).toBe('Original title');
    entry.body = '# Updated title';
    entry.contentHash = hashSkillContent(Buffer.from(entry.body, 'utf8'));
    expect(managedSkillTitle(entry)).toBe('Updated title');
  });
});
