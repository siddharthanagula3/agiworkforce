import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateSkillsCatalog,
  loadSkillsCatalog,
  skillAuthoringCapability,
} from './skills-catalog';

function stubSkillsResponse(canAuthorSkills: boolean) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ skills: [], canAuthorSkills }),
  }));
}

describe('skillAuthoringCapability', () => {
  beforeEach(() => {
    invalidateSkillsCatalog();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateSkillsCatalog();
  });

  it('defaults to false before any catalogue load', () => {
    expect(skillAuthoringCapability()).toBe(false);
  });

  it('reflects the server response after a load', async () => {
    vi.stubGlobal('fetch', stubSkillsResponse(true));
    await loadSkillsCatalog();
    expect(skillAuthoringCapability()).toBe(true);
  });

  it('resets to false when the catalogue is invalidated', async () => {
    vi.stubGlobal('fetch', stubSkillsResponse(true));
    await loadSkillsCatalog();
    expect(skillAuthoringCapability()).toBe(true);
    invalidateSkillsCatalog();
    expect(skillAuthoringCapability()).toBe(false);
  });
});

describe('loadSkillsCatalog caching', () => {
  beforeEach(() => {
    invalidateSkillsCatalog();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateSkillsCatalog();
  });

  it('two consumers loading within the cache window issue one request', async () => {
    const fetchMock = stubSkillsResponse(true);
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([loadSkillsCatalog(), loadSkillsCatalog()]);
    await loadSkillsCatalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('invalidation forces the next load to refetch', async () => {
    const fetchMock = stubSkillsResponse(true);
    vi.stubGlobal('fetch', fetchMock);

    await loadSkillsCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateSkillsCatalog();
    await loadSkillsCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
