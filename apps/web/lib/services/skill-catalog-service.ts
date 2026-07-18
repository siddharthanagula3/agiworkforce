import 'server-only';

import {
  executeSkillTool,
  loadSkillsFromLayers,
  mergeSkills,
  type Skill,
  type SkillLayer,
  type SkillSource,
  type SkillToolResult,
  type SkillToolRuntimeContext,
} from '@agiworkforce/skills';

import { logger } from '@/lib/logger';

const SKILL_SOURCES = new Set<SkillSource>([
  'bundled',
  'managed-local',
  'personal',
  'project',
  'workspace',
  'extra',
]);
const CACHE_TTL_MS = 60_000;

let skillCache: { value: Skill[]; expiresAt: number } | null = null;

export class SkillCatalogUnavailableError extends Error {
  constructor() {
    super('The managed Skill catalog is temporarily unavailable.');
    this.name = 'SkillCatalogUnavailableError';
  }
}

export function parseSkillLayersConfig(raw: string | undefined): SkillLayer[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const rootDir = (entry as { rootDir?: unknown }).rootDir;
      const source = (entry as { source?: unknown }).source;
      if (
        typeof rootDir !== 'string' ||
        rootDir.trim().length === 0 ||
        typeof source !== 'string' ||
        !SKILL_SOURCES.has(source as SkillSource)
      ) {
        return [];
      }
      return [{ rootDir, source: source as SkillSource }];
    });
  } catch {
    return [];
  }
}

export async function getManagedSkillCatalog(): Promise<Skill[]> {
  const now = Date.now();
  if (skillCache && now < skillCache.expiresAt) return skillCache.value;

  const layers = parseSkillLayersConfig(process.env['SKILLS_LAYERS']);
  if (layers.length === 0) {
    const value: Skill[] = [];
    skillCache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  }

  try {
    const value = mergeSkills(await loadSkillsFromLayers(layers));
    skillCache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (error) {
    logger.error({ error }, 'Managed Skill catalog load failed');
    throw new SkillCatalogUnavailableError();
  }
}

export async function findManagedSkillByName(name: string): Promise<Skill | null> {
  const skills = await getManagedSkillCatalog();
  return skills.find((skill) => skill.name === name) ?? null;
}

export interface ExecuteManagedSkillToolOptions extends Pick<
  SkillToolRuntimeContext,
  'availableTools' | 'availableBins' | 'availableConfig' | 'maxOutputBytes'
> {
  availableEnvironmentVariables?: ReadonlySet<string>;
  platform?: string;
}

/**
 * Execute the shared read-only Skill tool against the server-owned deployment
 * catalog. Environment values never leave this process; only presence is used.
 */
export async function executeManagedSkillTool(
  args: Record<string, unknown>,
  options: ExecuteManagedSkillToolOptions = {},
): Promise<SkillToolResult> {
  const availableEnvironmentVariables =
    options.availableEnvironmentVariables ??
    new Set(
      Object.entries(process.env)
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
        .map(([name]) => name),
    );
  return executeSkillTool(await getManagedSkillCatalog(), args, {
    ...options,
    availableEnvironmentVariables,
    platform: options.platform ?? process.platform,
  });
}

/** Test-only cache reset; production invalidation remains TTL-based. */
export function resetManagedSkillCatalogCacheForTests(): void {
  skillCache = null;
}
