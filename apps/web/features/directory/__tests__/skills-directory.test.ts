import type { ManagedSkillSummary } from '@agiworkforce/cloud-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSkillDetail,
  skillPublisher,
  toSkillEntry,
  toSkillSection,
} from '../services/skills-directory';

afterEach(() => {
  vi.unstubAllGlobals();
});

function skill(patch: Partial<ManagedSkillSummary> = {}): ManagedSkillSummary {
  return {
    name: 'canvas-design',
    description: 'Create visual art',
    source: 'bundled',
    lifecycle: 'included',
    downloadable: true,
    ...patch,
  };
}

describe('skillPublisher', () => {
  it('names the account for skills the user authored', () => {
    expect(skillPublisher('personal')).toBe('You');
    expect(skillPublisher('project')).toBe('You');
    expect(skillPublisher('workspace')).toBe('You');
  });

  it('names the managed layer and falls back to the product', () => {
    expect(skillPublisher('managed-local')).toBe('Managed');
    expect(skillPublisher('bundled')).toBe('AGI');
    expect(skillPublisher('extra')).toBe('AGI');
  });
});

describe('toSkillEntry', () => {
  it('renders a bundled skill as a slash name under the AGI source', () => {
    const entry = toSkillEntry(skill());
    expect(entry).toMatchObject({
      id: 'canvas-design',
      slashName: true,
      publisher: 'AGI',
      sourceId: 'agi',
      facets: { lifecycle: ['included'] },
    });
  });

  it('renders an authored skill under the Yours source', () => {
    const entry = toSkillEntry(skill({ source: 'personal', editable: true }));
    expect(entry.sourceId).toBe('yours');
  });

  it('never invents an install count or an updated date', () => {
    const entry = toSkillEntry(skill());
    expect(entry.installCount).toBeUndefined();
    expect(entry.updatedAt).toBeUndefined();
  });
});

describe('toSkillSection', () => {
  it('offers only the sources the catalog actually has', () => {
    const section = toSkillSection([skill()]);
    expect(section.sources?.map((source) => source.id)).toEqual(['agi']);
  });

  it('offers both sources once the user has authored a skill', () => {
    const section = toSkillSection([skill(), skill({ name: 'mine', source: 'personal' })]);
    expect(section.sources?.map((source) => source.id)).toEqual(['agi', 'yours']);
  });

  it('hides the status filter when every skill shares one lifecycle', () => {
    expect(toSkillSection([skill()]).filterGroups).toEqual([]);
  });

  it('offers the status filter once a draft skill exists', () => {
    const section = toSkillSection([skill(), skill({ name: 'later', lifecycle: 'draft' })]);
    expect(section.filterGroups?.[0]?.id).toBe('lifecycle');
  });

  it('offers only the sorts the data supports', () => {
    expect(toSkillSection([skill()]).sortOptions).toEqual(['name']);
  });

  it('declares skills as not installable, since no route installs one', () => {
    expect(toSkillSection([skill()]).installable).toBe(false);
  });
});

describe('fetchSkillDetail', () => {
  it('reads the skill body and presents it as a one file tree', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ body: '# Canvas' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const detail = await fetchSkillDetail('canvas-design', [skill()]);

    expect(fetchMock).toHaveBeenCalledWith('/api/skills/canvas-design', { cache: 'no-store' });
    expect(detail).toMatchObject({
      kind: 'skill',
      name: 'canvas-design',
      publisher: 'AGI',
      description: 'Create visual art',
      files: [{ path: 'SKILL.md', content: '# Canvas' }],
    });
  });

  it('marks an authored skill editable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ body: 'x' }) }),
    );
    const detail = await fetchSkillDetail('mine', [
      skill({ name: 'mine', source: 'personal', editable: true }),
    ]);
    expect(detail?.editable).toBe(true);
  });

  it('returns null for a skill the catalog does not list', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchSkillDetail('missing', [skill()])).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the body request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchSkillDetail('canvas-design', [skill()])).rejects.toThrow(
      'skill detail failed: 500',
    );
  });

  it('encodes a name with a slash into the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ body: '' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchSkillDetail('a/b', [skill({ name: 'a/b' })]);
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/a%2Fb', { cache: 'no-store' });
  });
});
