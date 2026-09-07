import { describe, expect, it } from 'vitest';

import { buildSkillMarkdown, parseSkillDraftFromMarkdown, validateSkillDraft } from '../validation';

const VALID_DRAFT = {
  name: 'release-notes',
  description: 'Draft release notes from a diff.',
  body: 'Summarize the diff into a changelog entry.',
};

describe('buildSkillMarkdown', () => {
  it('composes a frontmatter fence around the trimmed body', () => {
    expect(buildSkillMarkdown(VALID_DRAFT)).toBe(
      '---\nname: release-notes\ndescription: Draft release notes from a diff.\n---\n\nSummarize the diff into a changelog entry.\n',
    );
  });
});

describe('validateSkillDraft', () => {
  it('accepts a well-formed draft', () => {
    expect(validateSkillDraft(VALID_DRAFT)).toEqual({ ok: true, errors: [] });
  });

  it('rejects an empty name', () => {
    const result = validateSkillDraft({ ...VALID_DRAFT, name: '' });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Name is required.');
  });

  it('rejects a name with uppercase or spaces', () => {
    const result = validateSkillDraft({ ...VALID_DRAFT, name: 'Release Notes' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/lowercase letters, numbers and hyphens/);
  });

  it('rejects an empty description', () => {
    const result = validateSkillDraft({ ...VALID_DRAFT, description: '   ' });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Description is required.');
  });

  it('rejects an empty body', () => {
    const result = validateSkillDraft({ ...VALID_DRAFT, body: '' });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Skill instructions are required.');
  });

  it('rejects a name that overflows the frontmatter limit', () => {
    const result = validateSkillDraft({ ...VALID_DRAFT, name: 'a'.repeat(65) });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/64 characters or fewer/);
  });

  it('rejects a reserved frontmatter key smuggled through the description', () => {
    const result = validateSkillDraft({
      ...VALID_DRAFT,
      description: 'safe text\n__proto__: polluted',
    });
    expect(result.ok).toBe(false);
  });
});

describe('parseSkillDraftFromMarkdown', () => {
  it('turns a whole SKILL.md into the three editor fields', () => {
    const result = parseSkillDraftFromMarkdown(
      [
        '---',
        'name: release-notes',
        'description: Draft release notes.',
        '---',
        '',
        'Step one.',
      ].join('\n'),
    );

    expect(result).toEqual({
      ok: true,
      draft: { name: 'release-notes', description: 'Draft release notes.', body: 'Step one.' },
    });
  });

  it('ignores frontmatter keys the editor does not hold', () => {
    const result = parseSkillDraftFromMarkdown(
      [
        '---',
        'name: release-notes',
        'description: Draft release notes.',
        'version: 2.1.0',
        'draft: true',
        '---',
        '',
        'Step one.',
      ].join('\n'),
    );

    expect(result.ok).toBe(true);
  });

  it('says what is wrong when the file has no frontmatter at all', () => {
    const result = parseSkillDraftFromMarkdown('# Just a heading\n\nSome prose.');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ errors: [expect.stringContaining('no SKILL.md frontmatter')] });
  });

  it('reports the same validation errors the editor already shows', () => {
    const result = parseSkillDraftFromMarkdown(
      [
        '---',
        'name: Release Notes',
        'description: Draft release notes.',
        '---',
        '',
        'Step one.',
      ].join('\n'),
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ errors: [expect.stringContaining('lowercase letters')] });
  });

  it('refuses a file whose body is empty', () => {
    const result = parseSkillDraftFromMarkdown(
      ['---', 'name: release-notes', 'description: Draft release notes.', '---', ''].join('\n'),
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errors: [expect.stringContaining('instructions are required')],
    });
  });
});
