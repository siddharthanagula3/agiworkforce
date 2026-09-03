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
