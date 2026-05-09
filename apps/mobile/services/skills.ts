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
import { secureFetch } from './secureFetch';
import { supabase } from './supabase';

export type SkillSummary = Pick<Skill, 'name' | 'description' | 'filePath' | 'source'>;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listSkills(): Promise<SkillSummary[]> {
  const headers = await authHeader();
  const res = await secureFetch(`${API_URL}/api/skills`, { headers });
  if (!res.ok) throw new Error(`skills.list failed: HTTP ${res.status}`);
  const json = (await res.json()) as { skills: SkillSummary[] };
  return json.skills;
}

export async function getSkillBody(name: string): Promise<string> {
  const headers = await authHeader();
  const res = await secureFetch(`${API_URL}/api/skills/${encodeURIComponent(name)}`, {
    headers,
  });
  if (!res.ok) throw new Error(`skills.body failed: HTTP ${res.status}`);
  const json = (await res.json()) as { body: string };
  return json.body;
}
