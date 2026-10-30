import { describe, expect, it } from 'vitest';

import {
  MANAGED_SKILL_TITLE_MAX_CHARS,
  ManagedSkillsResponseSchema,
  parseManagedSkillsResponse,
} from '../skills';

describe('Managed Skills directory contract', () => {
  it('accepts an optional friendly title while retaining canonical IDs and old summaries', () => {
    const base = {
      name: 'triage-nda',
      description: 'Review confidentiality agreements.',
      source: 'bundled',
      lifecycle: 'included',
      downloadable: true,
    };
    const parsed = parseManagedSkillsResponse({
      skills: [base, { ...base, title: '  NDA Triage  ' }],
    });
    expect(parsed.skills[0]).not.toHaveProperty('title');
    expect(parsed.skills[1]).toMatchObject({
      name: base.name,
      title: 'NDA Triage',
      description: base.description,
    });
    expect(
      ManagedSkillsResponseSchema.safeParse({
        skills: [{ ...base, title: 'x'.repeat(MANAGED_SKILL_TITLE_MAX_CHARS + 1) }],
      }).success,
    ).toBe(false);
  });
  it('normalizes the complete lifecycle-aware response used by every surface', () => {
    expect(
      parseManagedSkillsResponse({
        skills: [
          {
            name: '  fixture-review  ',
            description: '  Review a fixture safely.  ',
            source: 'bundled',
            lifecycle: 'included',
            downloadable: true,
          },
          {
            name: 'fixture-draft',
            description: 'Not executable yet.',
            source: 'bundled',
            lifecycle: 'draft',
            downloadable: false,
          },
        ],
      }),
    ).toEqual({
      skills: [
        {
          name: 'fixture-review',
          description: 'Review a fixture safely.',
          source: 'bundled',
          lifecycle: 'included',
          downloadable: true,
        },
        {
          name: 'fixture-draft',
          description: 'Not executable yet.',
          source: 'bundled',
          lifecycle: 'draft',
          downloadable: false,
        },
      ],
    });
  });

  it.each([
    { lifecycle: 'draft', source: 'bundled' },
    { lifecycle: 'included', source: 'workspace' },
  ])('rejects a downloadable entry that is not an included bundle: %o', (entry) => {
    expect(() =>
      ManagedSkillsResponseSchema.parse({
        skills: [
          {
            name: 'fixture-invalid-download',
            description: '',
            downloadable: true,
            ...entry,
          },
        ],
      }),
    ).toThrow();
  });

  it('accepts an editable personal skill and omits editable when unset', () => {
    expect(
      parseManagedSkillsResponse({
        skills: [
          {
            name: 'fixture-personal',
            description: 'Authored in the browser.',
            source: 'personal',
            lifecycle: 'included',
            downloadable: false,
            editable: true,
          },
        ],
      }).skills[0],
    ).toEqual({
      name: 'fixture-personal',
      description: 'Authored in the browser.',
      source: 'personal',
      lifecycle: 'included',
      downloadable: false,
      editable: true,
    });
  });

  it('rejects entries that omit lifecycle instead of guessing they are executable', () => {
    expect(() =>
      ManagedSkillsResponseSchema.parse({
        skills: [
          {
            name: 'fixture-legacy-entry',
            description: '',
            source: 'bundled',
            downloadable: false,
          },
        ],
      }),
    ).toThrow();
  });
});
