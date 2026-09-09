import JSZip from 'jszip';

import {
  PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL,
  PLUGIN_KEY_MAX_CHARS,
  PLUGIN_UPLOAD_MAX_MEMBERS,
  PLUGIN_UPLOAD_MAX_PATH_CHARS,
  PLUGIN_UPLOAD_MAX_TOTAL_BYTES,
  UNIX_FILE_TYPE_MASK,
  UNIX_FILE_TYPE_SYMLINK,
  UPLOAD_EMPTY_MESSAGE,
  UPLOAD_EXPANDS_TOO_FAR_MESSAGE,
  UPLOAD_NOT_AN_ARCHIVE_MESSAGE,
  UPLOAD_MANY_SKILL_FILES_MESSAGE,
  UPLOAD_NO_PLUGIN_MESSAGE,
  UPLOAD_NO_SKILLS_MESSAGE,
  UPLOAD_NO_SKILL_FILE_MESSAGE,
  UPLOAD_TOO_MANY_MEMBERS_MESSAGE,
  uploadMemberTooLargeMessage,
  uploadNotUtf8Message,
  uploadSymlinkMessage,
  uploadTooManyPluginsMessage,
  uploadTooManySkillsMessage,
  uploadUnsafePathMessage,
  uploadUnusableNameMessage,
  CLAUDE_MARKETPLACE_MANIFEST_PATH,
  CLAUDE_PLUGIN_METADATA_PATH,
  CLAUDE_PLUGIN_SKILLS_DIRECTORY,
  CLAUDE_SKILL_FILE_NAME,
} from './constants';
import {
  PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES,
  PLUGIN_MARKETPLACE_MAX_PLUGINS,
} from '@agiworkforce/cloud-contracts';

import { displayVersion, lastSegment, neutralizeCopy } from './entries';
import { parsePluginMetadata } from './inspection';
import { parseClaudeMarketplaceManifest } from './official-marketplace';
import { parseSkillFile } from './skill-files';

const PATH_SEPARATOR = '/';
const WINDOWS_SEPARATOR = '\\';
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;
const NULL_BYTE = '\0';
const PARENT_SEGMENT = '..';
const CURRENT_SEGMENT = '.';
const PLUGIN_KEY_ALLOWED = /^[a-z0-9][a-z0-9._-]*$/;
const PLUGIN_KEY_DISALLOWED = /[^a-z0-9._-]+/g;
const PLUGIN_KEY_EDGE_TRIM = /^[^a-z0-9]+|[^a-z0-9._-]+$/g;
const SKILL_FILE_SUFFIX = `${PATH_SEPARATOR}${CLAUDE_SKILL_FILE_NAME}`;
const RELATIVE_SOURCE_PREFIX = /^\.\/+/;

export interface UploadedSkill {
  name: string;
  description: string;
  path: string;
  content: string;
}

export interface UploadedPlugin {
  key: string;
  name: string;
  description: string;
  version: string;
  skills: UploadedSkill[];
}

export interface UploadedPluginArchive {
  sourceName: string;
  plugins: UploadedPlugin[];
}

export class PluginArchiveError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(issues[0] ?? UPLOAD_NOT_AN_ARCHIVE_MESSAGE);
    this.name = 'PluginArchiveError';
    this.issues = issues;
  }
}

interface ArchiveMember {
  path: string;
  size: number;
  read: () => Promise<Uint8Array>;
}

function declaredSize(file: JSZip.JSZipObject): number {
  const data = (file as unknown as { _data?: { uncompressedSize?: unknown } })._data;
  const size = data?.uncompressedSize;
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : 0;
}

/**
 * The uncompressed size in a ZIP header is written by whoever made the archive,
 * so a member that declares a kilobyte and inflates to a gigabyte passed the
 * ceiling check and was then decompressed whole into memory. Counting while
 * inflating is the only bound that does not trust the archive, and the running
 * total is carried across members so many small lies cost no more than one big
 * one.
 */
async function readBounded(
  file: JSZip.JSZipObject,
  memberPath: string,
  budget: { remaining: number },
): Promise<Uint8Array> {
  const limit = Math.min(PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES, Math.max(budget.remaining, 0));
  const chunks: Buffer[] = [];
  let total = 0;

  await new Promise<void>((resolve, reject) => {
    const stream = file.nodeStream('nodebuffer');
    const fail = (error: unknown): void => {
      stream.removeAllListeners();
      const destroy = (stream as { destroy?: () => void }).destroy;
      if (typeof destroy === 'function') destroy.call(stream);
      reject(error);
    };
    stream.on('data', (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > limit) {
        fail(
          new PluginArchiveError([
            uploadMemberTooLargeMessage(memberPath, PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES),
          ]),
        );
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', fail);
    stream.on('end', () => resolve());
  });

  budget.remaining -= total;
  return new Uint8Array(Buffer.concat(chunks, total));
}

function isSymlink(file: JSZip.JSZipObject): boolean {
  const mode = file.unixPermissions;
  if (typeof mode !== 'number') return false;
  return (mode & UNIX_FILE_TYPE_MASK) === UNIX_FILE_TYPE_SYMLINK;
}

export function unsafeArchivePath(path: string): boolean {
  if (path.length === 0 || path.length > PLUGIN_UPLOAD_MAX_PATH_CHARS) return true;
  if (path.includes(NULL_BYTE)) return true;
  if (path.includes(WINDOWS_SEPARATOR)) return true;
  if (path.startsWith(PATH_SEPARATOR)) return true;
  if (WINDOWS_DRIVE_PREFIX.test(path)) return true;
  return path
    .split(PATH_SEPARATOR)
    .some((segment) => segment === PARENT_SEGMENT || segment === CURRENT_SEGMENT);
}

export function pluginKeyFrom(value: string): string | null {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(PLUGIN_KEY_DISALLOWED, '-')
    .replace(PLUGIN_KEY_EDGE_TRIM, '')
    .slice(0, PLUGIN_KEY_MAX_CHARS);
  return slug.length > 0 && PLUGIN_KEY_ALLOWED.test(slug) ? slug : null;
}

const ROOT_MARKER_PREFIXES = [
  `${CLAUDE_PLUGIN_SKILLS_DIRECTORY}${PATH_SEPARATOR}`,
  CLAUDE_PLUGIN_METADATA_PATH.slice(0, CLAUDE_PLUGIN_METADATA_PATH.indexOf(PATH_SEPARATOR) + 1),
];

export function commonRootPrefix(paths: readonly string[]): string {
  if (paths.some((path) => ROOT_MARKER_PREFIXES.some((prefix) => path.startsWith(prefix)))) {
    return '';
  }
  const first = paths[0];
  if (first === undefined) return '';
  const separator = first.indexOf(PATH_SEPARATOR);
  if (separator <= 0) return '';
  const candidate = first.slice(0, separator + 1);
  return paths.every((path) => path.startsWith(candidate)) ? candidate : '';
}

async function readMembers(archive: Uint8Array): Promise<Map<string, ArchiveMember>> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archive);
  } catch {
    throw new PluginArchiveError([UPLOAD_NOT_AN_ARCHIVE_MESSAGE]);
  }

  const files: Array<{ path: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((path, file) => {
    if (!file.dir) files.push({ path, file });
  });
  if (files.length === 0) throw new PluginArchiveError([UPLOAD_EMPTY_MESSAGE]);
  if (files.length > PLUGIN_UPLOAD_MAX_MEMBERS) {
    throw new PluginArchiveError([UPLOAD_TOO_MANY_MEMBERS_MESSAGE]);
  }

  let total = 0;
  for (const { path, file } of files) {
    if (unsafeArchivePath(path)) throw new PluginArchiveError([uploadUnsafePathMessage(path)]);
    if (isSymlink(file)) throw new PluginArchiveError([uploadSymlinkMessage(path)]);
    const size = declaredSize(file);
    if (size > PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES) {
      throw new PluginArchiveError([
        uploadMemberTooLargeMessage(path, PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES),
      ]);
    }
    total += size;
    if (total > PLUGIN_UPLOAD_MAX_TOTAL_BYTES) {
      throw new PluginArchiveError([UPLOAD_EXPANDS_TOO_FAR_MESSAGE]);
    }
  }

  const root = commonRootPrefix(files.map(({ path }) => path));
  // The loop above trusts the declared sizes, which is fine as a cheap early
  // refusal. This budget is what actually holds, because it counts bytes as
  // they inflate.
  const budget = { remaining: PLUGIN_UPLOAD_MAX_TOTAL_BYTES };
  const members = new Map<string, ArchiveMember>();
  for (const { path, file } of files) {
    const relative = root.length > 0 ? path.slice(root.length) : path;
    if (relative.length === 0) continue;
    members.set(relative, {
      path: relative,
      size: declaredSize(file),
      read: () => readBounded(file, relative, budget),
    });
  }
  return members;
}

async function readText(member: ArchiveMember): Promise<string> {
  const bytes = await member.read();
  if (bytes.byteLength > PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES) {
    throw new PluginArchiveError([
      uploadMemberTooLargeMessage(member.path, PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES),
    ]);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new PluginArchiveError([uploadNotUtf8Message(member.path)]);
  }
}

async function readJson(member: ArchiveMember | undefined): Promise<unknown | null> {
  if (!member) return null;
  try {
    return JSON.parse(await readText(member)) as unknown;
  } catch (error) {
    if (error instanceof PluginArchiveError) throw error;
    return null;
  }
}

function skillPathsUnder(members: Map<string, ArchiveMember>, directory: string): string[] {
  const prefix =
    directory.length > 0
      ? `${directory}${PATH_SEPARATOR}${CLAUDE_PLUGIN_SKILLS_DIRECTORY}${PATH_SEPARATOR}`
      : `${CLAUDE_PLUGIN_SKILLS_DIRECTORY}${PATH_SEPARATOR}`;
  return [...members.keys()]
    .filter((path) => path.startsWith(prefix) && path.endsWith(SKILL_FILE_SUFFIX))
    .sort();
}

async function readSkills(
  members: Map<string, ArchiveMember>,
  paths: readonly string[],
  pluginName: string,
): Promise<UploadedSkill[]> {
  if (paths.length > PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL) {
    throw new PluginArchiveError([
      uploadTooManySkillsMessage(pluginName, PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL),
    ]);
  }
  const skills: UploadedSkill[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const member = members.get(path);
    if (!member) continue;
    const content = await readText(member);
    const skill = parseSkillFile(path, content);
    if (!skill || seen.has(skill.name)) continue;
    seen.add(skill.name);
    skills.push({ name: skill.name, description: skill.description, path: skill.path, content });
  }
  return skills;
}

function pluginDirectoryFor(source: unknown, fallback: string): string {
  if (typeof source !== 'string') return fallback;
  const trimmed = source.trim().replace(RELATIVE_SOURCE_PREFIX, '').replace(/\/+$/, '');
  return trimmed.length > 0 && !unsafeArchivePath(trimmed) ? trimmed : fallback;
}

async function singlePlugin(
  members: Map<string, ArchiveMember>,
  fallbackName: string,
): Promise<UploadedPlugin> {
  const metadata = parsePluginMetadata(await readJson(members.get(CLAUDE_PLUGIN_METADATA_PATH)));
  const declared = metadata.skills
    .map((skill) => `${skill.replace(RELATIVE_SOURCE_PREFIX, '')}${SKILL_FILE_SUFFIX}`)
    .filter((path) => members.has(path));
  const paths = declared.length > 0 ? declared : skillPathsUnder(members, '');
  const name = neutralizeCopy(fallbackName) || fallbackName;
  const key = pluginKeyFrom(name);
  if (!key) throw new PluginArchiveError([uploadUnusableNameMessage(name)]);
  const skills = await readSkills(members, paths, name);
  if (skills.length === 0) throw new PluginArchiveError([UPLOAD_NO_SKILLS_MESSAGE]);
  return {
    key,
    name,
    description: neutralizeCopy(metadata.description ?? '') || name,
    version: displayVersion(metadata.version, null),
    skills,
  };
}

async function marketplacePlugins(
  members: Map<string, ArchiveMember>,
  manifestJson: unknown,
): Promise<UploadedPluginArchive> {
  const manifest = parseClaudeMarketplaceManifest(manifestJson);
  if (manifest.plugins.length > PLUGIN_MARKETPLACE_MAX_PLUGINS) {
    throw new PluginArchiveError([uploadTooManyPluginsMessage(PLUGIN_MARKETPLACE_MAX_PLUGINS)]);
  }
  const plugins: UploadedPlugin[] = [];
  const claimed = new Set<string>();
  for (const declared of manifest.plugins) {
    const name = neutralizeCopy(declared.displayName?.trim() || declared.name) || declared.name;
    const key = pluginKeyFrom(declared.name);
    if (!key || claimed.has(key)) continue;
    const directory = pluginDirectoryFor(declared.source, declared.name);
    const paths = (declared.skills ?? [])
      .map((skill) => `${directory}${PATH_SEPARATOR}${lastSegmentPath(skill)}`)
      .filter((path) => members.has(path));
    const resolved = paths.length > 0 ? paths : skillPathsUnder(members, directory);
    const skills = await readSkills(members, resolved, name);
    if (skills.length === 0) continue;
    claimed.add(key);
    plugins.push({
      key,
      name,
      description: neutralizeCopy(declared.description ?? '') || name,
      version: displayVersion(declared.version, null),
      skills,
    });
  }
  if (plugins.length === 0) throw new PluginArchiveError([UPLOAD_NO_SKILLS_MESSAGE]);
  return { sourceName: neutralizeCopy(manifest.name) || manifest.name, plugins };
}

function lastSegmentPath(declaredSkill: string): string {
  const cleaned = declaredSkill.replace(RELATIVE_SOURCE_PREFIX, '').replace(/\/+$/, '');
  return `${CLAUDE_PLUGIN_SKILLS_DIRECTORY}${PATH_SEPARATOR}${lastSegment(cleaned)}${SKILL_FILE_SUFFIX}`;
}

export async function readSingleSkillFromArchive(
  archive: Uint8Array,
): Promise<{ path: string; content: string }> {
  const members = await readMembers(archive);
  const paths = [...members.keys()]
    .filter((path) => path === CLAUDE_SKILL_FILE_NAME || path.endsWith(SKILL_FILE_SUFFIX))
    .sort();
  if (paths.length === 0) throw new PluginArchiveError([UPLOAD_NO_SKILL_FILE_MESSAGE]);
  if (paths.length > 1) throw new PluginArchiveError([UPLOAD_MANY_SKILL_FILES_MESSAGE]);
  const path = paths[0]!;
  return { path, content: await readText(members.get(path)!) };
}

export async function readPluginArchive(
  archive: Uint8Array,
  fallbackName: string,
): Promise<UploadedPluginArchive> {
  const members = await readMembers(archive);

  const marketplaceJson = await readJson(members.get(CLAUDE_MARKETPLACE_MANIFEST_PATH));
  if (marketplaceJson !== null) {
    try {
      return await marketplacePlugins(members, marketplaceJson);
    } catch (error) {
      if (error instanceof PluginArchiveError) throw error;
      throw new PluginArchiveError([
        error instanceof Error ? error.message : UPLOAD_NO_PLUGIN_MESSAGE,
      ]);
    }
  }

  const hasMetadata = members.has(CLAUDE_PLUGIN_METADATA_PATH);
  const hasSkills = skillPathsUnder(members, '').length > 0;
  if (!hasMetadata && !hasSkills) throw new PluginArchiveError([UPLOAD_NO_PLUGIN_MESSAGE]);

  const plugin = await singlePlugin(members, fallbackName);
  return { sourceName: plugin.name, plugins: [plugin] };
}
