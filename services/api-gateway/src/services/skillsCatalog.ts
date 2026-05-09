/**
 * Skills catalog service — exposes filesystem-resident skills via the
 * shared `@agiworkforce/skills` package.
 *
 * Intended for the api-gateway's outbound-worker / chat-orchestration
 * layer to fetch the user's skill catalog when assembling system prompts.
 * Not yet wired into a route by default — the public `/api/skills`
 * endpoint lives in the web app and uses the same package directly.
 *
 * Progressive disclosure: bodies are fetched on-demand by `getSkillBody`,
 * not returned from `getSkillCatalog`.
 */

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

/**
 * Configure the layers to scan. Call once at startup. Each entry is a
 * `(rootDir, source)` pair; precedence is enforced by the merge step.
 */
export function setSkillsLayers(layers: SkillLayer[]): void {
  state.layers = layers;
  state.cachedSkills = null;
  state.cacheExpiresAt = 0;
}

/**
 * Return the merged skill catalog, metadata only. Body content is hidden;
 * call `getSkillBody(name)` to fetch the body lazily.
 */
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

/**
 * Fetch the body of a specific skill. Returns `null` if not found.
 * Progressive-disclosure step: callers show "Loading skill body…" until
 * this resolves.
 */
export async function getSkillBody(name: string): Promise<string | null> {
  const skills = await loadCached();
  const match = skills.find((s) => s.name === name);
  return match ? match.body : null;
}

/** Force the next call to re-scan from disk. */
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
