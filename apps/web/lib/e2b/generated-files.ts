/**
 * E2B generated-file harvest — the bridge from "the model wrote a file in the
 * sandbox" to "the user sees a renderable file card in chat".
 *
 * The execution loop (tool-loop.ts) snapshots the sandbox workspace when the
 * E2B executor is first resolved, and at turn end diffs a fresh listing against
 * that baseline. New/changed files are read out of the sandbox and persisted
 * through the SHARED generated-file persistence core
 * (lib/server/generated-file-persist.ts — same seam OpenAI container files and
 * Anthropic code-execution files use), then emitted to the client as an
 * `x_generated_files` SSE delta. The wire `uri` is the authenticated
 * same-origin `/api/files/{id}` route, which the web renderer gates (PDF
 * viewer, inline images, spreadsheet fetch) accept — the sandbox itself is
 * ephemeral and the raw R2 URL is cross-origin.
 *
 * Best-effort by design: every failure degrades to "no file card" plus an
 * honest note from the caller, never to a broken turn. Caps bound the work:
 * max files per turn, max bytes per file.
 */
import 'server-only';

import { logger } from '@/lib/logger';
import {
  persistGeneratedFileBytes,
  MAX_GENERATED_FILE_BYTES,
  type GeneratedFileWire,
} from '@/lib/server/generated-file-persist';
import { isMediaStorageConfigured } from '@/lib/server/media-storage';
import type { E2BExecutor, SandboxFileEntry } from './types';

export type { GeneratedFileWire };

/** Workspace root the sandbox code contexts run in (E2B default home). */
const WORKSPACE_ROOT = '/home/user';
/** Directory-recursion depth bound for the workspace listing. */
const MAX_LIST_DEPTH = 3;
/** Max files harvested per turn — beyond this, later files are dropped (logged). */
const MAX_FILES_PER_TURN = 8;
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

export type SandboxSnapshot = Map<string, number>;

function mimeFor(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
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

export interface HarvestResult {
  files: GeneratedFileWire[];
  /** Count of new/changed files that could NOT be persisted (caller surfaces an honest note). */
  failedCount: number;
}

/**
 * Diff the workspace against `baseline`, persist new/changed files durably,
 * and return their wire descriptors plus how many files failed to persist.
 * Best-effort: failures skip that file but are COUNTED so the caller can
 * surface an honest "file could not be retrieved" note instead of silence.
 */
export async function harvestGeneratedFiles(params: {
  executor: E2BExecutor;
  baseline: SandboxSnapshot;
  userId: string;
  model?: string;
  prompt?: string;
  /** Conversation provenance for the Library (migration 0081). */
  conversationId?: string;
}): Promise<HarvestResult> {
  const { executor, baseline, userId, model, prompt, conversationId } = params;
  const canPersist = Boolean(executor.readFileBytes) && isMediaStorageConfigured();

  let files: SandboxFileEntry[];
  try {
    files = await listWorkspace(executor);
  } catch (err) {
    logger.warn({ err }, '[e2b] harvest listing failed');
    return { files: [], failedCount: 0 };
  }

  const changed = files.filter((f) => baseline.get(f.path) !== f.byteSize);
  if (changed.length === 0) return { files: [], failedCount: 0 };
  if (!canPersist) {
    // The model DID write files the user was promised; silence here would let the
    // turn claim success with nothing delivered. Count them so the caller emits
    // its honest "could not be retrieved" note.
    logger.warn(
      { changed: changed.length, storageConfigured: isMediaStorageConfigured() },
      '[e2b] generated files present but persistence unavailable; surfacing honest failure note',
    );
    return { files: [], failedCount: changed.length };
  }
  if (changed.length > MAX_FILES_PER_TURN) {
    logger.warn(
      { total: changed.length, kept: MAX_FILES_PER_TURN },
      '[e2b] harvest capped: dropping extra generated files',
    );
  }

  const out: GeneratedFileWire[] = [];
  let failedCount = 0;
  for (const f of changed.slice(0, MAX_FILES_PER_TURN)) {
    if (f.byteSize > MAX_GENERATED_FILE_BYTES) {
      logger.warn({ path: f.path, size: f.byteSize }, '[e2b] harvest skipped: file too large');
      failedCount += 1;
      continue;
    }
    try {
      const bytes = await executor.readFileBytes!(f.path);
      if (!bytes) {
        failedCount += 1;
        continue;
      }
      const outcome = await persistGeneratedFileBytes({
        userId,
        data: Buffer.from(bytes),
        mimeType: mimeFor(f.name),
        filename: f.name,
        provider: 'e2b',
        origin: 'e2b-execution',
        model,
        prompt,
        ...(conversationId ? { conversationId } : {}),
        extraMetadata: { sandboxPath: f.path },
      });
      if (outcome.ok) {
        out.push(outcome.file);
      } else {
        failedCount += 1;
      }
    } catch (err) {
      logger.warn({ err, path: f.path }, '[e2b] harvest failed for file; skipping');
      failedCount += 1;
    }
  }
  return { files: out, failedCount };
}
