/**
 * Skills API — list skills loaded via `@agiworkforce/skills`.
 *
 * Routes:
 *   GET /api/skills          — list metadata only (progressive disclosure).
 *   GET /api/skills/[name]   — fetch the body for a named skill.
 *
 * Skills source: a layered scan of skill directories on the gateway host.
 * Today the route reads the `SKILLS_LAYERS` env var as a JSON list of
 * `{rootDir, source}` entries. In production, the path would be
 * supplemented by per-user / per-project skills uploaded via Supabase
 * storage; that wiring is deferred.
 *
 * Progressive disclosure: this endpoint never returns body content for
 * the index. The body is fetched lazily by the consumer UI from the
 * dynamic-segment endpoint. This matches Anthropic's reference pattern of
 * keeping the system-prompt skill list small.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  loadSkillsFromLayers,
  mergeSkills,
  type Skill,
  type SkillLayer,
  type SkillSource,
} from '@agiworkforce/skills';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function readLayersFromEnv(): SkillLayer[] {
  const raw = process.env['SKILLS_LAYERS'];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as { rootDir?: unknown }).rootDir === 'string' &&
        typeof (entry as { source?: unknown }).source === 'string'
      ) {
        return [
          {
            rootDir: (entry as { rootDir: string }).rootDir,
            source: (entry as { source: SkillSource }).source,
          },
        ];
      }
      return [];
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to parse SKILLS_LAYERS env');
    return [];
  }
}

let skillCache: { value: Skill[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function getSkills(): Promise<Skill[]> {
  const now = Date.now();
  if (skillCache && now < skillCache.expiresAt) return skillCache.value;
  const layers = readLayersFromEnv();
  if (layers.length === 0) {
    skillCache = { value: [], expiresAt: now + CACHE_TTL_MS };
    return [];
  }
  try {
    const layerResults = await loadSkillsFromLayers(layers);
    const merged = mergeSkills(layerResults);
    skillCache = { value: merged, expiresAt: now + CACHE_TTL_MS };
    return merged;
  } catch (err) {
    logger.error({ err }, 'skills.load failed');
    throw createError.internal('Failed to load skills');
  }
}

async function handleListSkills(request: NextRequest) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const skills = await getSkills();
  return NextResponse.json({
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      location: s.filePath,
      source: s.source,
    })),
  });
}

export const GET = withErrorHandler(handleListSkills);

/** Internal helper used by the body route. Exported via module-graph. */
export async function lookupSkillBody(name: string): Promise<string | null> {
  const skills = await getSkills();
  const found = skills.find((s) => s.name === name);
  return found ? found.body : null;
}
