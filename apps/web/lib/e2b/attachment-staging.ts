/**
 * Staging this turn's attachments into the execution sandbox workspace.
 *
 * Pure logic over an injected {@link E2BExecutor}: it never creates, resumes or
 * releases a sandbox, so it can only ever run against one the caller already
 * holds. That is deliberate, sandbox slots are a scarce, per-user quota.
 */
import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import type { E2BExecutor, StagedStorageFile } from './types';

/** Matches WORKSPACE_ROOT in ./generated-files.ts, the cwd the sandbox starts in. */
export const SANDBOX_WORKSPACE_ROOT = '/home/user';

const MAX_STAGED_FILENAME_LENGTH = 96;

export interface TurnAttachment {
  readonly filename: string;
  readonly mimeType: string;
  /** The attachment's own bytes, base64 encoded. */
  readonly base64: string;
}

export interface StagedAttachment {
  readonly attachment: TurnAttachment;
  readonly name: string;
  readonly path: string;
}

export interface StagingOutcome {
  readonly staged: string[];
  readonly failed: string[];
}

/**
 * A user-supplied filename reaches a sandbox path here, so only a plain leaf
 * name survives: no directory segments, no leading dot (a dotfile is skipped by
 * the generated-file walker and would be invisible to the model), and nothing
 * outside a conservative character set.
 */
function sandboxFileName(rawFilename: string, index: number): string {
  const leaf = rawFilename.split(/[\\/]/).pop() ?? '';
  const cleaned = leaf
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, MAX_STAGED_FILENAME_LENGTH);
  return cleaned || `attachment-${index + 1}`;
}

function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let suffix = 2; suffix <= taken.size + 2; suffix += 1) {
    const candidate = `${stem}-${suffix}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem}-${taken.size + 3}${ext}`;
}

/**
 * The paths the attachments will occupy. The prompt and the writer both read
 * this, so the model is told the same path the bytes actually land on.
 */
export function resolveStagedAttachments(
  attachments: readonly TurnAttachment[],
): StagedAttachment[] {
  const taken = new Set<string>();
  const staged: StagedAttachment[] = [];
  attachments.forEach((attachment, index) => {
    if (!attachment.base64) return;
    const name = uniqueName(sandboxFileName(attachment.filename, index), taken);
    taken.add(name);
    staged.push({ attachment, name, path: `${SANDBOX_WORKSPACE_ROOT}/${name}` });
  });
  return staged;
}

export function stagedAttachmentPaths(attachments: readonly TurnAttachment[]): string[] {
  return resolveStagedAttachments(attachments).map((entry) => entry.path);
}

/**
 * Writes each attachment into the workspace. One failure is one file: the
 * remaining attachments still stage, and the caller reports what did not.
 */
async function workspaceFileNames(executor: E2BExecutor): Promise<ReadonlySet<string>> {
  const entries = (await executor.listFiles?.(SANDBOX_WORKSPACE_ROOT)) ?? [];
  return new Set(entries.filter((entry) => !entry.isDir).map((entry) => entry.name));
}

export async function stageTurnAttachments(
  executor: E2BExecutor,
  attachments: readonly TurnAttachment[],
  options: { keepExisting?: boolean } = {},
): Promise<StagingOutcome> {
  const staged: string[] = [];
  const failed: string[] = [];
  const existing = options.keepExisting ? await workspaceFileNames(executor) : null;
  for (const entry of resolveStagedAttachments(attachments)) {
    if (existing?.has(entry.name)) continue;
    try {
      const result = await executor.writeFile({
        path: entry.path,
        content: entry.attachment.base64,
        encoding: 'base64',
      });
      if (result.ok) staged.push(entry.path);
      else failed.push(entry.path);
    } catch {
      failed.push(entry.path);
    }
  }
  return { staged, failed };
}

export interface StorageTurnFile {
  readonly assetId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly key: string;
}

export type StorageNotStagedReason =
  'sandbox_unsupported' | 'sandbox_full' | 'not_in_storage' | 'stream_failed';

export interface StagedStorageEntry {
  readonly assetId: string;
  readonly filename: string;
  readonly path: string;
}

export interface NotStagedStorageEntry {
  readonly assetId: string;
  readonly filename: string;
  readonly reason: StorageNotStagedReason;
}

export interface StorageStagingOutcome {
  readonly staged: StagedStorageEntry[];
  readonly notStaged: NotStagedStorageEntry[];
}

export interface StorageStagingOptions {
  /** Ends the copy in progress and reports it and every later file not staged. */
  readonly signal: AbortSignal;
  /** A key it rejects is reported as not in storage, before anything is opened. */
  readonly isAllowedKey: (key: string) => boolean;
  /** How long removing a failed copy may take, so the cleanup ends inside the caller's deadline. Must be a positive number; anything else stages nothing. */
  readonly removeTimeoutMs: number;
  /** Opens a stored object for reading. Defaults to the private bucket. */
  readonly openStream?: (key: string) => Promise<{ body: ReadableStream<Uint8Array> } | null>;
  /** The most bytes the sandbox may hold in total. Defaults to the large-file policy. */
  readonly maxStagedBytes?: number;
}

const STORAGE_NOT_STAGED_NOTES: Record<StorageNotStagedReason, string> = {
  sandbox_unsupported: 'was not placed in the code sandbox: this sandbox cannot take large files.',
  sandbox_full: 'was not placed in the code sandbox: it already holds as much file data as it can.',
  not_in_storage: 'was not placed in the code sandbox: the stored file could not be found.',
  stream_failed: 'was not placed in the code sandbox: copying it failed.',
};

export function storageNotStagedNote(filename: string, reason: StorageNotStagedReason): string {
  return `[code sandbox: ${filename} ${STORAGE_NOT_STAGED_NOTES[reason]}]`;
}

async function defaultOpenStream(
  key: string,
): Promise<{ body: ReadableStream<Uint8Array> } | null> {
  const { getPrivateObjectStream } = await import('@/lib/server/object-storage');
  return getPrivateObjectStream(key);
}

function exactByteStream(
  source: ReadableStream<Uint8Array>,
  expectedBytes: number,
  signal: AbortSignal,
) {
  const counter = { bytes: 0 };
  const reader = source.getReader();
  const release = () => reader.cancel().catch(() => undefined);
  let target: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stop = (error: Error) => {
    void release();
    try {
      target?.error(error);
    } catch {
      // The consumer already ended the stream.
    }
  };
  signal.addEventListener('abort', () => stop(new Error('The copy was stopped.')), {
    once: true,
  });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      target = controller;
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (signal.aborted) return;
        if (done) {
          controller.close();
          return;
        }
        counter.bytes += value.byteLength;
        if (counter.bytes > expectedBytes) {
          stop(new Error('The stored file is larger than its recorded size.'));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel: release,
  });
  return { stream, counter };
}

interface WorkspaceListing {
  readonly fileSizes: ReadonlyMap<string, number>;
  readonly names: ReadonlySet<string>;
}

async function workspaceListing(executor: E2BExecutor): Promise<WorkspaceListing | null> {
  let entries: Awaited<ReturnType<NonNullable<E2BExecutor['listFiles']>>> | undefined;
  try {
    entries = await executor.listFiles?.(SANDBOX_WORKSPACE_ROOT);
  } catch {
    return null;
  }
  if (!entries) return null;
  return {
    fileSizes: new Map(
      entries.filter((entry) => !entry.isDir).map((entry) => [entry.name, entry.byteSize]),
    ),
    names: new Set(entries.map((entry) => entry.name)),
  };
}

const DISPLACED_PREFIX = 'displaced:';

/**
 * Brings the remembered record in line with the workspace. An entry whose file
 * is gone or was rewritten is dropped so the file is copied again; a rewritten
 * file still on disk stays in the record under a key no asset id can equal, so
 * its bytes keep counting against the sandbox total. Returns the keys it
 * dropped and whether the record changed.
 */
function reconcileWithWorkspace(
  record: Record<string, StagedStorageFile>,
  listing: WorkspaceListing,
): { dropped: string[]; changed: boolean } {
  const dropped: string[] = [];
  let changed = false;
  for (const [key, entry] of Object.entries(record)) {
    const name = stagedName(entry.path);
    const listedSize = listing.fileSizes.get(name);
    if (key.startsWith(DISPLACED_PREFIX)) {
      if (listedSize === undefined) {
        delete record[key];
        dropped.push(key);
        changed = true;
      } else if (listedSize !== entry.byteSize) {
        record[key] = { path: entry.path, byteSize: listedSize };
        changed = true;
      }
      continue;
    }
    if (listedSize === entry.byteSize) continue;
    delete record[key];
    dropped.push(key);
    changed = true;
    if (listedSize !== undefined) {
      record[`${DISPLACED_PREFIX}${name}`] = { path: entry.path, byteSize: listedSize };
    }
  }
  return { dropped, changed };
}

function stagedName(path: string): string {
  return path.slice(SANDBOX_WORKSPACE_ROOT.length + 1);
}

async function rememberedRecord(executor: E2BExecutor): Promise<Record<string, StagedStorageFile>> {
  try {
    return { ...((await executor.storageStaging?.load()) ?? {}) };
  } catch {
    return {};
  }
}

async function remember(
  executor: E2BExecutor,
  record: Record<string, StagedStorageFile>,
  forget: readonly string[] = [],
): Promise<void> {
  try {
    await executor.storageStaging?.save(record, forget);
  } catch {
    // A save that fails costs one restage on a later turn, not the staged file.
  }
}

async function removePartialCopy(
  executor: E2BExecutor,
  path: string,
  requestTimeoutMs: number,
): Promise<boolean> {
  if (!executor.removeFile) return false;
  try {
    return (await executor.removeFile(path, { requestTimeoutMs })).ok;
  } catch {
    return false;
  }
}

function isUnsupportedFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'TemplateError';
}

/**
 * Streams large chat files from private storage into the sandbox workspace, one
 * file at a time and never whole in memory. A file the sandbox already holds is
 * not copied again; one that does not fit the sandbox's total is reported, not
 * staged. A copy that fails is removed from the workspace, so bytes that failed
 * their size check are never left readable and a retry reuses the name; one that
 * cannot be removed stays counted against the total until the workspace drops it.
 */
export async function stageStorageFiles(
  executor: E2BExecutor,
  files: readonly StorageTurnFile[],
  options: StorageStagingOptions,
): Promise<StorageStagingOutcome> {
  const staged: StagedStorageEntry[] = [];
  const notStaged: NotStagedStorageEntry[] = [];
  if (files.length === 0) return { staged, notStaged };

  const hasTimeToCopy =
    !options.signal.aborted &&
    Number.isFinite(options.removeTimeoutMs) &&
    options.removeTimeoutMs > 0;
  if (!hasTimeToCopy) {
    const refused = new Set<string>();
    for (const file of files) {
      if (refused.has(file.assetId)) continue;
      refused.add(file.assetId);
      notStaged.push({ assetId: file.assetId, filename: file.filename, reason: 'stream_failed' });
    }
    return { staged, notStaged };
  }

  const maxStagedBytes =
    options.maxStagedBytes ?? CHAT_LARGE_FILE_POLICY.largeFiles.sandboxStagedBytesMax;
  const openStream = options.openStream ?? defaultOpenStream;
  const record = await rememberedRecord(executor);
  const listing = await workspaceListing(executor);
  const listingUnknown = !listing;
  if (listing) {
    const { dropped, changed } = reconcileWithWorkspace(record, listing);
    if (changed) await remember(executor, record, dropped);
  }
  let usedBytes = Object.values(record).reduce((total, entry) => total + entry.byteSize, 0);
  const taken = new Set<string>([
    ...Object.values(record).map((entry) => stagedName(entry.path)),
    ...(listing?.names ?? []),
  ]);
  const seen = new Set<string>();

  for (const [index, file] of files.entries()) {
    if (seen.has(file.assetId)) continue;
    seen.add(file.assetId);
    const refuse = (reason: StorageNotStagedReason) =>
      notStaged.push({ assetId: file.assetId, filename: file.filename, reason });

    if (options.signal.aborted) {
      refuse('stream_failed');
      continue;
    }

    const remembered = record[file.assetId];
    if (remembered) {
      staged.push({ assetId: file.assetId, filename: file.filename, path: remembered.path });
      continue;
    }
    if (!executor.writeFileStream) {
      refuse('sandbox_unsupported');
      continue;
    }
    if (
      !file.key ||
      !options.isAllowedKey(file.key) ||
      !Number.isSafeInteger(file.byteSize) ||
      file.byteSize <= 0
    ) {
      refuse('not_in_storage');
      continue;
    }
    if (usedBytes + file.byteSize > maxStagedBytes) {
      refuse('sandbox_full');
      continue;
    }
    if (listingUnknown) {
      refuse('stream_failed');
      continue;
    }

    let source: { body: ReadableStream<Uint8Array> } | null;
    try {
      source = await openStream(file.key);
    } catch {
      refuse('stream_failed');
      continue;
    }
    if (!source) {
      refuse('not_in_storage');
      continue;
    }
    if (options.signal.aborted) {
      await source.body.cancel().catch(() => undefined);
      refuse('stream_failed');
      continue;
    }

    const name = uniqueName(sandboxFileName(file.filename, index), taken);
    const path = `${SANDBOX_WORKSPACE_ROOT}/${name}`;
    const copy = new AbortController();
    const stopCopy = () => copy.abort();
    options.signal.addEventListener('abort', stopCopy, { once: true });
    const { stream, counter } = exactByteStream(source.body, file.byteSize, copy.signal);
    let reason: StorageNotStagedReason | null = null;
    try {
      const result = await executor.writeFileStream({ path, content: stream, signal: copy.signal });
      if (!result.ok) reason = result.unavailable ? 'sandbox_unsupported' : 'stream_failed';
      else if (counter.bytes !== file.byteSize) reason = 'stream_failed';
    } catch (error) {
      reason = isUnsupportedFailure(error) ? 'sandbox_unsupported' : 'stream_failed';
    } finally {
      options.signal.removeEventListener('abort', stopCopy);
    }
    if (reason) {
      copy.abort();
      if (
        reason !== 'sandbox_unsupported' &&
        !(await removePartialCopy(executor, path, options.removeTimeoutMs))
      ) {
        taken.add(name);
        usedBytes += counter.bytes;
        record[`${DISPLACED_PREFIX}${name}`] = { path, byteSize: counter.bytes };
        await remember(executor, record);
      }
      refuse(reason);
      continue;
    }

    taken.add(name);
    usedBytes += file.byteSize;
    record[file.assetId] = { path, byteSize: file.byteSize };
    staged.push({ assetId: file.assetId, filename: file.filename, path });
    await remember(executor, record);
  }
  return { staged, notStaged };
}
