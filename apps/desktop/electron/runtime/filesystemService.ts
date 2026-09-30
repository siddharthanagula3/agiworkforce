import { createHash } from 'node:crypto';
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
  type FileTextEdit,
  type FileTextWrite,
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

function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
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

function validUtf8(bytes: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

async function assertWritableUtf8(absolute: string, relative: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>>;
  try {
    handle = await fs.open(absolute, 'r');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const bytes = Buffer.alloc(MAX_TEXT_READ_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, null);
      try {
        decoder.decode(bytes.subarray(0, bytesRead), { stream: bytesRead !== 0 });
      } catch {
        throw new TextEditRefused(`${relative} is not UTF-8 and cannot be edited here.`);
      }
      if (bytesRead === 0) return;
    }
  } finally {
    await handle.close();
  }
}

const fileMutations = new Map<string, Promise<void>>();

async function serializeFileMutation<T>(absolute: string, work: () => Promise<T>): Promise<T> {
  const previous = fileMutations.get(absolute) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  fileMutations.set(absolute, pending);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (fileMutations.get(absolute) === pending) fileMutations.delete(absolute);
  }
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
    const { bytesRead, buffer } = await handle.read(Buffer.alloc(length), 0, length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    if (looksBinary(bytes.subarray(0, Math.min(BINARY_SNIFF_BYTES, bytesRead)))) {
      throw new PathRefused('io-error', `${resolved.relative} is a binary file.`);
    }
    const truncated = stat.size > MAX_TEXT_READ_BYTES;
    return {
      path: toPosix(resolved.relative),
      text: bytes.toString('utf8'),
      readOnly: !validUtf8(bytes),
      lineEnding: bytes.includes(Buffer.from('\r\n')) ? 'crlf' : 'lf',
      sizeBytes: stat.size,
      modifiedAtMs: stat.mtimeMs,
      truncated,
      ...(truncated ? {} : { sha256: sha256Of(bytes) }),
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

export class WriteConflict extends Error {}

async function assertUnchangedSinceRead(
  absolute: string,
  relative: string,
  expectedSha256: string,
): Promise<void> {
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(absolute);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new WriteConflict(`${relative} was deleted since it was read.`);
    }
    throw error;
  }
  if (
    !stat.isFile() ||
    stat.size > MAX_TEXT_READ_BYTES ||
    sha256Of(await fs.readFile(absolute)) !== expectedSha256
  ) {
    throw new WriteConflict(`${relative} changed on disk since it was read.`);
  }
}

export async function writeTextFile(
  root: WorkspaceRoot,
  relativePath: string,
  text: string,
  expectedSha256?: string,
): Promise<FileTextWrite> {
  const resolved = await resolveWithinRoot(root, relativePath);
  assertNotDeniedFile(resolved.absolute);
  return serializeFileMutation(resolved.absolute, () =>
    writeResolvedTextFile(
      root,
      relativePath,
      resolved.absolute,
      resolved.relative,
      text,
      expectedSha256,
    ),
  );
}

async function writeResolvedTextFile(
  root: WorkspaceRoot,
  relativePath: string,
  absolute: string,
  relative: string,
  text: string,
  expectedSha256?: string,
): Promise<FileTextWrite> {
  if (expectedSha256 === undefined) {
    await fs.mkdir(path.dirname(absolute), { recursive: true });
  } else {
    await assertUnchangedSinceRead(absolute, relative, expectedSha256);
  }
  await assertWritableUtf8(absolute, relative);
  const bytes = Buffer.from(text, 'utf8');
  await fs.writeFile(absolute, bytes);
  const stat = await statPath(root, relativePath);
  return bytes.length > MAX_TEXT_READ_BYTES ? stat : { ...stat, sha256: sha256Of(bytes) };
}

export class TextEditRefused extends Error {}

function countOccurrences(text: string, passage: string): number {
  let count = 0;
  let index = text.indexOf(passage);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(passage, index + passage.length);
  }
  return count;
}

export async function editTextFile(
  root: WorkspaceRoot,
  relativePath: string,
  oldText: string,
  newText: string,
  replaceAll: boolean,
): Promise<FileTextEdit> {
  const resolved = await resolveWithinRoot(root, relativePath);
  assertNotDeniedFile(resolved.absolute);
  return serializeFileMutation(resolved.absolute, async () => {
    const current = await readTextFile(root, relativePath);
    if (current.readOnly)
      throw new TextEditRefused(`${current.path} is not UTF-8 and cannot be edited here.`);
    if (current.truncated) {
      throw new TextEditRefused(
        `${current.path} is too large to edit in place. Replace it whole instead.`,
      );
    }
    const occurrences = countOccurrences(current.text, oldText);
    if (occurrences === 0) {
      throw new TextEditRefused(
        `The passage to replace is not in ${current.path}. Read the file again and copy the passage exactly.`,
      );
    }
    if (occurrences > 1 && !replaceAll) {
      throw new TextEditRefused(
        `The passage appears ${occurrences} times in ${current.path}. Include more of the surrounding text so it appears once, or set replaceAll.`,
      );
    }
    const next = replaceAll
      ? current.text.split(oldText).join(newText)
      : current.text.replace(oldText, () => newText);
    const stat = await writeResolvedTextFile(
      root,
      relativePath,
      resolved.absolute,
      resolved.relative,
      next,
      current.sha256,
    );
    return { path: current.path, replacements: occurrences, sizeBytes: stat.sizeBytes };
  });
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

export interface SearchOptions {
  ignoreCase?: boolean;
}

export async function globFiles(
  root: WorkspaceRoot,
  pattern: string,
  relativePath = '',
  options: SearchOptions = {},
): Promise<FileEntry[]> {
  const resolved = await resolveWithinRoot(root, relativePath);
  const exact = globToRegExp(pattern);
  const matcher = options.ignoreCase ? new RegExp(exact.source, 'i') : exact;
  const results: FileEntry[] = [];

  for await (const found of walk(resolved.absolute, resolved.relative, 0)) {
    if (results.length >= MAX_LIST_ENTRIES) break;
    if (!matcher.test(found.relative)) continue;
    const entry = await entryFor(found.absolute, found.relative);
    if (entry) results.push(entry);
  }
  return results;
}

function grepText(
  relative: string,
  text: string,
  query: string,
  limit: number,
  ignoreCase: boolean,
): FileSearchMatch[] {
  if (!ignoreCase) {
    return grepLines(relative, text, query, { limit, previewLimit: GREP_PREVIEW_LIMIT });
  }
  const lines = text.split('\n');
  return grepLines(relative, text.toLowerCase(), query.toLowerCase(), {
    limit,
    previewLimit: GREP_PREVIEW_LIMIT,
  }).map((match) => ({
    ...match,
    preview: (lines[match.line - 1] ?? match.preview).slice(0, GREP_PREVIEW_LIMIT),
  }));
}

export async function grepFiles(
  root: WorkspaceRoot,
  query: string,
  relativePath = '',
  options: SearchOptions = {},
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
      ...grepText(
        found.relative,
        buffer.toString('utf8'),
        query,
        MAX_GREP_MATCHES - matches.length,
        options.ignoreCase === true,
      ),
    );
  }
  return matches;
}
