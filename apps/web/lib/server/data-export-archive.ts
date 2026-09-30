import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  supportsMultipartUploads,
  type MultipartObjectStore,
  type MultipartUploadHandle,
  type UploadedPart,
} from '@agiworkforce/object-storage';
import {
  DATA_EXPORT_DOWNLOAD_HOURS,
  managedCloudDataExportArchivePath,
  type DataExportArchive,
} from '@agiworkforce/cloud-contracts';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { JobHandlerContext } from '@/lib/jobs/job-drain';
import { PermanentJobError, enqueueJob } from '@/lib/jobs/job-service';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getIdentityUser } from '@/lib/server/identity';
import { extForMime, streamStoredMedia } from '@/lib/server/media-storage';
import {
  deletePrivateObject,
  getPrivateObjectStream,
  isPrivateObjectStorageConfigured,
  objectKeyFromStorageUri,
  putPrivateObject,
} from '@/lib/server/object-storage';
import { getObjectStore, objectStorageConfig } from '@/lib/server/object-storage-runtime';
import { getProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import {
  STORED_ZIP_MAX_ENTRIES,
  STORED_ZIP_TRAILER_BYTES,
  StoredZipWriter,
  storedZipEntryOverhead,
} from '@/lib/server/stored-zip-writer';
import { sendDataExportReadyEmail } from '@/lib/services/notification-email-service';

const BUILD_ARCHIVE_JOB = 'data-export.build-archive';
const ARCHIVE_PART_BYTES = 8 * 1024 * 1024;
const VOLUME_TARGET_BYTES = 1024 ** 3;
const VOLUME_WORK_MS = 150_000;
const FILE_PAGE_SIZE = 100;
const HOUR_MS = 60 * 60 * 1000;
export const DATA_EXPORT_DOWNLOAD_URL_TTL_SECONDS = 300;
const MAX_ENTRY_NAME_CHARS = 150;
const EXPORT_JSON_ENTRY = 'export.json';
const UNAVAILABLE_FILES_ENTRY = 'unavailable-files.json';

type ArchivePhase = 'library' | 'projects';

interface ArchiveCursor {
  workspace: number;
  phase: ArchivePhase;
  afterId: string | null;
}

interface StoredVolume {
  volume: number;
  key: string;
  byteCount: number;
  fileCount: number;
}

interface BuildArchivePayload {
  exportId: string;
  requestedAt: string;
  origin: string;
  workspaces: (string | null)[];
  volume: number;
  cursor: ArchiveCursor | null;
  volumes: StoredVolume[];
}

interface ArchiveFile {
  id: string;
  entryName: string;
  byteCount: number | null;
  modifiedAt: Date;
  read: () => Promise<AsyncIterable<Uint8Array> | null>;
}

interface ArchiveStore {
  store: MultipartObjectStore;
  bucket: string;
}

interface DataExportJobRow {
  status: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
}

export interface DataExportVolumeDownload {
  key: string;
  fileName: string;
}

function archiveStore(): ArchiveStore | null {
  const bucket = objectStorageConfig().privateBucket;
  if (!isPrivateObjectStorageConfigured() || !bucket) return null;
  const store = getObjectStore();
  return supportsMultipartUploads(store) ? { store, bucket } : null;
}

function exportPrefix(userId: string, exportId: string): string {
  return `exports/${userId}/${exportId}/`;
}

function exportJsonKey(userId: string, exportId: string): string {
  return `${exportPrefix(userId, exportId)}${EXPORT_JSON_ENTRY}`;
}

function volumeKey(userId: string, exportId: string, volume: number): string {
  return `${exportPrefix(userId, exportId)}agi-export-part-${volume}.zip`;
}

function safeEntryName(value: string, fallback: string): string {
  const cleaned = Array.from(value.normalize('NFC'))
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f || '/\\<>:"|?*'.includes(character) ? '_' : character;
    })
    .join('')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, MAX_ENTRY_NAME_CHARS);
  return cleaned || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value) {
    throw new PermanentJobError(`Data export payload is missing ${key}`);
  }
  return value;
}

function readCursor(value: unknown): ArchiveCursor | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value['workspace'] !== 'number' ||
    (value['phase'] !== 'library' && value['phase'] !== 'projects') ||
    (value['afterId'] !== null && typeof value['afterId'] !== 'string')
  ) {
    throw new PermanentJobError('Data export payload carries a malformed cursor');
  }
  return {
    workspace: value['workspace'],
    phase: value['phase'],
    afterId: value['afterId'],
  };
}

function readVolumes(value: unknown): StoredVolume[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    isRecord(entry) &&
    typeof entry['volume'] === 'number' &&
    typeof entry['key'] === 'string' &&
    typeof entry['byteCount'] === 'number' &&
    typeof entry['fileCount'] === 'number'
      ? [
          {
            volume: entry['volume'],
            key: entry['key'],
            byteCount: entry['byteCount'],
            fileCount: entry['fileCount'],
          },
        ]
      : [],
  );
}

function readBuildPayload(payload: Record<string, unknown>): BuildArchivePayload {
  const workspaces = payload['workspaces'];
  const volume = payload['volume'];
  if (
    !Array.isArray(workspaces) ||
    !workspaces.every((workspace) => workspace === null || typeof workspace === 'string') ||
    typeof volume !== 'number' ||
    !Number.isSafeInteger(volume) ||
    volume < 1
  ) {
    throw new PermanentJobError('Data export payload is malformed');
  }
  return {
    exportId: requireString(payload, 'exportId'),
    requestedAt: requireString(payload, 'requestedAt'),
    origin: requireString(payload, 'origin'),
    workspaces: workspaces as (string | null)[],
    volume,
    cursor: readCursor(payload['cursor'] ?? null),
    volumes: readVolumes(payload['volumes']),
  };
}

function requireAccount(context: JobHandlerContext): string {
  if (!context.job.userId) throw new PermanentJobError('This job carries no account to act for');
  return context.job.userId;
}

async function* bytesOf(data: Uint8Array): AsyncIterable<Uint8Array> {
  yield data;
}

async function* streamChunks(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        return;
      }
      yield value;
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function libraryFile(row: Record<string, unknown>): ArchiveFile {
  const id = String(row['id']);
  const mimeType = String(row['mime_type'] ?? 'application/octet-stream');
  const metadata = isRecord(row['metadata']) ? row['metadata'] : {};
  const storedName = typeof metadata['filename'] === 'string' ? metadata['filename'] : '';
  const fallback = `${String(row['kind'] ?? 'file')}.${extForMime(mimeType)}`;
  const pathname = String(row['storage_pathname']);
  return {
    id,
    entryName: `files/library/${id}-${safeEntryName(storedName, fallback)}`,
    byteCount: row['byte_size'] == null ? null : Number(row['byte_size']),
    modifiedAt: new Date(String(row['created_at'])),
    read: async () => {
      const stored = await streamStoredMedia(pathname);
      return stored ? streamChunks(stored.body) : null;
    },
  };
}

function projectFile(row: Record<string, unknown>): ArchiveFile {
  const id = String(row['id']);
  const projectId = String(row['project_id']);
  const storageUri = String(row['storage_uri'] ?? '');
  return {
    id,
    entryName: `files/projects/${projectId}/${id}-${safeEntryName(String(row['file_name'] ?? ''), 'file')}`,
    byteCount: Number(row['byte_count'] ?? 0),
    modifiedAt: new Date(String(row['added_at'])),
    read: async () => {
      const key = objectKeyFromStorageUri(storageUri);
      if (!key) return null;
      const object = await getProjectKnowledgeObject(key, MAX_ATTACHMENT_BYTES);
      return object ? bytesOf(object.data) : null;
    },
  };
}

async function archiveFilesAfter(
  serviceDb: DatabaseAdapter,
  userId: string,
  workspaces: readonly (string | null)[],
  cursor: ArchiveCursor,
): Promise<ArchiveFile[]> {
  const organizationId = workspaces[cursor.workspace] ?? null;
  const db = createClaimedUserScopedDb(serviceDb, { userId, organizationId });
  const values = [userId, organizationId, cursor.afterId, FILE_PAGE_SIZE];
  if (cursor.phase === 'library') {
    const rows = await db.query<Record<string, unknown>>(
      `select id, kind, mime_type, byte_size, storage_pathname, metadata, created_at
         from public.media_assets
        where user_id = $1
          and organization_id is not distinct from $2::uuid
          and deleted_at is null
          and not temporary_chat
          and storage_pathname is not null
          and ($3::uuid is null or id > $3::uuid)
        order by id
        limit $4`,
      values,
    );
    return rows.map(libraryFile);
  }
  const rows = await db.query<Record<string, unknown>>(
    `select f.id, f.project_id, f.file_name, f.byte_count, f.storage_uri, f.added_at
       from public.project_knowledge_files f
       join public.user_projects p on p.id = f.project_id
        and p.deleted_at is null
      where p.user_id = $1
        and p.organization_id is not distinct from $2::uuid
        and f.deleted_at is null
        and f.superseded_at is null
        and f.storage_uri is not null
        and ($3::uuid is null or f.id > $3::uuid)
      order by f.id
      limit $4`,
    values,
  );
  return rows.map(projectFile);
}

function nextSection(cursor: ArchiveCursor, workspaceCount: number): ArchiveCursor | null {
  if (cursor.phase === 'library') {
    return { workspace: cursor.workspace, phase: 'projects', afterId: null };
  }
  if (cursor.workspace + 1 >= workspaceCount) return null;
  return { workspace: cursor.workspace + 1, phase: 'library', afterId: null };
}

class MultipartSink {
  private readonly buffer = Buffer.allocUnsafe(ARCHIVE_PART_BYTES);
  private filled = 0;
  private readonly parts: UploadedPart[] = [];

  constructor(
    private readonly store: MultipartObjectStore,
    private readonly handle: MultipartUploadHandle,
  ) {}

  async write(chunk: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < chunk.byteLength) {
      const taken = Math.min(ARCHIVE_PART_BYTES - this.filled, chunk.byteLength - offset);
      this.buffer.set(chunk.subarray(offset, offset + taken), this.filled);
      this.filled += taken;
      offset += taken;
      if (this.filled === ARCHIVE_PART_BYTES) await this.flush();
    }
  }

  private async flush(): Promise<void> {
    const body = Buffer.from(this.buffer.subarray(0, this.filled));
    this.parts.push(
      await this.store.uploadPart({ ...this.handle, partNumber: this.parts.length + 1, body }),
    );
    this.filled = 0;
  }

  async complete(): Promise<void> {
    if (this.filled > 0 || this.parts.length === 0) await this.flush();
    await this.store.completeMultipartUpload({ ...this.handle, parts: this.parts });
  }
}

async function discardExport(userId: string, payload: BuildArchivePayload): Promise<void> {
  const keys = [
    exportJsonKey(userId, payload.exportId),
    ...payload.volumes.map((volume) => volume.key),
  ];
  for (const key of keys) {
    await deletePrivateObject(key).catch((error: unknown) => {
      logger.error(
        { err: error, userId, objectKey: key },
        '[data-export] a failed export object was kept',
      );
    });
  }
}

export async function listDataExportWorkspaces(
  db: DatabaseAdapter,
  userId: string,
): Promise<(string | null)[]> {
  const rows = await db.query<{ organization_id: string | null }>(
    `select organization_id
       from organization_members
      where user_id = $1
      order by joined_at asc, organization_id asc`,
    [userId],
  );
  return [
    null,
    ...rows.flatMap((row) =>
      typeof row.organization_id === 'string' ? [row.organization_id] : [],
    ),
  ];
}

function archiveFromJob(row: DataExportJobRow): DataExportArchive | null {
  const exportId = row.payload['exportId'];
  const requestedAt = row.payload['requestedAt'];
  if (typeof exportId !== 'string' || typeof requestedAt !== 'string') return null;
  const base = { id: exportId, requestedAt, readyAt: null, expiresAt: null, volumes: [] };
  if (row.status === 'queued' || row.status === 'running') return { ...base, status: 'preparing' };
  if (row.status !== 'succeeded') return { ...base, status: 'failed' };
  const result = row.result ?? {};
  if (result['done'] !== true) return { ...base, status: 'preparing' };
  const readyAt = typeof result['readyAt'] === 'string' ? result['readyAt'] : null;
  const expiresAt = typeof result['expiresAt'] === 'string' ? result['expiresAt'] : null;
  if (!readyAt || !expiresAt || Date.parse(expiresAt) <= Date.now()) {
    return { ...base, status: 'expired', readyAt, expiresAt };
  }
  return {
    ...base,
    status: 'ready',
    readyAt,
    expiresAt,
    volumes: readVolumes(result['volumes']).map((volume) => ({
      volume: volume.volume,
      byteCount: volume.byteCount,
      fileCount: volume.fileCount,
      downloadPath: managedCloudDataExportArchivePath(exportId, volume.volume),
    })),
  };
}

async function readExportJob(
  db: DatabaseAdapter,
  userId: string,
  exportId: string | null,
): Promise<DataExportJobRow | null> {
  const [row] = await db.query<DataExportJobRow>(
    `select status, payload, result
       from public.background_jobs
      where user_id = $1
        and kind = $2
        and ($3::text is null or payload->>'exportId' = $3::text)
      order by created_at desc
      limit 1`,
    [userId, BUILD_ARCHIVE_JOB, exportId],
  );
  return row ?? null;
}

export async function readDataExportArchive(
  db: DatabaseAdapter,
  userId: string,
  exportId: string | null = null,
): Promise<DataExportArchive | null> {
  const row = await readExportJob(db, userId, exportId);
  return row ? archiveFromJob(row) : null;
}

export async function resolveDataExportDownload(
  db: DatabaseAdapter,
  userId: string,
  exportId: string,
  volume: number,
): Promise<DataExportVolumeDownload> {
  const row = await readExportJob(db, userId, exportId);
  const archive = row ? archiveFromJob(row) : null;
  if (!row || !archive || archive.status === 'failed') {
    throw createError.notFound('Export not found');
  }
  if (archive.status === 'preparing') {
    throw createError.conflict('This export is still being prepared.').asUserSafe();
  }
  if (archive.status === 'expired') {
    throw createError
      .notFound('This download link has expired. Request a new export from Settings.')
      .asUserSafe();
  }
  const stored = readVolumes(row.result?.['volumes']).find((entry) => entry.volume === volume);
  if (!stored) throw createError.notFound('Export not found');
  const date = archive.requestedAt.slice(0, 10);
  const suffix = archive.volumes.length > 1 ? `-part-${volume}` : '';
  return { key: stored.key, fileName: `agi-export-${date}${suffix}.zip` };
}

export async function requestDataExportArchive(input: {
  db: DatabaseAdapter;
  userId: string;
  origin: string;
  collect: () => Promise<unknown>;
}): Promise<{ archive: DataExportArchive; created: boolean }> {
  if (!archiveStore()) {
    throw createError.capabilityUnavailable(
      'Exporting your files is not available on this deployment.',
    );
  }
  const current = await readDataExportArchive(input.db, input.userId);
  if (current?.status === 'preparing') return { archive: current, created: false };

  const exportId = randomUUID();
  const requestedAt = new Date().toISOString();
  const json = Buffer.from(JSON.stringify(await input.collect(), null, 2));
  await putPrivateObject({
    key: exportJsonKey(input.userId, exportId),
    data: json,
    contentType: 'application/json',
    contentLength: json.byteLength,
  });
  await enqueueJob(input.db, {
    kind: BUILD_ARCHIVE_JOB,
    userId: input.userId,
    idempotencyKey: `data-export:${exportId}:1`,
    payload: {
      exportId,
      requestedAt,
      origin: input.origin,
      workspaces: await listDataExportWorkspaces(input.db, input.userId),
      volume: 1,
      cursor: null,
      volumes: [],
    },
  });
  return {
    archive: {
      id: exportId,
      status: 'preparing',
      requestedAt,
      readyAt: null,
      expiresAt: null,
      volumes: [],
    },
    created: true,
  };
}

export async function buildDataExportArchiveVolume(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const userId = requireAccount(context);
  const payload = readBuildPayload(context.job.payload);
  const target = archiveStore();
  if (!target) throw new PermanentJobError('Private multipart storage is not configured');

  const startedAt = Date.now();
  const key = volumeKey(userId, payload.exportId, payload.volume);
  const handle = await target.store.createMultipartUpload({
    bucket: target.bucket,
    key,
    contentType: 'application/zip',
  });
  const sink = new MultipartSink(target.store, handle);
  const zip = new StoredZipWriter((chunk) => sink.write(chunk));
  const unavailable: { id: string; entry: string }[] = [];
  let cursor = payload.cursor;

  try {
    if (!cursor) {
      const json = await getPrivateObjectStream(exportJsonKey(userId, payload.exportId));
      if (!json) throw new PermanentJobError('The staged export data is missing');
      await zip.add(EXPORT_JSON_ENTRY, streamChunks(json.body), new Date(payload.requestedAt));
      cursor = { workspace: 0, phase: 'library', afterId: null };
    }

    let volumeFull = false;
    while (cursor && !volumeFull) {
      const files = await archiveFilesAfter(context.db, userId, payload.workspaces, cursor);
      if (files.length === 0) {
        cursor = nextSection(cursor, payload.workspaces.length);
        continue;
      }
      for (const file of files) {
        if (context.signal.aborted) throw new Error('The export volume ran out of time');
        const projectedBytes =
          zip.byteCount +
          (file.byteCount ?? 0) +
          storedZipEntryOverhead(file.entryName) +
          STORED_ZIP_TRAILER_BYTES;
        const hasContent = zip.entryCount > 0;
        if (
          hasContent &&
          (Date.now() - startedAt > VOLUME_WORK_MS ||
            projectedBytes > VOLUME_TARGET_BYTES ||
            zip.entryCount >= STORED_ZIP_MAX_ENTRIES - 1)
        ) {
          volumeFull = true;
          break;
        }
        const content = await file.read().catch((error: unknown) => {
          logger.warn(
            { err: error, userId, fileId: file.id },
            '[data-export] a file was unreadable',
          );
          return null;
        });
        if (content) await zip.add(file.entryName, content, file.modifiedAt);
        else unavailable.push({ id: file.id, entry: file.entryName });
        cursor = { ...cursor, afterId: file.id };
      }
    }

    if (unavailable.length > 0) {
      await zip.add(
        UNAVAILABLE_FILES_ENTRY,
        bytesOf(Buffer.from(JSON.stringify({ unavailable }, null, 2))),
        new Date(),
      );
    }
    await zip.finish();
    await sink.complete();
  } catch (error) {
    await target.store.abortMultipartUpload(handle).catch(() => undefined);
    if (context.isFinalAttempt) await discardExport(userId, payload);
    throw error;
  }

  const volumes = [
    ...payload.volumes,
    { volume: payload.volume, key, byteCount: zip.byteCount, fileCount: zip.entryCount },
  ];
  if (cursor) {
    await enqueueJob(context.db, {
      kind: BUILD_ARCHIVE_JOB,
      userId,
      idempotencyKey: `data-export:${payload.exportId}:${payload.volume + 1}`,
      payload: { ...payload, volume: payload.volume + 1, cursor, volumes },
    });
    return { exportId: payload.exportId, volume: payload.volume, done: false };
  }

  const readyAt = new Date();
  const expiresAt = new Date(readyAt.getTime() + DATA_EXPORT_DOWNLOAD_HOURS * HOUR_MS);
  await enqueueJob(context.db, {
    kind: 'data-export.expire-archive',
    userId: null,
    idempotencyKey: `data-export-expire:${payload.exportId}`,
    runAfter: expiresAt,
    payload: {
      ownerId: userId,
      exportId: payload.exportId,
      keys: [exportJsonKey(userId, payload.exportId), ...volumes.map((volume) => volume.key)],
    },
  });
  await enqueueJob(context.db, {
    kind: 'email.data-export-ready',
    userId,
    idempotencyKey: `data-export-email:${payload.exportId}`,
    payload: { exportId: payload.exportId, origin: payload.origin },
  });
  return {
    exportId: payload.exportId,
    volume: payload.volume,
    done: true,
    readyAt: readyAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    volumes,
  };
}

export async function expireDataExportArchive(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const ownerId = requireString(context.job.payload, 'ownerId');
  const exportId = requireString(context.job.payload, 'exportId');
  const keys = context.job.payload['keys'];
  const prefix = exportPrefix(ownerId, exportId);
  if (
    !Array.isArray(keys) ||
    !keys.every((key) => typeof key === 'string' && key.startsWith(prefix))
  ) {
    throw new PermanentJobError('Data export expiry payload is malformed');
  }
  for (const key of keys as string[]) await deletePrivateObject(key);
  return { exportId, deleted: keys.length };
}

export async function eraseUserDataExportArchives(
  db: DatabaseAdapter,
  userId: string,
): Promise<{ deleted: number; failed: number }> {
  const rows = await db.query<{ payload: Record<string, unknown> }>(
    `select payload
       from public.background_jobs
      where user_id = $1
        and kind = $2`,
    [userId, BUILD_ARCHIVE_JOB],
  );
  const keys = new Set<string>();
  for (const row of rows) {
    const payload = isRecord(row?.payload) ? row.payload : {};
    const exportId = payload['exportId'];
    if (typeof exportId !== 'string' || !exportId) continue;
    keys.add(exportJsonKey(userId, exportId));
    const lastVolume = typeof payload['volume'] === 'number' ? payload['volume'] : 1;
    for (let volume = 1; volume <= lastVolume; volume += 1) {
      keys.add(volumeKey(userId, exportId, volume));
    }
  }
  let deleted = 0;
  let failed = 0;
  for (const key of keys) {
    try {
      await deletePrivateObject(key);
      deleted += 1;
    } catch (error) {
      failed += 1;
      logger.warn({ err: error, objectKey: key }, '[data-export] an export object was not erased');
    }
  }
  return { deleted, failed };
}

export async function sendDataExportReadyEmailJob(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const userId = requireAccount(context);
  const exportId = requireString(context.job.payload, 'exportId');
  const origin = requireString(context.job.payload, 'origin');
  const db = createClaimedUserScopedDb(context.db, { userId, organizationId: null });
  const archive = await readDataExportArchive(db, userId, exportId);
  if (!archive || archive.status !== 'ready' || !archive.expiresAt) {
    return { skipped: archive?.status ?? 'missing' };
  }
  const identity = await getIdentityUser(userId);
  const address = identity?.primaryEmailVerification === 'verified' ? identity.primaryEmail : null;
  if (!address) return { skipped: 'no_verified_email' };

  const result = await sendDataExportReadyEmail({
    to: address,
    downloadUrls: archive.volumes.map((volume) => `${origin}${volume.downloadPath}`),
    expiresAt: archive.expiresAt,
    idempotencyKey: `data-export-ready:${exportId}`,
  });
  if (result.delivered) return { delivered: true };
  if (result.reason === 'not_configured' || result.reason === 'invalid_recipient') {
    return { skipped: result.reason };
  }
  throw new Error(`The export email was not delivered: ${result.reason}`);
}
