import 'server-only';

import { existsSync } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import {
  describeSkillUnavailability,
  executeSkillToolWithFiles,
  filterSkillsForProductAudience,
  hashSkillContent,
  loadSkillsFromLayers,
  mergeSkills,
  parseSkillAudienceManifest,
  SKILL_MANIFEST_FILE_NAME,
  type Skill,
  type SkillAudienceManifest,
  type SkillLayer,
  type SkillSource,
  type SkillToolFileAccess,
  type SkillToolResult,
  type SkillToolRuntimeContext,
} from '@agiworkforce/skills';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { listInstalledDirectorySkills } from '@/features/plugins/server/directory/installed-skills';
import { logger } from '@/lib/logger';
import {
  findUserSkillByName,
  listUserSkillsAsManagedSkills,
  toManagedSkillFromUserSkill,
} from './user-skill-service';

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

export function isDraftSkill(skill: Skill): boolean {
  return !isExecutableSkill(skill);
}

export function withoutDraftSkills(skills: readonly Skill[]): Skill[] {
  return skills.filter((skill) => !isDraftSkill(skill));
}

export function dedupeByFirstClaimedName<T extends { name: string }>(entries: readonly T[]): T[] {
  const claimed = new Set<string>();
  const kept: T[] = [];
  for (const entry of entries) {
    if (claimed.has(entry.name)) continue;
    claimed.add(entry.name);
    kept.push(entry);
  }
  return kept;
}

export function skillRequiredTools(skill: Skill): readonly string[] {
  return skill.metadata.requires?.tools ?? [];
}

export const SKILL_REQUIREMENTS_UNMET_CODE = 'skill_requirements_unmet';

export interface SkillRequirementFailure {
  code: typeof SKILL_REQUIREMENTS_UNMET_CODE;
  message: string;
  missingTools: readonly string[];
}

export function selectedSkillRequirementFailure(
  selected: Skill | null | undefined,
  offeredToolNames: ReadonlySet<string>,
): SkillRequirementFailure | null {
  if (!selected) return null;
  const missingTools =
    describeSkillUnavailability(selected, { availableTools: offeredToolNames })?.missingTools ?? [];
  if (missingTools.length === 0) return null;
  return {
    code: SKILL_REQUIREMENTS_UNMET_CODE,
    message: `The ${selected.name} skill needs these turned on first: ${missingTools.join(', ')}.`,
    missingTools,
  };
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

const BUNDLED_SKILLS_DIRECTORY = '.agents/skills';
const WORKSPACE_ROOT_FROM_APP = '../..';

function repositoryRoot(): string {
  const candidates = [process.cwd(), resolve(process.cwd(), WORKSPACE_ROOT_FROM_APP)];
  return (
    candidates.find((candidate) => existsSync(join(candidate, BUNDLED_SKILLS_DIRECTORY))) ??
    candidates[0]!
  );
}

function bundledSkillsRoot(): string {
  return join(repositoryRoot(), BUNDLED_SKILLS_DIRECTORY);
}

function skillManifestPath(): string {
  return join(repositoryRoot(), SKILL_MANIFEST_FILE_NAME);
}

async function readSkillAudienceManifest(): Promise<SkillAudienceManifest> {
  return parseSkillAudienceManifest(await readFile(skillManifestPath(), 'utf-8'));
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
    const [layers, manifest] = await Promise.all([
      loadSkillsFromLayers(getManagedSkillLayers()),
      readSkillAudienceManifest(),
    ]);
    const value = filterSkillsForProductAudience(
      mergeSkills(layers),
      manifest,
      bundledSkillsRoot(),
    );
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

export interface SkillFileBytes extends SkillFileEntry {
  bytes: Buffer;
  contentHash: string;
}

export type SkillFileBytesResult =
  | { ok: true; file: SkillFileBytes }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'too_large'; size: number };

export async function readManagedSkillFileBytes(
  skill: Skill,
  requestedPath: string,
): Promise<SkillFileBytesResult> {
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
  return {
    ok: true,
    file: { path: fromRoot, size: stats.size, bytes, contentHash: hashSkillContent(bytes) },
  };
}

export async function readManagedSkillFile(
  skill: Skill,
  requestedPath: string,
): Promise<SkillFileReadResult> {
  const result = await readManagedSkillFileBytes(skill, requestedPath);
  if (!result.ok) return result;
  if (result.file.bytes.includes(0)) return { ok: false, reason: 'binary' };

  return {
    ok: true,
    file: {
      path: result.file.path,
      size: result.file.size,
      content: result.file.bytes.toString('utf-8'),
    },
  };
}

export interface ExecuteManagedSkillToolOptions extends Pick<
  SkillToolRuntimeContext,
  'availableTools' | 'availableBins' | 'availableConfig' | 'maxOutputBytes'
> {
  availableEnvironmentVariables?: ReadonlySet<string>;
  platform?: string;
  installOverrides?: ReadonlyMap<string, boolean>;
}

const EMPTY_INSTALL_OVERRIDES: ReadonlyMap<string, boolean> = new Map();
const SKILL_ENTRY_FILE_NAME = 'SKILL.md';

const managedSkillFileAccess: SkillToolFileAccess = {
  async listFiles(skill) {
    const files = await listManagedSkillFiles(skill);
    if (files === null) return [];
    return files.filter((file) => file.path !== SKILL_ENTRY_FILE_NAME);
  },
  async readFile(skill, requestedPath) {
    const result = await readManagedSkillFile(skill, requestedPath);
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, path: result.file.path, content: result.file.content };
  },
};

function skillToolRuntimeContext(options: ExecuteManagedSkillToolOptions): SkillToolRuntimeContext {
  const { installOverrides: _installOverrides, ...runtimeOptions } = options;
  return {
    ...runtimeOptions,
    availableEnvironmentVariables:
      runtimeOptions.availableEnvironmentVariables ??
      new Set(
        Object.entries(process.env)
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
          .map(([name]) => name),
      ),
    platform: runtimeOptions.platform ?? process.platform,
  };
}

export async function executeManagedSkillTool(
  args: Record<string, unknown>,
  options: ExecuteManagedSkillToolOptions = {},
): Promise<SkillToolResult> {
  const catalog = filterSkillsByInstallOverrides(
    await getManagedSkillCatalog(),
    options.installOverrides ?? EMPTY_INSTALL_OVERRIDES,
  );
  return executeSkillToolWithFiles(
    catalog,
    args,
    skillToolRuntimeContext(options),
    managedSkillFileAccess,
  );
}

export async function executeManagedSkillToolForPlugins(
  enabledPluginIds: ReadonlySet<string>,
  args: Record<string, unknown>,
  options: ExecuteManagedSkillToolOptions = {},
): Promise<SkillToolResult> {
  const catalog = filterSkillsByInstallOverrides(
    await getManagedSkillCatalogForPlugins(enabledPluginIds),
    options.installOverrides ?? EMPTY_INSTALL_OVERRIDES,
  );
  return executeSkillToolWithFiles(
    catalog,
    args,
    skillToolRuntimeContext(options),
    managedSkillFileAccess,
  );
}

/**
 * Called when a cached directory read produces a response that fails the
 * public contract (`ManagedSkillsResponseSchema`). Without this, a directory
 * poisoned by a mid-write file read stays cached for the full TTL, so a
 * retry within that window replays the identical failure.
 */
export function invalidateManagedSkillCatalogCache(): void {
  skillCache = null;
  executableSkillCache = null;
}

export function resetManagedSkillCatalogCacheForTests(): void {
  invalidateManagedSkillCatalogCache();
}

export interface SelectableSkillCatalogParams {
  db: DatabaseAdapter;
  userId: string;
  loadEnabledPluginIds: () => Promise<ReadonlySet<string>>;
  loadInstallOverrides: () => Promise<ReadonlyMap<string, boolean>>;
  includeNetworkBackedDirectorySkills?: boolean;
}

const EMPTY_PLUGIN_IDS: ReadonlySet<string> = new Set();
const NO_SKILLS: readonly Skill[] = [];

async function readOptionalSkillSource<T>(
  source: string,
  fallback: T,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    logger.warn({ error, source }, 'Optional skill source unavailable; continuing without it');
    return fallback;
  }
}

export async function loadSelectableSkillCatalog(
  params: SelectableSkillCatalogParams,
): Promise<Skill[]> {
  const [enabledPluginIds, installOverrides] = await Promise.all([
    readOptionalSkillSource('enabled-plugin-ids', EMPTY_PLUGIN_IDS, () =>
      params.loadEnabledPluginIds(),
    ),
    readOptionalSkillSource('skill-install-overrides', EMPTY_INSTALL_OVERRIDES, () =>
      params.loadInstallOverrides(),
    ),
  ]);
  const managed = filterSkillsByInstallOverrides(
    await getManagedSkillCatalogForPlugins(enabledPluginIds),
    installOverrides,
  );
  const [userSkills, directorySkills] = await Promise.all([
    readOptionalSkillSource('user-skills', NO_SKILLS, () =>
      listUserSkillsAsManagedSkills(params.db, params.userId),
    ),
    params.includeNetworkBackedDirectorySkills === false
      ? Promise.resolve(NO_SKILLS)
      : readOptionalSkillSource('directory-skills', NO_SKILLS, () =>
          listInstalledDirectorySkills(params.db, params.userId),
        ),
  ]);
  return dedupeByFirstClaimedName([...managed, ...directorySkills, ...userSkills]);
}

export interface SkillDetailLookupParams {
  db: DatabaseAdapter;
  userId: string;
  name: string;
  loadEnabledPluginIds: () => Promise<ReadonlySet<string>>;
}

export async function findSelectableSkillByName(
  params: SkillDetailLookupParams,
): Promise<Skill | null> {
  const enabledPluginIds = await readOptionalSkillSource(
    'enabled-plugin-ids',
    EMPTY_PLUGIN_IDS,
    () => params.loadEnabledPluginIds(),
  );
  const managed = (await getManagedSkillDirectoryForPlugins(enabledPluginIds)).find(
    (skill) => skill.name === params.name,
  );
  if (managed) return managed;

  const directorySkills = await readOptionalSkillSource('directory-skills', NO_SKILLS, () =>
    listInstalledDirectorySkills(params.db, params.userId),
  );
  const installed = directorySkills.find((skill) => skill.name === params.name);
  if (installed) return installed;

  const authored = await readOptionalSkillSource('user-skills', null, () =>
    findUserSkillByName(params.db, params.userId, params.name),
  );
  return authored ? toManagedSkillFromUserSkill(authored) : null;
}

export function memoizeAsync<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load());
}
