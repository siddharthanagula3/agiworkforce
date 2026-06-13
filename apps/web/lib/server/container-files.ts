import 'server-only';

import { storeMedia, isMediaStorageConfigured } from '@/lib/server/media-storage';
import { insertMediaAsset, type MediaKind } from '@/lib/server/media-assets';
import { logger } from '@/lib/logger';

/**
 * Track A — provider-native code execution: fetch the files a model created in
 * its provider's sandbox (OpenAI Code Interpreter container / Anthropic code
 * execution Files API) and persist them durably via the media layer, so a
 * generated report/csv/pdf survives the ephemeral container (OpenAI containers
 * expire after ~20 min) and shows up in the user-scoped cross-surface Library.
 *
 * This is the same mechanism chatgpt.com / claude.ai use: the provider runs the
 * code in their sandbox; we download the artifacts and store them ourselves.
 */

export interface GeneratedFileRef {
  provider: 'openai' | 'anthropic' | 'google';
  filename: string;
  /** OpenAI: the container the file lives in. */
  containerId?: string;
  /** OpenAI container file id / Anthropic Files API file id. */
  fileId?: string;
}

export interface PersistedGeneratedFile {
  assetId: string | null;
  url: string;
  filename: string;
  mimeType: string;
  byteSize: number;
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

/** Classify a file by mime so the Library can group it (image vs document). */
function kindForMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

async function fetchOpenAIContainerFile(
  containerId: string,
  fileId: string,
): Promise<{ data: Buffer; contentType: string }> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const res = await fetch(
    `https://api.openai.com/v1/containers/${containerId}/files/${fileId}/content`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) throw new Error(`OpenAI container file fetch failed (HTTP ${res.status})`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { data: Buffer.from(await res.arrayBuffer()), contentType };
}

async function fetchAnthropicFile(fileId: string): Promise<{ data: Buffer; contentType: string }> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch(`https://api.anthropic.com/v1/files/${fileId}/content`, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
    },
  });
  if (!res.ok) throw new Error(`Anthropic file fetch failed (HTTP ${res.status})`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { data: Buffer.from(await res.arrayBuffer()), contentType };
}

/**
 * Fetch one model-generated file from its provider sandbox and persist it.
 * Best-effort: returns null (and logs) on any failure, so a generation never
 * fails just because a single artifact couldn't be archived.
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
    if (ref.provider === 'openai') {
      if (!ref.containerId) return null;
      fetched = await fetchOpenAIContainerFile(ref.containerId, ref.fileId);
    } else if (ref.provider === 'anthropic') {
      fetched = await fetchAnthropicFile(ref.fileId);
    } else {
      // Google returns inline file bytes in the response, not via a fetch API;
      // those are handled by the caller, not here.
      return null;
    }

    const mimeType = mimeForFilename(ref.filename, fetched.contentType);
    const kind = kindForMime(mimeType);
    const stored = await storeMedia({
      userId,
      kind,
      data: fetched.data,
      contentType: mimeType,
    });
    const assetId = await insertMediaAsset({
      userId,
      kind,
      mimeType,
      byteSize: stored.byteSize,
      storageUrl: stored.url,
      storagePathname: stored.pathname,
      prompt,
      provider: ref.provider,
      model,
      sourceSurface: 'web',
      metadata: { filename: ref.filename, origin: 'code-execution' },
    });

    return {
      assetId,
      url: stored.url,
      filename: ref.filename,
      mimeType,
      byteSize: stored.byteSize,
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), userId, provider: ref.provider },
      'Failed to persist provider-generated file; skipping',
    );
    return null;
  }
}

/** Persist many generated files concurrently; nulls (failures) are dropped. */
export async function persistGeneratedFiles(params: {
  userId: string;
  refs: GeneratedFileRef[];
  prompt?: string;
  model?: string;
}): Promise<PersistedGeneratedFile[]> {
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
  return results.filter((r): r is PersistedGeneratedFile => r !== null);
}
