import 'server-only';

import { existsSync } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

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

export function isPluginOwnedSkill(skill: Skill): boolean {
  return skillPluginOwner(skill) !== null;
}

function isExecutableSkill(skill: Skill): boolean {
  return skill.frontmatter['draft'] !== true;
}

export function filterSkillsByInstallOverrides(
  skills: readonly Skill[],
  installOverrides: ReadonlyMap<string, boolean>,
): Skill[] {
  return skills.filter(
    (skill) => isPluginOwnedSkill(skill) || installOverrides.get(skill.name) !== false,
  );
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

export async function getManagedSkillCatalog(): Promise<Skill[]> {
  const directory = await getManagedSkillDirectory();
  if (executableSkillCache?.directory === directory) return executableSkillCache.value;
  const value = directory.filter((skill) => isExecutableSkill(skill) && !skillPluginOwner(skill));
  executableSkillCache = { directory, value };
  return value;
}

export async function getManagedSkillPluginOwners(): Promise<ReadonlyMap<string, string>> {
  const directory = await getManagedSkillDirectory();
  const owners = new Map<string, string>();
  for (const skill of directory) {
    const owner = skillPluginOwner(skill);
    if (owner !== null) owners.set(skill.name, owner);
  }
  return owners;
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

export async function getBundledSkillDownload(name: string): Promise<BundledSkillDownload | null> {
  return readBundledSkillDownload(await findManagedSkillByName(name));
}

export async function getBundledSkillDownloadForPlugins(
  enabledPluginIds: ReadonlySet<string>,
  name: string,
): Promise<BundledSkillDownload | null> {
  const skill = (await getManagedSkillDirectoryForPlugins(enabledPluginIds)).find(
    (candidate) => candidate.name === name,
  );
  return readBundledSkillDownload(skill ?? null);
}

const SKILL_FILE_MAX_BYTES = 512 * 1024;

export interface SkillFileEntry {
  path: string;
  size: number;
}

async function skillPackageRealRoot(skill: Skill): Promise<string | null> {
  try {
    return await realpath(/* turbopackIgnore: true */ dirname(skill.filePath));
  } catch {
    return null;
  }
}

async function collectSkillFileEntries(root: string, prefix: string): Promise<SkillFileEntry[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const out: SkillFileEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const entryPath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...(await collectSkillFileEntries(root, entryPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    const stats = await stat(join(root, entryPath));
    out.push({ path: entryPath, size: stats.size });
  }
  return out;
}

export async function listManagedSkillFiles(skill: Skill): Promise<SkillFileEntry[] | null> {
  const root = await skillPackageRealRoot(skill);
  if (root === null) return null;
  const files = await collectSkillFileEntries(root, '');
  return files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

export interface SkillFileContent extends SkillFileEntry {
  content: string;
}

export type SkillFileReadResult =
  | { ok: true; file: SkillFileContent }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'too_large'; size: number }
  | { ok: false; reason: 'binary' };

export async function readManagedSkillFile(
  skill: Skill,
  requestedPath: string,
): Promise<SkillFileReadResult> {
  const root = await skillPackageRealRoot(skill);
  if (root === null) return { ok: false, reason: 'not_found' };

  let realCandidate: string;
  try {
    realCandidate = await realpath(/* turbopackIgnore: true */ resolve(root, requestedPath));
  } catch {
    return { ok: false, reason: 'not_found' };
  }

  const fromRoot = relative(root, realCandidate);
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    return { ok: false, reason: 'not_found' };
  }

  const stats = await stat(realCandidate);
  if (!stats.isFile()) return { ok: false, reason: 'not_found' };
  if (stats.size > SKILL_FILE_MAX_BYTES)
    return { ok: false, reason: 'too_large', size: stats.size };

  const bytes = await readFile(realCandidate);
  if (bytes.includes(0)) return { ok: false, reason: 'binary' };

  return { ok: true, file: { path: fromRoot, size: stats.size, content: bytes.toString('utf-8') } };
}

export interface ExecuteManagedSkillToolOptions extends Pick<
  SkillToolRuntimeContext,
  'availableTools' | 'availableBins' | 'availableConfig' | 'maxOutputBytes'
> {
  availableEnvironmentVariables?: ReadonlySet<string>;
  platform?: string;
}

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

export function resetManagedSkillCatalogCacheForTests(): void {
  skillCache = null;
  executableSkillCache = null;
}
