import 'server-only';

import { createHash } from 'crypto';
import type { GeneratedFileSurface } from '@agiworkforce/cloud-contracts';
import {
  deleteStoredMedia,
  isGeneratedMediaStorageConfigured,
  storeMedia,
} from '@/lib/server/media-storage';
import { insertMediaAsset, type MediaKind } from '@/lib/server/media-assets';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { logger } from '@/lib/logger';

export const MAX_GENERATED_FILE_BYTES = 20 * 1024 * 1024;

export interface GeneratedFileWire {
  id: string;
  file_name: string;
  mime_type: string;
  uri: string;
  byte_count: number;
  kind: string;
  checksum_sha256: string;
  surface: GeneratedFileSurface;
  previewable: boolean;
}

const _generatedFileWireContractCheck: (
  file: GeneratedFileWire,
) => import('@agiworkforce/cloud-contracts').GeneratedFileWire = (file) => file;
void _generatedFileWireContractCheck;

export type PersistGeneratedFileOutcome =
  | { ok: true; file: GeneratedFileWire }
  | { ok: false; reason: 'not_configured' | 'too_large' | 'storage_error' };

export function generatedFileKind(fileName: string, mime: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'json', 'html'].includes(ext)) return ext;
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (mime.startsWith('image/')) return 'image';
  if (ext === 'zip' || ext === 'tar' || ext === 'gz') return 'archive';
  return 'other';
}

export interface GeneratedFileClassification {
  surface: GeneratedFileSurface;
  previewable: boolean;
}

const ARTIFACT_EXTENSIONS: ReadonlySet<string> = new Set([
  'html',
  'htm',
  'md',
  'markdown',
  'mmd',
  'mermaid',
  'json',
  'txt',
  'tex',
  'xml',
  'yaml',
  'yml',
  'toml',
  'py',
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'sh',
  'bash',
  'sql',
  'rb',
  'java',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'go',
  'rs',
  'php',
]);

const PREVIEWABLE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'tsv',
]);

export function classifyGeneratedFile(fileName: string, mime: string): GeneratedFileClassification {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const mimeLower = mime.toLowerCase();
  if (ext === 'svg' || mimeLower.startsWith('image/svg')) {
    return { surface: 'artifact', previewable: true };
  }
  if (ARTIFACT_EXTENSIONS.has(ext)) return { surface: 'artifact', previewable: true };
  if (PREVIEWABLE_FILE_EXTENSIONS.has(ext)) return { surface: 'file', previewable: true };
  if (mimeLower.startsWith('image/')) return { surface: 'file', previewable: true };
  if (mimeLower === 'text/csv' || mimeLower === 'text/tab-separated-values') {
    return { surface: 'file', previewable: true };
  }
  if (mimeLower === 'application/pdf') return { surface: 'file', previewable: true };
  if (
    mimeLower.startsWith('text/') ||
    mimeLower === 'application/json' ||
    mimeLower === 'application/xml'
  ) {
    return { surface: 'artifact', previewable: true };
  }
  return { surface: 'file', previewable: false };
}

function mediaKindFor(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export async function persistGeneratedFileBytes(
  params: {
    userId: string;
    organizationId: string | null;
    data: Buffer;
    mimeType: string;
    filename: string;
    provider: string;
    origin: string;
    model?: string;
    prompt?: string;
    conversationId?: string;
    extraMetadata?: Record<string, unknown>;
  },
  callerDb?: Parameters<typeof insertMediaAsset>[1],
): Promise<PersistGeneratedFileOutcome> {
  const { userId, organizationId, data, mimeType, filename, provider, origin, model, prompt } =
    params;
  // Tool output is persisted from the loop and from the sandbox file sweep,
  // neither of which always carries the request connection, so an absent one is
  // rebuilt as the owner's own scope rather than left unbound.
  const db = callerDb ?? createClaimedUserScopedDb(getNeonDb(), { userId, organizationId });

  if (!isGeneratedMediaStorageConfigured()) return { ok: false, reason: 'not_configured' };
  if (data.byteLength > MAX_GENERATED_FILE_BYTES) {
    logger.warn(
      { filename, size: data.byteLength, cap: MAX_GENERATED_FILE_BYTES, provider },
      'Generated file exceeds persistence cap; skipping',
    );
    return { ok: false, reason: 'too_large' };
  }

  let storedPathname: string | null = null;
  try {
    const kind = mediaKindFor(mimeType);
    const classification = classifyGeneratedFile(filename, mimeType);
    const checksum = createHash('sha256').update(data).digest('hex');
    const stored = await storeMedia({ userId, kind, data, contentType: mimeType });
    storedPathname = stored.pathname;
    const assetId = await insertMediaAsset(
      {
        userId,
        organizationId,
        kind,
        mimeType,
        byteSize: stored.byteSize,
        storageUrl: stored.url,
        storagePathname: stored.pathname,
        prompt,
        provider,
        model,
        sourceSurface: 'web',
        ...(params.conversationId ? { conversationId: params.conversationId } : {}),
        metadata: {
          filename,
          origin,
          checksumSha256: checksum,
          surface: classification.surface,
          previewable: classification.previewable,
          ...(params.extraMetadata ?? {}),
        },
      },
      db,
    );
    if (!assetId) {
      await deleteStoredMedia(stored.pathname);
      storedPathname = null;
      logger.error(
        { filename, provider, userId, storagePathname: stored.pathname },
        'Generated file catalog was unavailable; removed uncataloged private bytes',
      );
      return { ok: false, reason: 'storage_error' };
    }

    return {
      ok: true,
      file: {
        id: assetId,
        file_name: filename,
        mime_type: mimeType,
        uri: `/api/files/${assetId}`,
        byte_count: stored.byteSize,
        kind: generatedFileKind(filename, mimeType),
        checksum_sha256: checksum,
        surface: classification.surface,
        previewable: classification.previewable,
      },
    };
  } catch (err) {
    if (storedPathname) {
      try {
        await deleteStoredMedia(storedPathname);
      } catch (cleanupError) {
        logger.error(
          { cleanupError, filename, provider, userId, storagePathname: storedPathname },
          'Failed to remove uncataloged generated-file bytes',
        );
      }
    }
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), filename, provider, userId },
      'Failed to persist generated file bytes; skipping',
    );
    return { ok: false, reason: 'storage_error' };
  }
}
