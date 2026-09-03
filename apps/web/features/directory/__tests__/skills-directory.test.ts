import type { ManagedSkillSummary } from '@agiworkforce/cloud-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchInstalledSkillNames,
  fetchSkillDetail,
  fetchSkillFileContent,
  installSkill,
  isAuthoredSkill,
  mergeSkillCatalog,
  resetSkillCatalogMemory,
  skillPublisher,
  toSkillEntry,
  toSkillSection,
  uninstallSkill,
} from '../services/skills-directory';

const CSRF = 'token-1';

beforeEach(() => {
  resetSkillCatalogMemory();
});

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

function jsonOnce(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
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
    const entry = toSkillEntry(skill(), new Set(['canvas-design']));
    expect(entry).toMatchObject({
      id: 'canvas-design',
      slashName: true,
      publisher: 'AGI',
      sourceId: 'agi',
      installed: true,
      facets: { lifecycle: ['included'], status: ['installed'] },
    });
  });

  it('marks a managed skill the account uninstalled', () => {
    const entry = toSkillEntry(skill(), new Set());
    expect(entry.installed).toBe(false);
    expect(entry.facets?.['status']).toEqual(['not-installed']);
  });

  it('treats an authored skill as installed without an install record', () => {
    expect(isAuthoredSkill(skill({ source: 'personal' }))).toBe(true);
    const entry = toSkillEntry(skill({ name: 'mine', source: 'personal' }), new Set());
    expect(entry.sourceId).toBe('yours');
    expect(entry.installed).toBe(true);
  });

  it('never invents an install count or an updated date', () => {
    const entry = toSkillEntry(skill(), new Set());
    expect(entry.installCount).toBeUndefined();
    expect(entry.updatedAt).toBeUndefined();
  });
});

describe('toSkillSection', () => {
  const installedAll = new Set(['canvas-design', 'mine', 'later']);

  it('offers only the sources the catalog actually has', () => {
    expect(toSkillSection([skill()], installedAll).sources?.map((s) => s.id)).toEqual(['agi']);
  });

  it('offers both sources once the user has authored a skill', () => {
    const section = toSkillSection(
      [skill(), skill({ name: 'mine', source: 'personal' })],
      installedAll,
    );
    expect(section.sources?.map((s) => s.id)).toEqual(['agi', 'yours']);
  });

  it('hides the lifecycle filter when every skill shares one lifecycle', () => {
    expect(toSkillSection([skill()], installedAll).filterGroups).toEqual([]);
  });

  it('offers the lifecycle filter once a draft skill exists', () => {
    const section = toSkillSection(
      [skill(), skill({ name: 'later', lifecycle: 'draft' })],
      installedAll,
    );
    expect(section.filterGroups?.map((group) => group.id)).toEqual(['lifecycle']);
  });

  it('offers the status filter once both install states exist', () => {
    const section = toSkillSection([skill(), skill({ name: 'later' })], new Set(['canvas-design']));
    expect(section.filterGroups?.map((group) => group.id)).toEqual(['status']);
  });

  it('declares skills installable now that install routes exist', () => {
    expect(toSkillSection([skill()], installedAll).installable).toBe(true);
  });

  it('offers only the sorts the data supports', () => {
    expect(toSkillSection([skill()], installedAll).sortOptions).toEqual(['name']);
  });
});

describe('mergeSkillCatalog', () => {
  it('keeps a skill the listing dropped after an uninstall so it can be added back', () => {
    mergeSkillCatalog([skill(), skill({ name: 'other' })]);
    const merged = mergeSkillCatalog([skill()]);
    expect(merged.map((entry) => entry.name).sort()).toEqual(['canvas-design', 'other']);
  });

  it('forgets everything once the memory is reset', () => {
    mergeSkillCatalog([skill()]);
    resetSkillCatalogMemory();
    expect(mergeSkillCatalog([])).toEqual([]);
  });
});

describe('install state requests', () => {
  it('reads the installed names', async () => {
    const fetchMock = jsonOnce({ installed: ['a', 'b'] });
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchInstalledSkillNames()).toEqual(new Set(['a', 'b']));
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/installs', { cache: 'no-store' });
  });

  it('treats an unavailable install list as nothing installed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await fetchInstalledSkillNames()).toEqual(new Set());
  });

  it('posts an install with the csrf token', async () => {
    const fetchMock = jsonOnce({ installed: ['canvas-design'] });
    vi.stubGlobal('fetch', fetchMock);
    await installSkill('canvas-design', CSRF);
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/installs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF },
      body: JSON.stringify({ name: 'canvas-design' }),
    });
  });

  it('deletes the named install with the csrf token', async () => {
    const fetchMock = jsonOnce({ installed: [] });
    vi.stubGlobal('fetch', fetchMock);
    await uninstallSkill('a/b', CSRF);
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/installs/a%2Fb', {
      method: 'DELETE',
      headers: { 'x-csrf-token': CSRF },
    });
  });

  it('reports a rejected install rather than looking successful', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    await expect(installSkill('owned', CSRF)).rejects.toThrow('skill install failed: 409');
    await expect(uninstallSkill('owned', CSRF)).rejects.toThrow('skill uninstall failed: 409');
  });
});

describe('fetchSkillFileContent', () => {
  it('encodes each path segment and returns the file text', async () => {
    const fetchMock = jsonOnce({ file: { path: 'a b/c.txt', content: 'hello' } });
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchSkillFileContent('canvas-design', 'a b/c.txt')).toBe('hello');
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/canvas-design/files/a%20b/c.txt', {
      cache: 'no-store',
    });
  });

  it('reports a file the route refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 415 }));
    await expect(fetchSkillFileContent('canvas-design', 'x.png')).rejects.toThrow(
      'skill file failed: 415',
    );
  });
});

describe('fetchSkillDetail', () => {
  function stubDetail(files: { path: string }[] | null, body = '# Canvas') {
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('/files')) {
        return files === null
          ? Promise.resolve({ ok: false, status: 404 })
          : Promise.resolve({ ok: true, json: () => Promise.resolve({ files }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ body }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('lists the package files and loads only the entry file up front', async () => {
    stubDetail([{ path: 'SKILL.md' }, { path: 'fonts/Bold.ttf' }]);
    const detail = await fetchSkillDetail('canvas-design', [skill()], new Set(['canvas-design']));
    expect(detail?.files).toEqual([
      { path: 'SKILL.md', content: '# Canvas' },
      { path: 'fonts/Bold.ttf' },
    ]);
    expect(detail?.installed).toBe(true);
    expect(typeof detail?.readFile).toBe('function');
  });

  it('falls back to a single entry file when the file route is unavailable', async () => {
    stubDetail(null);
    const detail = await fetchSkillDetail('canvas-design', [skill()], new Set());
    expect(detail?.files).toEqual([{ path: 'SKILL.md', content: '# Canvas' }]);
    expect(detail?.installed).toBe(false);
  });

  it('marks an authored skill editable', async () => {
    stubDetail([{ path: 'SKILL.md' }]);
    const detail = await fetchSkillDetail(
      'mine',
      [skill({ name: 'mine', source: 'personal', editable: true })],
      new Set(),
    );
    expect(detail?.editable).toBe(true);
    expect(detail?.installed).toBe(true);
  });

  it('returns null for a skill the catalog does not list', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchSkillDetail('missing', [skill()], new Set())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the body request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((path: string) =>
          path.endsWith('/files')
            ? Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) })
            : Promise.resolve({ ok: false, status: 500 }),
        ),
    );
    await expect(fetchSkillDetail('canvas-design', [skill()], new Set())).rejects.toThrow(
      'skill detail failed: 500',
    );
  });
});
