import 'server-only';

import { isMediaStorageConfigured } from '@/lib/server/media-storage';
import {
  persistGeneratedFileBytes,
  type GeneratedFileWire,
} from '@/lib/server/generated-file-persist';
import { logger } from '@/lib/logger';
import { providerApiUrl } from '@/lib/server/provider-endpoints';

/**
 * Track A — provider-native code execution: fetch the files a model created in
 * its provider's sandbox (OpenAI Code Interpreter container / Anthropic code
 * execution Files API) and persist them durably via the shared generated-file
 * persistence core, so a generated report/csv/pdf survives the ephemeral
 * container (OpenAI containers expire after ~20 min) and is servable through
 * the authenticated same-origin `/api/files/{id}` route the chat renderer
 * gates accept.
 *
 * This is the same mechanism chatgpt.com / claude.ai use: the provider runs the
 * code in their sandbox; we download the artifacts and store them ourselves.
 *
 * Managed-gateway requests only: both fetchers use the PLATFORM provider keys,
 * which are the keys that created the container/file ids on this path. BYOK
 * and Local sessions never route through this module.
 */

export interface GeneratedFileRef {
  provider: 'openai' | 'anthropic' | 'google';
  /** Known filename (OpenAI citations carry one). Anthropic file outputs do
   *  not — leave undefined and it is resolved from the Files API metadata. */
  filename?: string;
  /** OpenAI: the container the file lives in. */
  containerId?: string;
  /** OpenAI container file id / Anthropic Files API file id. */
  fileId?: string;
}

export interface PersistedGeneratedFile {
  assetId: string | null;
  /** Same-origin `/api/files/{assetId}` serve path (renderer-gate compatible). */
  url: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  /** Wire descriptor for the `x_generated_files` SSE delta. */
  wire: GeneratedFileWire;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
};

function mimeForFilename(filename: string, fallback: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? fallback;
}

const ANTHROPIC_FILES_BETA = 'files-api-2025-04-14';

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': ANTHROPIC_FILES_BETA,
  };
}

async function fetchOpenAIContainerFile(
  containerId: string,
  fileId: string,
): Promise<{ data: Buffer; contentType: string }> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const res = await fetch(
    providerApiUrl(
      'openai',
      `containers/${encodeURIComponent(containerId)}/files/${encodeURIComponent(fileId)}/content`,
    ),
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) throw new Error(`OpenAI container file fetch failed (HTTP ${res.status})`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { data: Buffer.from(await res.arrayBuffer()), contentType };
}

async function fetchAnthropicFile(fileId: string): Promise<{ data: Buffer; contentType: string }> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch(
    providerApiUrl('anthropic', `files/${encodeURIComponent(fileId)}/content`),
    { headers: anthropicHeaders(apiKey) },
  );
  if (!res.ok) throw new Error(`Anthropic file fetch failed (HTTP ${res.status})`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { data: Buffer.from(await res.arrayBuffer()), contentType };
}

/**
 * Resolve the original filename for an Anthropic Files API file id.
 * Code-execution output blocks carry only `file_id`, so the metadata endpoint
 * is the sole source of the human filename. Best-effort: falls back to the
 * file id on any failure.
 */
async function fetchAnthropicFilename(fileId: string): Promise<string> {
  try {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) return fileId;
    const res = await fetch(providerApiUrl('anthropic', `files/${encodeURIComponent(fileId)}`), {
      headers: anthropicHeaders(apiKey),
    });
    if (!res.ok) return fileId;
    const body = (await res.json()) as { filename?: unknown };
    return typeof body.filename === 'string' && body.filename.trim() ? body.filename : fileId;
  } catch {
    return fileId;
  }
}

/** Bound on visited nodes when scanning stream payloads for file refs. */
const MAX_SCAN_NODES = 5000;

/**
 * Scan an arbitrary provider stream payload for generated-file references and
 * add them to `sink` (deduped by provider file id):
 *
 *   - OpenAI Code Interpreter:   `{type:'container_file_citation', file_id, container_id, filename}`
 *   - Anthropic code execution:  `{type:'code_execution_output', file_id}`
 *
 * Pure and defensive (node-count bounded); called per stream chunk by the
 * adapter stream builder, which persists the collected refs at end of turn.
 */
export function collectGeneratedFileRefs(
  payload: unknown,
  sink: Map<string, GeneratedFileRef>,
): void {
  let visited = 0;
  const visit = (value: unknown): void => {
    if (visited++ > MAX_SCAN_NODES) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const rec = value as Record<string, unknown>;
    if (
      rec['type'] === 'container_file_citation' &&
      typeof rec['file_id'] === 'string' &&
      typeof rec['container_id'] === 'string'
    ) {
      sink.set(rec['file_id'], {
        provider: 'openai',
        fileId: rec['file_id'],
        containerId: rec['container_id'],
        filename: typeof rec['filename'] === 'string' ? rec['filename'] : undefined,
      });
      return;
    }
    if (rec['type'] === 'code_execution_output' && typeof rec['file_id'] === 'string') {
      sink.set(rec['file_id'], { provider: 'anthropic', fileId: rec['file_id'] });
      return;
    }
    Object.values(rec).forEach(visit);
  };
  visit(payload);
}

/**
 * Fetch one model-generated file from its provider sandbox and persist it.
 * Best-effort: returns null (and logs) on any failure, so a generation never
 * fails just because a single artifact couldn't be archived — callers count
 * nulls and surface an honest "file could not be retrieved" note.
 */
export async function persistGeneratedFile(params: {
  userId: string;
  ref: GeneratedFileRef;
  prompt?: string;
  model?: string;
}): Promise<PersistedGeneratedFile | null> {
  const { userId, ref, prompt, model } = params;
  if (!isMediaStorageConfigured()) return null;
  if (!ref.fileId) return null;

  try {
    let fetched: { data: Buffer; contentType: string };
    let filename = ref.filename;
    if (ref.provider === 'openai') {
      if (!ref.containerId) return null;
      fetched = await fetchOpenAIContainerFile(ref.containerId, ref.fileId);
    } else if (ref.provider === 'anthropic') {
      if (!filename) filename = await fetchAnthropicFilename(ref.fileId);
      fetched = await fetchAnthropicFile(ref.fileId);
    } else {
      // Google returns inline file bytes in the response, not via a fetch API;
      // those are handled by the caller, not here.
      return null;
    }
    filename = filename ?? ref.fileId;

    const mimeType = mimeForFilename(filename, fetched.contentType);
    const outcome = await persistGeneratedFileBytes({
      userId,
      data: fetched.data,
      mimeType,
      filename,
      provider: ref.provider,
      origin: 'code-execution',
      prompt,
      model,
      extraMetadata: { providerFileId: ref.fileId },
    });
    if (!outcome.ok) return null;

    return {
      assetId: outcome.file.uri.startsWith('/api/files/')
        ? outcome.file.uri.slice('/api/files/'.length)
        : null,
      url: outcome.file.uri,
      filename: outcome.file.file_name,
      mimeType: outcome.file.mime_type,
      byteSize: outcome.file.byte_count,
      checksumSha256: outcome.file.checksum_sha256,
      wire: outcome.file,
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), userId, provider: ref.provider },
      'Failed to persist provider-generated file; skipping',
    );
    return null;
  }
}

export interface PersistGeneratedFilesResult {
  files: PersistedGeneratedFile[];
  /** How many refs could not be fetched/persisted — surface an honest note. */
  failedCount: number;
}

/** Persist many generated files concurrently; failures are counted, not silent. */
export async function persistGeneratedFiles(params: {
  userId: string;
  refs: GeneratedFileRef[];
  prompt?: string;
  model?: string;
}): Promise<PersistGeneratedFilesResult> {
  const results = await Promise.all(
    params.refs.map((ref) =>
      persistGeneratedFile({
        userId: params.userId,
        ref,
        prompt: params.prompt,
        model: params.model,
      }),
    ),
  );
  const files = results.filter((r): r is PersistedGeneratedFile => r !== null);
  return { files, failedCount: results.length - files.length };
}
