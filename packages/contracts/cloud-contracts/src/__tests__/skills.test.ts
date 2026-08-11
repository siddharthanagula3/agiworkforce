import { describe, expect, it } from 'vitest';

import { ManagedSkillsResponseSchema, parseManagedSkillsResponse } from '../skills';

describe('Managed Skills directory contract', () => {
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
