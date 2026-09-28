import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { SkillFileReadOutcome, SkillToolFileAccess } from '@agiworkforce/skills';

import { logger } from '@/lib/logger';
import {
  listOrganizationSkillCompanions,
  readOrganizationPluginFile,
} from '@/lib/services/organization-plugin-service';
import {
  listOwnedSkillCompanions,
  readOwnedEntryFile,
} from '@/lib/services/plugin-owned-source-service';
import {
  GITHUB_API_USER_AGENT,
  GITHUB_TOKEN_ENV_VAR,
  PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS,
  SKILL_COMPANION_MAX_BYTES,
  SKILL_COMPANION_MAX_FILES,
} from './constants';
import { fetchRepositoryTree, rawFileUrl } from './inspection';
import type { DirectoryFetch } from './official-marketplace';
import {
  readSkillCompanions,
  skillCompanionsCacheParams,
  writeSkillCompanions,
} from './snapshot-cache';
import type { PluginSourceLocation, SkillCompanionFile } from './types';

const TREE_BLOB_TYPE = 'blob';
const NOT_FOUND: SkillFileReadOutcome = { ok: false, reason: 'not_found' };
const BINARY: SkillFileReadOutcome = { ok: false, reason: 'binary' };
const TOO_LARGE: SkillFileReadOutcome = { ok: false, reason: 'too_large' };

export function skillDirectoryOf(skillFilePath: string): string {
  const index = skillFilePath.lastIndexOf('/');
  return index > 0 ? skillFilePath.slice(0, index) : '';
}

function pluginBase(location: PluginSourceLocation): string {
  const path = (location.path ?? '')
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
  return path ? `${path}/` : '';
}

function decodeText(bytes: Uint8Array): SkillFileReadOutcome | string {
  if (bytes.byteLength > SKILL_COMPANION_MAX_BYTES) return TOO_LARGE;
  if (bytes.includes(0)) return BINARY;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return BINARY;
  }
}

function lazyListing(
  load: () => Promise<SkillCompanionFile[]>,
): () => Promise<SkillCompanionFile[]> {
  let listing: Promise<SkillCompanionFile[]> | null = null;
  return () => (listing ??= load());
}

interface StoredSkillFiles {
  list: (directory: string, limit: number) => Promise<SkillCompanionFile[]>;
  read: (path: string) => Promise<string | null>;
}

function storedSkillFileAccess(
  skillFilePath: string,
  files: StoredSkillFiles,
): SkillToolFileAccess {
  const directory = skillDirectoryOf(skillFilePath);
  const list = lazyListing(async () =>
    directory ? files.list(directory, SKILL_COMPANION_MAX_FILES) : [],
  );
  return {
    async listFiles() {
      return list();
    },
    async readFile(_skill, path) {
      const file = (await list()).find((candidate) => candidate.path === path);
      if (!file) return NOT_FOUND;
      if (file.size > SKILL_COMPANION_MAX_BYTES) return TOO_LARGE;
      const content = await files.read(`${directory}/${file.path}`);
      return content === null ? NOT_FOUND : { ok: true, path: file.path, content };
    },
  };
}

export function ownedSkillFileAccess(
  db: DatabaseAdapter,
  userId: string,
  entryId: string,
  skillFilePath: string,
): SkillToolFileAccess {
  return storedSkillFileAccess(skillFilePath, {
    list: (directory, limit) => listOwnedSkillCompanions(db, userId, entryId, directory, limit),
    read: (path) => readOwnedEntryFile(db, userId, entryId, path),
  });
}

export function organizationSkillFileAccess(
  db: DatabaseAdapter,
  organizationId: string,
  pluginId: string,
  skillFilePath: string,
): SkillToolFileAccess {
  return storedSkillFileAccess(skillFilePath, {
    list: (directory, limit) =>
      listOrganizationSkillCompanions(db, organizationId, pluginId, directory, limit),
    read: (path) => readOrganizationPluginFile(db, organizationId, pluginId, path),
  });
}

async function listRepositoryCompanions(
  location: PluginSourceLocation,
  revision: string,
  skillFilePath: string,
  fetchImpl: DirectoryFetch,
): Promise<SkillCompanionFile[]> {
  const directory = skillDirectoryOf(skillFilePath);
  if (!directory) return [];
  const base = pluginBase(location);
  const params = skillCompanionsCacheParams(
    location.repositoryUrl,
    revision,
    `${base}${directory}`,
  );
  const cached = await readSkillCompanions(params);
  if (cached) return [...cached];

  const fetched = await fetchRepositoryTree(
    { ...location, path: null },
    fetchImpl,
    process.env[GITHUB_TOKEN_ENV_VAR],
  );
  if (fetched.status !== 'ok') {
    logger.warn(
      { status: fetched.status, repository: location.repositoryUrl, directory },
      'Skill companion files could not be listed; the skill loads with its instructions only',
    );
    return [];
  }
  const prefix = `${base}${directory}/`;
  const files = fetched.tree.entries
    .filter(
      (entry) =>
        entry.type === TREE_BLOB_TYPE &&
        entry.path.startsWith(prefix) &&
        entry.path !== `${base}${skillFilePath}`,
    )
    .slice(0, SKILL_COMPANION_MAX_FILES)
    .map((entry) => ({ path: entry.path.slice(prefix.length), size: entry.size ?? 0 }));
  await writeSkillCompanions(params, files);
  return files;
}

async function readRepositoryCompanion(
  location: PluginSourceLocation,
  directory: string,
  file: SkillCompanionFile,
  fetchImpl: DirectoryFetch,
): Promise<SkillFileReadOutcome> {
  if (file.size > SKILL_COMPANION_MAX_BYTES) return TOO_LARGE;
  const url = rawFileUrl(location, `${directory}/${file.path}`);
  if (!url) return NOT_FOUND;
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': GITHUB_API_USER_AGENT },
      signal: AbortSignal.timeout(PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return NOT_FOUND;
    const decoded = decodeText(new Uint8Array(await response.arrayBuffer()));
    return typeof decoded === 'string' ? { ok: true, path: file.path, content: decoded } : decoded;
  } catch {
    return NOT_FOUND;
  }
}

export function repositorySkillFileAccess(
  location: PluginSourceLocation,
  revision: string,
  skillFilePath: string,
  fetchImpl: DirectoryFetch = fetch,
): SkillToolFileAccess {
  const directory = skillDirectoryOf(skillFilePath);
  const list = lazyListing(() =>
    listRepositoryCompanions(location, revision, skillFilePath, fetchImpl),
  );
  return {
    async listFiles() {
      return list();
    },
    async readFile(_skill, path) {
      const file = (await list()).find((candidate) => candidate.path === path);
      return file ? readRepositoryCompanion(location, directory, file, fetchImpl) : NOT_FOUND;
    },
  };
}
