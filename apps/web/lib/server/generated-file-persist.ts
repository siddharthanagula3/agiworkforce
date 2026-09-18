import 'server-only';

import { createHash } from 'crypto';
import type { GeneratedFileSurface } from '@agiworkforce/cloud-contracts';
import { resolveGeneratedFileKind, type FileDerivation } from '@agiworkforce/types';
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
  | { ok: true; file: GeneratedFileWire; version: number; parentFileId: string | null }
  | { ok: false; reason: 'not_configured' | 'too_large' | 'storage_error' };

type MediaAssetDb = Parameters<typeof insertMediaAsset>[1];

/**
 * The file this one was made out of. A `parentFileId` is a different file the
 * bytes derive from (an upload turned into an export); `supersedesFileId` is an
 * earlier revision of the same file, which is a version rather than a lineage
 * edge and is why the two cannot be one field.
 */
export interface GeneratedFileProvenance {
  parentFileId?: string;
  derivation?: FileDerivation;
  supersedesFileId?: string;
  generatedByTurnId?: string;
}

async function recordFileLineage(
  db: MediaAssetDb,
  input: {
    userId: string;
    organizationId: string | null;
    childFileId: string;
    parentFileId: string;
    derivation: FileDerivation;
    generatedByTurnId: string | null;
    conversationId: string | null;
  },
): Promise<void> {
  try {
    await db.query(
      `insert into public.file_lineage
         (user_id, organization_id, child_file_id, parent_file_id, derivation,
          generated_by_turn_id, conversation_id)
       values ($1, $2::uuid, $3, $4, $5, $6, $7::uuid)
       on conflict (child_file_id, parent_file_id, derivation) do nothing`,
      [
        input.userId,
        input.organizationId,
        input.childFileId,
        input.parentFileId,
        input.derivation,
        input.generatedByTurnId,
        input.conversationId,
      ],
    );
  } catch (err) {
    // The bytes are already stored and usable; only the provenance edge is lost,
    // so this is reported rather than rolled back.
    logger.error(
      { err: err instanceof Error ? err.message : String(err), ...input },
      'Failed to record file lineage for a generated file',
    );
  }
}

async function recordFileRevision(
  db: MediaAssetDb,
  input: { userId: string; assetId: string; supersedesFileId: string },
): Promise<number> {
  try {
    const rows = await db.query<{ version: number | string }>(
      `update public.media_assets as revised
          set version = coalesce(parent.version, 1) + 1,
              parent_version_id = parent.id
         from public.media_assets as parent
        where revised.id = $1::uuid
          and parent.id = $2::uuid
          and revised.user_id = $3
          and parent.user_id = $3
        returning revised.version`,
      [input.assetId, input.supersedesFileId, input.userId],
    );
    const version = Number(rows[0]?.version ?? 1);
    return Number.isFinite(version) && version > 0 ? Math.floor(version) : 1;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), ...input },
      'Failed to record a generated file revision',
    );
    return 1;
  }
}

export function generatedFileKind(fileName: string, mime: string): string {
  return resolveGeneratedFileKind(fileName, mime);
}

/**
 * `presentation`, not `surface`. Everywhere else in this repository a surface is
 * a client, web, desktop, mobile, cli, vscode or chrome, and `sourceSurface`
 * five lines below carries exactly that meaning. This value answers a different
 * question, whether the file belongs in the artifact panel or the file list, and
 * naming both the same word put two vocabularies in one object literal.
 *
 * The wire field and the stored metadata key stay `surface`: desktop, mobile and
 * every already-catalogued row read that name, so renaming it would be a
 * cross-surface break for a naming fix. The two are mapped at the boundary
 * below, which is the only place the old word appears.
 */
export interface GeneratedFileClassification {
  presentation: GeneratedFileSurface;
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
    return { presentation: 'artifact', previewable: true };
  }
  if (ARTIFACT_EXTENSIONS.has(ext)) return { presentation: 'artifact', previewable: true };
  if (PREVIEWABLE_FILE_EXTENSIONS.has(ext)) return { presentation: 'file', previewable: true };
  if (mimeLower.startsWith('image/')) return { presentation: 'file', previewable: true };
  if (mimeLower === 'text/csv' || mimeLower === 'text/tab-separated-values') {
    return { presentation: 'file', previewable: true };
  }
  if (mimeLower === 'application/pdf') return { presentation: 'file', previewable: true };
  if (
    mimeLower.startsWith('text/') ||
    mimeLower === 'application/json' ||
    mimeLower === 'application/xml'
  ) {
    return { presentation: 'artifact', previewable: true };
  }
  return { presentation: 'file', previewable: false };
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
    provenance?: GeneratedFileProvenance;
  },
  callerDb?: MediaAssetDb,
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
          surface: classification.presentation,
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

    const provenance = params.provenance ?? {};
    const version = provenance.supersedesFileId
      ? await recordFileRevision(db, {
          userId,
          assetId,
          supersedesFileId: provenance.supersedesFileId,
        })
      : 1;

    if (provenance.parentFileId) {
      await recordFileLineage(db, {
        userId,
        organizationId,
        childFileId: assetId,
        parentFileId: provenance.parentFileId,
        derivation: provenance.derivation ?? 'export',
        generatedByTurnId: provenance.generatedByTurnId ?? null,
        conversationId: params.conversationId ?? null,
      });
    }

    return {
      ok: true,
      version,
      parentFileId: provenance.parentFileId ?? null,
      file: {
        id: assetId,
        file_name: filename,
        mime_type: mimeType,
        uri: `/api/files/${assetId}`,
        byte_count: stored.byteSize,
        kind: generatedFileKind(filename, mimeType),
        checksum_sha256: checksum,
        surface: classification.presentation,
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
