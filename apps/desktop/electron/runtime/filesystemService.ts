import { createHash, randomBytes } from 'node:crypto';
import { constants, promises as fs, type BigIntStats } from 'node:fs';
import path from 'node:path';
import {
  MAX_BINARY_READ_BYTES,
  MAX_GREP_MATCHES,
  MAX_LIST_ENTRIES,
  MAX_TEXT_READ_BYTES,
  isCredentialPath,
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
import {
  assertNotDeniedFile,
  assertWritable,
  PathRefused,
  resolveWithinRoot,
  type ResolvedWorkspacePath,
} from './pathGuard';
import { NONBLOCKING_READ, readRegularFile } from './regularFile';

/**
 * The path was resolved and judged before this open, and Node has no way to
 * open relative to a directory already held. So no open truncates or follows
 * a link in the last component, and the file's name is not given new
 * contents until `openedFileStanding` has looked at what was actually
 * opened. A new file is made with `O_EXCL`, which is also how a refused write
 * knows whether the file is its own to remove. A FIFO put in the file's place
 * would hang a blocking open for good.
 */
const OPEN_WITHOUT_FOLLOWING =
  constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const CREATE_FOR_CHECKED_WRITE = OPEN_WITHOUT_FOLLOWING | constants.O_CREAT | constants.O_EXCL;
const CREATE_BESIDE =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
const PERMISSION_BITS = 0o7777n;

const REPLACED_BEFORE_OPEN = ['ELOOP', 'ENXIO'];

function notWhereChecked(relativePath: string): PathRefused {
  return new PathRefused(
    'traversal',
    `${relativePath} is not the regular file that was checked, so nothing was written.`,
  );
}

function sharedWithAnotherLocation(relativePath: string): PathRefused {
  return new PathRefused(
    'shared-file',
    `${relativePath} is shared with another location through a hard link, for example a package manager's store, so AGI Cloud will not overwrite it.`,
  );
}

/**
 * What the open descriptor turned out to be, against what the check approved.
 * `moved`: its directory no longer resolves to the one that was judged, the
 * name no longer leads to this very file, or it is not a regular file, which
 * is what a directory or a file swapped after the check looks like. `shared`:
 * it is the checked file, and another name somewhere also leads to it, so
 * writing here would change a file this check never saw.
 */
async function openedFileStanding(
  handle: fs.FileHandle,
  absolute: string,
): Promise<'checked' | 'moved' | 'shared'> {
  try {
    const parent = path.dirname(absolute);
    if ((await fs.realpath(parent)) !== parent) return 'moved';
    const opened = await handle.stat({ bigint: true });
    const named = await fs.lstat(absolute, { bigint: true });
    if (!opened.isFile() || opened.dev !== named.dev || opened.ino !== named.ino) return 'moved';
    return opened.nlink === 1n ? 'checked' : 'shared';
  } catch {
    return 'moved';
  }
}

function toPosix(value: string): string {
  return toPosixPath(value.split(path.sep).join('/'));
}

function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function notRegularFile(relative: string): PathRefused {
  return new PathRefused('io-error', `${relative} is not a regular file.`);
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
  const handle = await fs.open(absolute, NONBLOCKING_READ);
  try {
    const sample = Buffer.alloc(Math.min(BINARY_SNIFF_BYTES, size));
    await handle.read(sample, 0, sample.length, 0);
    return looksBinary(sample);
  } finally {
    await handle.close();
  }
}

/**
 * A read names the path twice as a write does: once to judge it and once to
 * open it, and a command that may rename inside the folder can put a link
 * where the judged file was in between. So a read opens without following a
 * link in the last component, and returns nothing until what it opened is
 * the file or folder the check approved: its folder still resolves to
 * itself, and the name still leads to this very inode. Every byte then comes
 * from the handle, never from the path again.
 */
export const OPEN_FILE_FOR_CHECKED_READ = NONBLOCKING_READ | (constants.O_NOFOLLOW ?? 0);
const OPEN_FOLDER_FOR_CHECKED_READ = OPEN_FILE_FOR_CHECKED_READ | (constants.O_DIRECTORY ?? 0);

function notWhereCheckedForRead(relativePath: string): PathRefused {
  return new PathRefused(
    'traversal',
    `${relativePath || '.'} is not what was checked a moment ago, so nothing of it was read.`,
  );
}

export async function openChecked(
  absolute: string,
  relativePath: string,
  flags: number,
): Promise<{ handle: fs.FileHandle; stat: BigIntStats }> {
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(absolute, flags);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (REPLACED_BEFORE_OPEN.includes(code)) throw notWhereCheckedForRead(relativePath);
    throw error;
  }
  try {
    const parent = path.dirname(absolute);
    const stat = await handle.stat({ bigint: true });
    const named = await fs.lstat(absolute, { bigint: true });
    if (
      (await fs.realpath(parent)) !== parent ||
      stat.dev !== named.dev ||
      stat.ino !== named.ino
    ) {
      throw notWhereCheckedForRead(relativePath);
    }
    return { handle, stat };
  } catch (error) {
    await handle.close();
    throw error instanceof PathRefused ? error : notWhereCheckedForRead(relativePath);
  }
}

async function readFrom(handle: fs.FileHandle, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await handle.read(buffer, read, length - read, read);
    if (bytesRead === 0) break;
    read += bytesRead;
  }
  return buffer.subarray(0, read);
}

/**
 * A path that leads to the folder a handle holds whatever is renamed around
 * it, or null where the system has none. Node cannot list a folder from its
 * handle, so the listing goes through the name the system keeps for the
 * folder itself: its volume and file number on macOS, the handle's own entry
 * on Linux.
 */
function heldFolderPath(handle: fs.FileHandle, stat: BigIntStats): string | null {
  if (process.platform === 'darwin') return `/.vol/${stat.dev}/${stat.ino}`;
  if (process.platform === 'linux') return `/proc/self/fd/${handle.fd}`;
  return null;
}

export async function listDirectory(
  root: WorkspaceRoot,
  relativePath: string,
): Promise<FileEntry[]> {
  const resolved = await resolveWithinRoot(root, relativePath);
  if (!(await fs.stat(resolved.absolute)).isDirectory()) {
    throw new PathRefused('io-error', `${resolved.relative || '.'} is not a directory.`);
  }
  const { handle, stat } = await openChecked(
    resolved.absolute,
    resolved.relative,
    OPEN_FOLDER_FOR_CHECKED_READ,
  );
  try {
    const held = heldFolderPath(handle, stat);
    const names = held === null ? null : await fs.readdir(held).catch(() => null);
    if (held !== null && names !== null) return await entriesOf(held, names, resolved.relative);
    // No name for the held folder on this system or this volume: list by
    // path, and keep the listing only if the same folder is still there.
    const listed = await entriesOf(
      resolved.absolute,
      await fs.readdir(resolved.absolute),
      resolved.relative,
    );
    const again = await openChecked(
      resolved.absolute,
      resolved.relative,
      OPEN_FOLDER_FOR_CHECKED_READ,
    );
    await again.handle.close();
    if (again.stat.ino !== stat.ino || again.stat.dev !== stat.dev) {
      throw notWhereCheckedForRead(resolved.relative);
    }
    return listed;
  } finally {
    await handle.close();
  }
}

async function entriesOf(
  folder: string,
  names: readonly string[],
  relative: string,
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  for (const name of names.slice(0, MAX_LIST_ENTRIES)) {
    const entry = await entryFor(path.join(folder, name), joinWorkspacePath(relative, name));
    if (entry) entries.push(entry);
  }

  entries.sort((a, b) => {
    if (a.kind === 'directory' && b.kind !== 'directory') return -1;
    if (b.kind === 'directory' && a.kind !== 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

async function statPath(root: WorkspaceRoot, relativePath: string): Promise<FileStat> {
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

/** The checked file, open, or the refusal a folder or a device gets. */
async function openCheckedFile(
  resolved: ResolvedWorkspacePath,
): Promise<{ handle: fs.FileHandle; stat: BigIntStats }> {
  const opened = await openChecked(
    resolved.absolute,
    resolved.relative,
    OPEN_FILE_FOR_CHECKED_READ,
  );
  if (opened.stat.isFile()) return opened;
  await opened.handle.close();
  throw opened.stat.isDirectory()
    ? new PathRefused('io-error', `${resolved.relative} is a directory.`)
    : notRegularFile(resolved.relative);
}

function validUtf8(bytes: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * The file a write expects to find as it was read, opened the way a read is,
 * or null when it is gone.
 */
async function openExistingChecked(
  resolved: ResolvedWorkspacePath,
): Promise<{ handle: fs.FileHandle; stat: BigIntStats } | null> {
  try {
    return await openChecked(resolved.absolute, resolved.relative, OPEN_FILE_FOR_CHECKED_READ);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw error;
  }
}

async function assertWritableUtf8(handle: fs.FileHandle, relative: string): Promise<void> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const bytes = Buffer.alloc(MAX_TEXT_READ_BYTES);
  for (let position = 0; ;) {
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, position);
    position += bytesRead;
    try {
      decoder.decode(bytes.subarray(0, bytesRead), { stream: bytesRead !== 0 });
    } catch {
      throw new TextEditRefused(`${relative} is not UTF-8 and cannot be edited here.`);
    }
    if (bytesRead === 0) return;
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

  const { handle, stat } = await openCheckedFile(resolved);
  try {
    const size = Number(stat.size);
    const bytes = await readFrom(handle, Math.min(size, MAX_TEXT_READ_BYTES));
    if (looksBinary(bytes.subarray(0, Math.min(BINARY_SNIFF_BYTES, bytes.length)))) {
      throw new PathRefused('io-error', `${resolved.relative} is a binary file.`);
    }
    const truncated = size > MAX_TEXT_READ_BYTES;
    return {
      path: toPosix(resolved.relative),
      text: bytes.toString('utf8'),
      readOnly: !validUtf8(bytes),
      lineEnding: bytes.includes(Buffer.from('\r\n')) ? 'crlf' : 'lf',
      sizeBytes: size,
      modifiedAtMs: Number(stat.mtimeMs),
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

  const { handle, stat } = await openCheckedFile(resolved);
  try {
    const size = Number(stat.size);
    if (size > MAX_BINARY_READ_BYTES) {
      throw new PathRefused('io-error', `${resolved.relative} is too large to read.`);
    }
    const buffer = await readFrom(handle, size);
    return {
      path: toPosix(resolved.relative),
      base64: buffer.toString('base64'),
      sizeBytes: size,
      modifiedAtMs: Number(stat.mtimeMs),
    };
  } finally {
    await handle.close();
  }
}

async function isFolderItself(candidate: string): Promise<boolean> {
  try {
    return (await fs.lstat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Makes the folders above a new file that do not exist yet, one at a time,
 * and answers with the ones it made. Each has to be a folder itself once it
 * is there, not a link someone put in its place, and the whole of `parent`
 * has to resolve to itself afterwards, or the write is refused with nothing
 * of it left behind. A recursive create walks through any link on the way.
 */
async function makeParents(parent: string, relativePath: string): Promise<string[]> {
  const missing: string[] = [];
  for (let folder = parent; !(await isFolderItself(folder)); folder = path.dirname(folder)) {
    if (folder === path.dirname(folder)) throw notWhereChecked(relativePath);
    missing.unshift(folder);
  }
  const made: string[] = [];
  try {
    for (const folder of missing) {
      try {
        await fs.mkdir(folder);
        made.push(folder);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      if (!(await isFolderItself(folder))) throw notWhereChecked(relativePath);
    }
    if ((await fs.realpath(parent)) !== parent) throw notWhereChecked(relativePath);
  } catch (error) {
    await removeMade(made);
    throw error;
  }
  return made;
}

/**
 * Takes back the folders one write made, deepest first. `rmdir` removes only
 * an empty folder and does not follow a link in its last component, so a
 * folder something else has since filled, or swapped, is left alone.
 */
async function removeMade(folders: readonly string[]): Promise<void> {
  for (const folder of [...folders].reverse()) {
    await fs.rmdir(folder).catch(() => undefined);
  }
}

/**
 * Removes the empty file a refused write created, when the name still leads
 * to that very file. One that no longer does is somebody else's by now.
 */
async function removeCreatedFile(handle: fs.FileHandle, absolute: string): Promise<void> {
  try {
    const opened = await handle.stat({ bigint: true });
    const named = await fs.lstat(absolute, { bigint: true });
    if (opened.dev === named.dev && opened.ino === named.ino && opened.size === 0n) {
      await fs.unlink(absolute);
    }
  } catch {
    return;
  }
}

async function openForCheckedWrite(
  absolute: string,
  relativePath: string,
): Promise<{ handle: fs.FileHandle; created: boolean }> {
  try {
    return { handle: await fs.open(absolute, CREATE_FOR_CHECKED_WRITE), created: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  try {
    return { handle: await fs.open(absolute, OPEN_WITHOUT_FOLLOWING), created: false };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if ([...REPLACED_BEFORE_OPEN, 'ENOENT'].includes(code)) throw notWhereChecked(relativePath);
    throw error;
  }
}

async function namesOpened(handle: fs.FileHandle, absolute: string): Promise<boolean> {
  try {
    const opened = await handle.stat({ bigint: true });
    const named = await fs.lstat(absolute, { bigint: true });
    return opened.dev === named.dev && opened.ino === named.ino;
  } catch {
    return false;
  }
}

async function removeBeside(beside: { handle: fs.FileHandle; absolute: string }): Promise<void> {
  if (await namesOpened(beside.handle, beside.absolute)) {
    await fs.unlink(beside.absolute).catch(() => undefined);
  }
}

/**
 * The whole of the new contents, in a file of its own next to the one being
 * written and already on disk. A write that runs out of space, or a process
 * that dies part way, has then cost the file that was there nothing: its name
 * is only pointed at this one once this one is complete.
 */
async function writeBeside(
  absolute: string,
  bytes: Buffer,
  mode: number,
): Promise<{ handle: fs.FileHandle; absolute: string }> {
  const beside = path.join(path.dirname(absolute), `.agi-write-${randomBytes(8).toString('hex')}`);
  const handle = await fs.open(beside, CREATE_BESIDE, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.chmod(mode);
    await handle.sync();
  } catch (error) {
    await removeBeside({ handle, absolute: beside });
    await handle.close();
    throw error;
  }
  return { handle, absolute: beside };
}

/**
 * Replaces a file's contents all at once. The name is opened, never
 * truncated, and checked: it is the regular file that was judged, where it
 * was judged, and no other name leads to it. The new contents are written
 * beside it, the check is made again, and only then is the name moved onto
 * them. Every check is of the file about to be replaced, which is why a file
 * with a second name is refused: the rename would leave that other name on
 * the old contents, and before it, writing in place would have changed a
 * file this check never saw.
 *
 * What is left: `rename` takes two paths, and Node has no form of it that
 * takes a held directory, so a folder above the file swapped for a link
 * between the last check and the rename is not seen by the rename. It is
 * seen straight after, and the contents are then emptied through the handle
 * and the write refused.
 */
async function replaceFileContents(
  resolved: ResolvedWorkspacePath,
  relativePath: string,
  bytes: Buffer,
  inspectReplaced: (existing: fs.FileHandle) => Promise<void>,
): Promise<void> {
  const madeParents = await makeParents(path.dirname(resolved.absolute), relativePath);
  let opened: { handle: fs.FileHandle; created: boolean };
  try {
    opened = await openForCheckedWrite(resolved.absolute, relativePath);
  } catch (error) {
    await removeMade(madeParents);
    throw error;
  }
  const { handle, created } = opened;
  let beside: { handle: fs.FileHandle; absolute: string } | null = null;
  let replaced = false;
  try {
    assertStanding(await openedFileStanding(handle, resolved.absolute), relativePath);
    if (!created) await inspectHeldFile(handle, resolved, relativePath, inspectReplaced);
    const mode = Number((await handle.stat({ bigint: true })).mode & PERMISSION_BITS);
    beside = await writeBeside(resolved.absolute, bytes, mode);
    assertStanding(await openedFileStanding(handle, resolved.absolute), relativePath);
    if (!(await namesOpened(beside.handle, beside.absolute))) throw notWhereChecked(relativePath);
    await fs.rename(beside.absolute, resolved.absolute);
    replaced = true;
    if ((await openedFileStanding(beside.handle, resolved.absolute)) !== 'checked') {
      await beside.handle.truncate(0).catch(() => undefined);
      throw notWhereChecked(relativePath);
    }
  } catch (error) {
    if (beside && !replaced) await removeBeside(beside);
    if (created && !replaced) await removeCreatedFile(handle, resolved.absolute);
    if (!replaced) await removeMade(madeParents);
    throw error;
  } finally {
    await beside?.handle.close();
    await handle.close();
  }
}

/**
 * Hands `inspect` a read handle on the file the write holds, opened the way a
 * read is and refused unless it is that very file.
 */
async function inspectHeldFile(
  writing: fs.FileHandle,
  resolved: ResolvedWorkspacePath,
  relativePath: string,
  inspect: (existing: fs.FileHandle) => Promise<void>,
): Promise<void> {
  const existing = await openChecked(
    resolved.absolute,
    resolved.relative,
    OPEN_FILE_FOR_CHECKED_READ,
  );
  try {
    const held = await writing.stat({ bigint: true });
    if (existing.stat.dev !== held.dev || existing.stat.ino !== held.ino) {
      throw notWhereChecked(relativePath);
    }
    await inspect(existing.handle);
  } finally {
    await existing.handle.close();
  }
}

export class WriteConflict extends Error {}

async function assertUnchangedSinceRead(
  resolved: ResolvedWorkspacePath,
  expectedSha256: string,
): Promise<void> {
  const opened = await openExistingChecked(resolved);
  if (opened === null) {
    throw new WriteConflict(`${resolved.relative} was deleted since it was read.`);
  }
  const { handle, stat } = opened;
  try {
    if (
      !stat.isFile() ||
      stat.size > BigInt(MAX_TEXT_READ_BYTES) ||
      sha256Of(await readFrom(handle, Number(stat.size))) !== expectedSha256
    ) {
      throw new WriteConflict(`${resolved.relative} changed on disk since it was read.`);
    }
  } finally {
    await handle.close();
  }
}

export async function writeTextFile(
  root: WorkspaceRoot,
  relativePath: string,
  text: string,
  expectedSha256?: string,
): Promise<FileTextWrite> {
  const resolved = await resolveWithinRoot(root, relativePath);
  await assertWritable(resolved);
  return serializeFileMutation(resolved.absolute, () =>
    writeResolvedTextFile(root, relativePath, resolved, text, expectedSha256),
  );
}

async function writeResolvedTextFile(
  root: WorkspaceRoot,
  relativePath: string,
  resolved: ResolvedWorkspacePath,
  text: string,
  expectedSha256?: string,
): Promise<FileTextWrite> {
  if (expectedSha256 !== undefined) await assertUnchangedSinceRead(resolved, expectedSha256);
  const bytes = Buffer.from(text, 'utf8');
  await replaceFileContents(resolved, relativePath, bytes, (existing) =>
    assertWritableUtf8(existing, resolved.relative),
  );
  const stat = await statPath(root, relativePath);
  return bytes.length > MAX_TEXT_READ_BYTES ? stat : { ...stat, sha256: sha256Of(bytes) };
}

function assertStanding(standing: 'checked' | 'moved' | 'shared', relativePath: string): void {
  if (standing === 'moved') throw notWhereChecked(relativePath);
  if (standing === 'shared') throw sharedWithAnotherLocation(relativePath);
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
  await assertWritable(resolved);
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
    const stat = await writeResolvedTextFile(root, relativePath, resolved, next, current.sha256);
    return { path: current.path, replacements: occurrences, sizeBytes: stat.sizeBytes };
  });
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

    if (isCredentialPath(found.absolute)) continue;
    const buffer = await readRegularFile(found.absolute, MAX_TEXT_READ_BYTES + 1);
    if (buffer === null || buffer.length > MAX_TEXT_READ_BYTES || looksBinary(buffer)) continue;

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
