
import {
  loadSkillsFromLayers,
  mergeSkills,
  type Skill,
  type SkillLayer,
} from '@agiworkforce/skills';

import { logger } from '../lib/logger';

interface SkillsCatalogState {
  layers: SkillLayer[];
  cachedSkills: Skill[] | null;
  cacheExpiresAt: number;
}

const state: SkillsCatalogState = {
  layers: [],
  cachedSkills: null,
  cacheExpiresAt: 0,
};

const CACHE_TTL_MS = 60_000;

export function setSkillsLayers(layers: SkillLayer[]): void {
  state.layers = layers;
  state.cachedSkills = null;
  state.cacheExpiresAt = 0;
}

export async function getSkillCatalog(): Promise<
  Array<Pick<Skill, 'name' | 'description' | 'filePath' | 'source'>>
> {
  const skills = await loadCached();
  return skills.map((s) => ({
    name: s.name,
    description: s.description,
    filePath: s.filePath,
    source: s.source,
  }));
}

export async function getSkillBody(name: string): Promise<string | null> {
  const skills = await loadCached();
  const match = skills.find((s) => s.name === name);
  return match ? match.body : null;
}

export function invalidateSkillsCatalog(): void {
  state.cachedSkills = null;
  state.cacheExpiresAt = 0;
}

async function loadCached(): Promise<Skill[]> {
  const now = Date.now();
  if (state.cachedSkills && now < state.cacheExpiresAt) {
    return state.cachedSkills;
  }
  if (state.layers.length === 0) {
    state.cachedSkills = [];
    state.cacheExpiresAt = now + CACHE_TTL_MS;
    return [];
  }
  try {
    const layerResults = await loadSkillsFromLayers(state.layers);
    const merged = mergeSkills(layerResults);
    state.cachedSkills = merged;
    state.cacheExpiresAt = now + CACHE_TTL_MS;
    return merged;
  } catch (err) {
    logger.error({ err }, 'skillsCatalog.load failed');
    throw err;
  }
}
