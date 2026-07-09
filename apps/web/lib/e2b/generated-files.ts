/**
 * E2B generated-file harvest — the bridge from "the model wrote a file in the
 * sandbox" to "the user sees a downloadable file card in chat".
 *
 * The execution loop (tool-loop.ts) snapshots the sandbox workspace when the
 * E2B executor is first resolved, and at turn end diffs a fresh listing against
 * that baseline. New/changed files are read out of the sandbox, persisted
 * durably through the media layer (R2 via storeMedia + media_assets row, same
 * mechanism image-gen and provider-container files use), and emitted to the
 * client as an `x_generated_files` SSE delta so surfaces can render a file
 * card with a real download URL — the sandbox itself is ephemeral.
 *
 * Best-effort by design: every failure degrades to "no file card", never to a
 * broken turn. Caps bound the work: max files per turn, max bytes per file.
 */
import 'server-only';

import { logger } from '@/lib/logger';
import { storeMedia, isMediaStorageConfigured } from '@/lib/server/media-storage';
import { insertMediaAsset, type MediaKind } from '@/lib/server/media-assets';
import type { E2BExecutor, SandboxFileEntry } from './types';

/** Workspace root the sandbox code contexts run in (E2B default home). */
const WORKSPACE_ROOT = '/home/user';
/** Directory-recursion depth bound for the workspace listing. */
const MAX_LIST_DEPTH = 3;
/** Max files harvested per turn — beyond this, later files are dropped (logged). */
const MAX_FILES_PER_TURN = 8;
/** Max bytes per harvested file. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Never harvest these (runtime noise, hidden files, package dirs). */
const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '__pycache__',
  '.cache',
  '.config',
  '.local',
  '.ipython',
  '.npm',
]);

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  py: 'text/x-python',
  js: 'text/javascript',
  ts: 'text/typescript',
};

/** Wire shape of one harvested file in the `x_generated_files` SSE delta. */
export interface GeneratedFileWire {
  id: string;
  file_name: string;
  mime_type: string;
  /** Durable download URL (media storage), NOT a sandbox path. */
  uri: string;
  byte_count: number;
  /** Coarse kind for client icons: pdf | docx | xlsx | pptx | csv | json | markdown | html | image | archive | other */
  kind: string;
}

export type SandboxSnapshot = Map<string, number>;

function mimeFor(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

function kindFor(fileName: string, mime: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'json', 'html'].includes(ext)) return ext;
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (mime.startsWith('image/')) return 'image';
  if (ext === 'zip' || ext === 'tar' || ext === 'gz') return 'archive';
  return 'other';
}

function mediaKindFor(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

/** Recursively list workspace files (bounded depth, ignore dirs skipped). */
async function listWorkspace(executor: E2BExecutor): Promise<SandboxFileEntry[]> {
  if (!executor.listFiles) return [];
  const out: SandboxFileEntry[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_LIST_DEPTH) return;
    const entries = await executor.listFiles!(dir);
    if (!entries) return;
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.isDir) {
        if (!IGNORED_DIR_NAMES.has(e.name)) await walk(e.path, depth + 1);
      } else {
        out.push(e);
      }
    }
  }
  await walk(WORKSPACE_ROOT, 0);
  return out;
}

/**
 * Snapshot the workspace (path → size) BEFORE any execution tool runs this
 * turn, so files that already existed (previous turns on a resumed sandbox)
 * are not re-emitted. Empty map on failure — worst case a pre-existing file
 * is re-harvested, which the client UPSERTs by name harmlessly.
 */
export async function snapshotSandboxFiles(executor: E2BExecutor): Promise<SandboxSnapshot> {
  const snapshot: SandboxSnapshot = new Map();
  try {
    for (const f of await listWorkspace(executor)) snapshot.set(f.path, f.byteSize);
  } catch (err) {
    logger.warn({ err }, '[e2b] baseline snapshot failed; proceeding with empty baseline');
  }
  return snapshot;
}

/**
 * Diff the workspace against `baseline`, persist new/changed files durably,
 * and return their wire descriptors. Best-effort: failures skip that file.
 */
export async function harvestGeneratedFiles(params: {
  executor: E2BExecutor;
  baseline: SandboxSnapshot;
  userId: string;
  model?: string;
  prompt?: string;
}): Promise<GeneratedFileWire[]> {
  const { executor, baseline, userId, model, prompt } = params;
  if (!executor.readFileBytes || !isMediaStorageConfigured()) return [];

  let files: SandboxFileEntry[];
  try {
    files = await listWorkspace(executor);
  } catch (err) {
    logger.warn({ err }, '[e2b] harvest listing failed');
    return [];
  }

  const changed = files.filter((f) => baseline.get(f.path) !== f.byteSize);
  if (changed.length === 0) return [];
  if (changed.length > MAX_FILES_PER_TURN) {
    logger.warn(
      { total: changed.length, kept: MAX_FILES_PER_TURN },
      '[e2b] harvest capped: dropping extra generated files',
    );
  }

  const out: GeneratedFileWire[] = [];
  for (const f of changed.slice(0, MAX_FILES_PER_TURN)) {
    if (f.byteSize > MAX_FILE_BYTES) {
      logger.warn({ path: f.path, size: f.byteSize }, '[e2b] harvest skipped: file too large');
      continue;
    }
    try {
      const bytes = await executor.readFileBytes(f.path);
      if (!bytes) continue;
      const mimeType = mimeFor(f.name);
      const stored = await storeMedia({
        userId,
        kind: mediaKindFor(mimeType),
        data: Buffer.from(bytes),
        contentType: mimeType,
      });
      const assetId = await insertMediaAsset({
        userId,
        kind: mediaKindFor(mimeType),
        mimeType,
        byteSize: stored.byteSize,
        storageUrl: stored.url,
        storagePathname: stored.pathname,
        prompt,
        provider: 'e2b',
        model,
        sourceSurface: 'web',
        metadata: { filename: f.name, origin: 'e2b-execution', sandboxPath: f.path },
      });
      out.push({
        id: assetId ?? crypto.randomUUID(),
        file_name: f.name,
        mime_type: mimeType,
        uri: stored.url,
        byte_count: stored.byteSize,
        kind: kindFor(f.name, mimeType),
      });
    } catch (err) {
      logger.warn({ err, path: f.path }, '[e2b] harvest failed for file; skipping');
    }
  }
  return out;
}
