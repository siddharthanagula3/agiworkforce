import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  MAX_BINARY_READ_BYTES,
  MAX_GREP_MATCHES,
  MAX_LIST_ENTRIES,
  MAX_TEXT_READ_BYTES,
  type FileBinaryContent,
  type FileEntry,
  type FileSearchMatch,
  type FileStat,
  type FileTextContent,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import {
  BINARY_SNIFF_BYTES,
  globToRegExp,
  grepLines,
  GREP_PREVIEW_LIMIT,
  isSkippedDirectory,
  joinWorkspacePath,
  looksBinary,
  MAX_WORKSPACE_WALK_DEPTH,
  toPosixPath,
} from '@agiworkforce/ide-runtime/workspace';
import { assertNotDeniedFile, PathRefused, resolveWithinRoot } from './pathGuard';

function toPosix(value: string): string {
  return toPosixPath(value.split(path.sep).join('/'));
}

function kindOf(stat: { isSymbolicLink(): boolean; isDirectory(): boolean }): FileEntry['kind'] {
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isDirectory()) return 'directory';
  return 'file';
}

async function entryFor(absolute: string, relative: string): Promise<FileEntry | null> {
  try {
    const stat = await fs.lstat(absolute);
    return {
      name: path.basename(absolute),
      path: toPosix(relative),
      kind: kindOf(stat),
      sizeBytes: stat.size,
      modifiedAtMs: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

async function sniffBinary(absolute: string, size: number): Promise<boolean> {
  if (size === 0) return false;
  const handle = await fs.open(absolute, 'r');
  try {
    const sample = Buffer.alloc(Math.min(BINARY_SNIFF_BYTES, size));
    await handle.read(sample, 0, sample.length, 0);
    return looksBinary(sample);
  } finally {
    await handle.close();
  }
}

export async function listDirectory(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<FileEntry[]> {
  const resolved = await resolveWithinRoot(root, relativePath);
  const stat = await fs.stat(resolved.absolute);
  if (!stat.isDirectory()) {
    throw new PathRefused('io-error', `${resolved.relative || '.'} is not a directory.`);
  }

  const names = await fs.readdir(resolved.absolute);
  const entries: FileEntry[] = [];

  for (const name of names.slice(0, MAX_LIST_ENTRIES)) {
    const entry = await entryFor(
      path.join(resolved.absolute, name),
      joinWorkspacePath(resolved.relative, name),
    );
    if (entry) entries.push(entry);
  }

  entries.sort((a, b) => {
    if (a.kind === 'directory' && b.kind !== 'directory') return -1;
    if (b.kind === 'directory' && a.kind !== 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export async function statPath(root: WorkspaceRoot, relativePath: string): Promise<FileStat> {
  const resolved = await resolveWithinRoot(root, relativePath);
  const stat = await fs.lstat(resolved.absolute);
  const kind = kindOf(stat);

  let readOnly = false;
  try {
    await fs.access(resolved.absolute, fs.constants.W_OK);
  } catch {
    readOnly = true;
  }

  return {
    name: path.basename(resolved.absolute),
    path: toPosix(resolved.relative),
    kind,
    sizeBytes: stat.size,
    modifiedAtMs: stat.mtimeMs,
    binary: kind === 'file' ? await sniffBinary(resolved.absolute, stat.size) : false,
    readOnly,
  };
}

export async function readTextFile(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<FileTextContent> {
  const resolved = await resolveWithinRoot(root, relativePath);
  assertNotDeniedFile(resolved.absolute);

  const stat = await fs.stat(resolved.absolute);
  if (stat.isDirectory()) {
    throw new PathRefused('io-error', `${resolved.relative} is a directory.`);
  }

  const handle = await fs.open(resolved.absolute, 'r');
  try {
    const length = Math.min(stat.size, MAX_TEXT_READ_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    if (looksBinary(buffer.subarray(0, Math.min(BINARY_SNIFF_BYTES, length)))) {
      throw new PathRefused('io-error', `${resolved.relative} is a binary file.`);
    }
    return {
      path: toPosix(resolved.relative),
      text: buffer.toString('utf8'),
      sizeBytes: stat.size,
      modifiedAtMs: stat.mtimeMs,
      truncated: stat.size > MAX_TEXT_READ_BYTES,
    };
  } finally {
    await handle.close();
  }
}

export async function readBinaryFile(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<FileBinaryContent> {
  const resolved = await resolveWithinRoot(root, relativePath);
  assertNotDeniedFile(resolved.absolute);

  const stat = await fs.stat(resolved.absolute);
  if (stat.isDirectory()) {
    throw new PathRefused('io-error', `${resolved.relative} is a directory.`);
  }
  if (stat.size > MAX_BINARY_READ_BYTES) {
    throw new PathRefused('io-error', `${resolved.relative} is too large to read.`);
  }

  const buffer = await fs.readFile(resolved.absolute);
  return {
    path: toPosix(resolved.relative),
    base64: buffer.toString('base64'),
    sizeBytes: stat.size,
    modifiedAtMs: stat.mtimeMs,
  };
}

export async function writeTextFile(
  root: WorkspaceRoot,
  relativePath: string,
  text: string,
): Promise<FileStat> {
  const resolved = await resolveWithinRoot(root, relativePath);
  assertNotDeniedFile(resolved.absolute);
  await fs.mkdir(path.dirname(resolved.absolute), { recursive: true });
  await fs.writeFile(resolved.absolute, text, 'utf8');
  return statPath(root, relativePath);
}

export async function createDirectory(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<FileStat> {
  const resolved = await resolveWithinRoot(root, relativePath);
  await fs.mkdir(resolved.absolute, { recursive: true });
  return statPath(root, relativePath);
}

/**
 * Walks files beneath a directory, never following a symlink.
 *
 * A followed link is how a scoped walk ends up reading somewhere it was never
 * granted, so links are skipped outright rather than resolved and re-checked.
 */
async function* walk(
  absolute: string,
  relative: string,
  depth: number,
): AsyncGenerator<{ absolute: string; relative: string }> {
  if (depth > MAX_WORKSPACE_WALK_DEPTH) return;
  let names: string[];
  try {
    names = await fs.readdir(absolute);
  } catch {
    return;
  }
  for (const name of names) {
    if (isSkippedDirectory(name)) continue;
    const childAbsolute = path.join(absolute, name);
    const childRelative = joinWorkspacePath(relative, name);
    let stat: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stat = await fs.lstat(childAbsolute);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      yield* walk(childAbsolute, childRelative, depth + 1);
    } else {
      yield { absolute: childAbsolute, relative: childRelative };
    }
  }
}

export async function globFiles(
  root: WorkspaceRoot,
  pattern: string,
  relativePath = '',
): Promise<FileEntry[]> {
  const resolved = await resolveWithinRoot(root, relativePath);
  const matcher = globToRegExp(pattern);
  const results: FileEntry[] = [];

  for await (const found of walk(resolved.absolute, resolved.relative, 0)) {
    if (results.length >= MAX_LIST_ENTRIES) break;
    if (!matcher.test(found.relative)) continue;
    const entry = await entryFor(found.absolute, found.relative);
    if (entry) results.push(entry);
  }
  return results;
}

export async function grepFiles(
  root: WorkspaceRoot,
  query: string,
  relativePath = '',
): Promise<FileSearchMatch[]> {
  if (query.length === 0) return [];
  const resolved = await resolveWithinRoot(root, relativePath);
  const matches: FileSearchMatch[] = [];

  for await (const found of walk(resolved.absolute, resolved.relative, 0)) {
    if (matches.length >= MAX_GREP_MATCHES) break;

    let buffer: Buffer;
    try {
      const stat = await fs.stat(found.absolute);
      if (stat.size > MAX_TEXT_READ_BYTES) continue;
      buffer = await fs.readFile(found.absolute);
    } catch {
      continue;
    }
    if (looksBinary(buffer)) continue;

    matches.push(
      ...grepLines(found.relative, buffer.toString('utf8'), query, {
        limit: MAX_GREP_MATCHES - matches.length,
        previewLimit: GREP_PREVIEW_LIMIT,
      }),
    );
  }
  return matches;
}
