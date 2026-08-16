import 'server-only';

import { logger } from '@/lib/logger';
import {
  persistGeneratedFileBytes,
  MAX_GENERATED_FILE_BYTES,
  type GeneratedFileWire,
} from '@/lib/server/generated-file-persist';
import { isGeneratedMediaStorageConfigured } from '@/lib/server/media-storage';
import type { E2BExecutor, SandboxFileEntry } from './types';

export type { GeneratedFileWire };

const WORKSPACE_ROOT = '/home/user';
const MAX_LIST_DEPTH = 3;
const MAX_FILES_PER_TURN = 8;
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
  failedCount: number;
}

export async function harvestGeneratedFiles(params: {
  executor: E2BExecutor;
  baseline: SandboxSnapshot;
  userId: string;
  organizationId: string | null;
  model?: string;
  prompt?: string;
  conversationId?: string;
}): Promise<HarvestResult> {
  const { executor, baseline, userId, organizationId, model, prompt, conversationId } = params;
  const canPersist = Boolean(executor.readFileBytes) && isGeneratedMediaStorageConfigured();

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
    logger.warn(
      { changed: changed.length, storageConfigured: isGeneratedMediaStorageConfigured() },
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
        organizationId,
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
