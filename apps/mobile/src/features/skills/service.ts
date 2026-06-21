/**
 * Mobile skills service.
 *
 * `@agiworkforce/skills` uses `node:fs` to load SKILL.md files from disk —
 * not available in React Native. Mobile fetches the canonical catalog from
 * the api-gateway's `/api/skills` endpoint and shares the wire types with
 * the shared package via `import type` (Metro tree-shakes type-only
 * imports cleanly).
 *
 * Bundle size impact: <1 KB minified+gzipped (types only). The runtime
 * surface is plain `fetch`. No transitive resolution of `@agiworkforce/
 * skills` reaches the Metro bundler.
 *
 * Progressive disclosure: list endpoint returns metadata only; bodies are
 * lazy-fetched per skill. Match the web component's pattern.
 */

import type { Skill } from '@agiworkforce/skills';

import { API_URL } from '@/lib/constants';
// Zero-leak: the catalog calls below target OUR api-gateway (`${API_URL}/api/skills`).
// Route through guardedFetch so Local mode refuses before any network I/O
// (fail-closed); guardedFetch delegates to secureFetch (TLS pinning) when allowed.
import { guardedFetch } from '@/lib/egressGuard';
import { getAuthHeaders } from '@/services/authSession';

export type SkillSummary = Pick<Skill, 'name' | 'description' | 'filePath' | 'source'>;

/**
 * Catalog entry as served by the public GitHub-indexed catalog (or local
 * fixture during v1). Mirrors what the skills store persists.
 */
export interface SkillCatalogEntry {
  /** Stable identifier, slug-ish (e.g., "writing-assistant-v1"). */
  id: string;
  /** Display name shown in the catalog UI. */
  name: string;
  /** One-line description for browse cards. */
  description: string;
  /** Origin: official curated catalog vs. user-imported file. */
  source: 'catalog' | 'imported';
  /** Catalog version string. Used to detect upgrades. */
  version: string;
  /** Optional author/maintainer label. */
  author?: string;
  /** Optional categorical tags surfaced as filter chips. */
  tags?: string[];
}

/**
 * Installed skill bundle — what the skillsStore persists in MMKV.
 * Identical to the catalog entry plus an install timestamp.
 */
export interface InstalledSkill extends SkillCatalogEntry {
  /** ISO-8601 install timestamp from `new Date().toISOString()`. */
  installedAt: string;
}

async function authHeader(): Promise<Record<string, string>> {
  return getAuthHeaders();
}

export async function listSkills(): Promise<SkillSummary[]> {
  const headers = await authHeader();
  const res = await guardedFetch(`${API_URL}/api/skills`, { headers });
  if (!res.ok) throw new Error(`skills.list failed: HTTP ${res.status}`);
  const json = (await res.json()) as { skills: SkillSummary[] };
  return json.skills;
}

export async function getSkillBody(name: string): Promise<string> {
  const headers = await authHeader();
  const res = await guardedFetch(`${API_URL}/api/skills/${encodeURIComponent(name)}`, {
    headers,
  });
  if (!res.ok) throw new Error(`skills.body failed: HTTP ${res.status}`);
  const json = (await res.json()) as { body: string };
  return json.body;
}
