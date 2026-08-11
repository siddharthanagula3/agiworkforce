import 'server-only';

import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

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
let executableSkillCache: { directory: Skill[]; value: Skill[] } | null = null;

function skillPluginOwner(skill: Skill): string | null {
  const owner = skill.frontmatter['plugin'];
  return typeof owner === 'string' && owner.trim().length > 0 ? owner.trim() : null;
}

function isExecutableSkill(skill: Skill): boolean {
  return skill.frontmatter['draft'] !== true;
}

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

function bundledSkillsRoot(): string {
  const candidates = [
    resolve(process.cwd(), '.agents/skills'),
    resolve(process.cwd(), '../..', '.agents/skills'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

export function getManagedSkillLayers(): SkillLayer[] {
  return [
    { rootDir: bundledSkillsRoot(), source: 'bundled' },
    ...parseSkillLayersConfig(process.env['SKILLS_LAYERS']),
  ];
}

/** All discoverable entries, including catalog-only drafts. */
export async function getManagedSkillDirectory(): Promise<Skill[]> {
  const now = Date.now();
  if (skillCache && now < skillCache.expiresAt) return skillCache.value;

  try {
    const value = mergeSkills(await loadSkillsFromLayers(getManagedSkillLayers()));
    skillCache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (error) {
    logger.error({ error }, 'Managed Skill catalog load failed');
    throw new SkillCatalogUnavailableError();
  }
}

/** Executable entries only. Drafts remain visible in the directory but cannot be loaded. */
export async function getManagedSkillCatalog(): Promise<Skill[]> {
  const directory = await getManagedSkillDirectory();
  if (executableSkillCache?.directory === directory) return executableSkillCache.value;
  // Plugin-owned skills are not globally included. They enter a user's catalog
  // only through the durable installation filter below.
  const value = directory.filter((skill) => isExecutableSkill(skill) && !skillPluginOwner(skill));
  executableSkillCache = { directory, value };
  return value;
}

export async function getManagedSkillDirectoryForPlugins(
  enabledPluginIds: ReadonlySet<string>,
): Promise<Skill[]> {
  const directory = await getManagedSkillDirectory();
  return directory.filter((skill) => {
    const owner = skillPluginOwner(skill);
    return owner === null || enabledPluginIds.has(owner);
  });
}

export async function getManagedSkillCatalogForPlugins(
  enabledPluginIds: ReadonlySet<string>,
): Promise<Skill[]> {
  const directory = await getManagedSkillDirectoryForPlugins(enabledPluginIds);
  return directory.filter(isExecutableSkill);
}

export async function findManagedSkillByName(name: string): Promise<Skill | null> {
  const skills = await getManagedSkillCatalog();
  return skills.find((skill) => skill.name === name) ?? null;
}

export async function findManagedDirectorySkillByName(name: string): Promise<Skill | null> {
  const skills = await getManagedSkillDirectory();
  return skills.find((skill) => skill.name === name) ?? null;
}

export interface BundledSkillDownload {
  content: Buffer;
  contentHash: string;
}

async function readBundledSkillDownload(skill: Skill | null): Promise<BundledSkillDownload | null> {
  if (!skill || skill.source !== 'bundled' || !isExecutableSkill(skill)) return null;

  const [rootPath, filePath] = await Promise.all([
    realpath(/* turbopackIgnore: true */ bundledSkillsRoot()),
    realpath(/* turbopackIgnore: true */ skill.filePath),
  ]).catch(() => [] as string[]);
  if (!rootPath || !filePath) return null;

  const pathFromRoot = relative(rootPath, filePath);
  if (pathFromRoot === '' || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) return null;

  return {
    content: await readFile(filePath),
    contentHash: skill.contentHash,
  };
}

/**
 * Read one included first-party SKILL.md without accepting a path from the
 * caller. Overlay and draft entries are deliberately not downloadable here.
 */
export async function getBundledSkillDownload(name: string): Promise<BundledSkillDownload | null> {
  return readBundledSkillDownload(await findManagedSkillByName(name));
}

/**
 * Download a bundled skill from the exact catalog visible to this user's
 * enabled plugins. This keeps plugin-owned entries tenant-gated while making
 * every Included portable bundle in Settings genuinely downloadable.
 */
export async function getBundledSkillDownloadForPlugins(
  enabledPluginIds: ReadonlySet<string>,
  name: string,
): Promise<BundledSkillDownload | null> {
  const skill = (await getManagedSkillDirectoryForPlugins(enabledPluginIds)).find(
    (candidate) => candidate.name === name,
  );
  return readBundledSkillDownload(skill ?? null);
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

export async function executeManagedSkillToolForPlugins(
  enabledPluginIds: ReadonlySet<string>,
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
  return executeSkillTool(await getManagedSkillCatalogForPlugins(enabledPluginIds), args, {
    ...options,
    availableEnvironmentVariables,
    platform: options.platform ?? process.platform,
  });
}

/** Test-only cache reset; production invalidation remains TTL-based. */
export function resetManagedSkillCatalogCacheForTests(): void {
  skillCache = null;
  executableSkillCache = null;
}
