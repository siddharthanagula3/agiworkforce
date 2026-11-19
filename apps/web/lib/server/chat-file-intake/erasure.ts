import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  deleteObjectsUnderPrefix,
  supportsMultipartUploads,
  type MultipartObjectStore,
  type ObjectStore,
  type PendingMultipartUpload,
} from '@agiworkforce/object-storage';
import { logger } from '@/lib/logger';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import { isPrivateObjectStorageConfigured } from '@/lib/server/object-storage';
import { getObjectStore, objectStorageConfig } from '@/lib/server/object-storage-runtime';
import { uploadObjectKey } from '@/lib/server/upload-keys';
import { preparationKeyPrefix } from '@/lib/server/chat-file-preparation/derived-keys';
import {
  RELAY_SEGMENTS_PREFIX,
  relaySegmentInWorkspace,
  relaySegmentPersonPrefix,
} from '@/app/api/files/uploads/relay-segments';
import { chatFileSchemaReady } from './schema';

export const CHAT_FILE_INTAKES_TABLE = 'chat_file_intakes';
export const CHAT_FILE_PREPARATIONS_TABLE = 'chat_file_preparations';

export type ChatFileTable = typeof CHAT_FILE_INTAKES_TABLE | typeof CHAT_FILE_PREPARATIONS_TABLE;

export type ChatFileErasureScope = { userId: string } | { organizationId: string };

export interface ChatFileTableErasure {
  deleted: boolean;
  retainedForRetry?: boolean;
  error?: string;
}

export interface ChatFileErasureReport {
  tables: Record<ChatFileTable, ChatFileTableErasure>;
  objectsDeleted: number;
  objectsFailed: number;
  uploadsAborted: number;
}

interface IntakeObjectRow {
  id: string;
  user_id: string;
  staging_key: string;
  multipart_upload_id: string | null;
  state: string;
  sealing_entered_at: string | Date | null;
}

interface PreparationObjectRow {
  id: string;
  user_id: string;
  derived_keys: string[] | null;
  updated_at: string;
}

interface StorageTarget {
  store: ObjectStore;
  bucket: string;
}

interface Tally {
  deleted: number;
  failed: number;
  aborted: number;
}

const TABLES: readonly ChatFileTable[] = [CHAT_FILE_INTAKES_TABLE, CHAT_FILE_PREPARATIONS_TABLE];

export function chatFileTableOutcome(
  report: ChatFileErasureReport,
  table: string,
): ChatFileTableErasure | undefined {
  const known = TABLES.find((candidate) => candidate === table);
  return known === undefined ? undefined : report.tables[known];
}

function scopeParams(scope: ChatFileErasureScope): [string | null, string | null] {
  return 'userId' in scope ? [scope.userId, null] : [null, scope.organizationId];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function everyTable(result: ChatFileTableErasure): ChatFileErasureReport['tables'] {
  return Object.fromEntries(TABLES.map((table) => [table, { ...result }])) as Record<
    ChatFileTable,
    ChatFileTableErasure
  >;
}

function storageTarget(): StorageTarget | null {
  const bucket = objectStorageConfig().privateBucket;
  if (!isPrivateObjectStorageConfigured() || !bucket) return null;
  return { store: getObjectStore(), bucket };
}

function userChatAttachmentPrefix(userId: string): string {
  const key = uploadObjectKey('chat-attachment', { userId, fileName: 'prefix' });
  return key.slice(0, key.lastIndexOf('/') + 1);
}

function userDerivedPrefix(userId: string): string {
  const key = preparationKeyPrefix(userId, 'prefix');
  return key.slice(0, key.indexOf('/', key.indexOf('/') + 1) + 1);
}

function underPrefix(key: string, prefix: () => string): boolean {
  try {
    return key.startsWith(prefix());
  } catch {
    return false;
  }
}

async function deleteKeys(
  target: StorageTarget | null,
  keys: Iterable<string>,
  ownedPrefix: () => string,
  tally: Tally,
): Promise<boolean> {
  let complete = true;
  for (const key of keys) {
    if (!underPrefix(key, ownedPrefix)) {
      tally.failed += 1;
      complete = false;
      logger.warn({ objectKey: key }, 'Chat file object key lies outside its owner prefix');
      continue;
    }
    if (target === null) {
      tally.failed += 1;
      complete = false;
      continue;
    }
    try {
      await target.store.delete(target.bucket, key);
      tally.deleted += 1;
    } catch (error) {
      tally.failed += 1;
      complete = false;
      logger.warn({ objectKey: key, error: errorText(error) }, 'Chat file object delete failed');
    }
  }
  return complete;
}

interface UploadAborter {
  store: MultipartObjectStore;
  bucket: string;
  userPrefix: string | null;
  underUserPrefix: Map<string, PendingMultipartUpload> | null;
}

async function uploadAborter(
  target: StorageTarget | null,
  scope: ChatFileErasureScope,
  tally: Tally,
): Promise<UploadAborter | null> {
  if (target === null || !supportsMultipartUploads(target.store)) return null;
  const aborter: UploadAborter = {
    store: target.store,
    bucket: target.bucket,
    userPrefix: 'userId' in scope ? userChatAttachmentPrefix(scope.userId) : null,
    underUserPrefix: null,
  };
  if (aborter.userPrefix === null) return aborter;
  try {
    const listed = await aborter.store.listPendingMultipartUploads(
      aborter.bucket,
      aborter.userPrefix,
    );
    aborter.underUserPrefix = new Map(listed.map((upload) => [upload.uploadId, upload]));
  } catch (error) {
    tally.failed += 1;
    logger.warn({ error: errorText(error) }, 'Chat file multipart uploads could not be listed');
  }
  return aborter;
}

async function abortUpload(
  aborter: UploadAborter,
  upload: PendingMultipartUpload,
  tally: Tally,
): Promise<boolean> {
  try {
    await aborter.store.abortMultipartUpload({
      bucket: aborter.bucket,
      key: upload.key,
      uploadId: upload.uploadId,
    });
    tally.aborted += 1;
    return true;
  } catch (error) {
    tally.failed += 1;
    logger.warn(
      { objectKey: upload.key, error: errorText(error) },
      'Chat file multipart upload abort failed',
    );
    return false;
  }
}

async function abortIntakeUpload(
  aborter: UploadAborter | null,
  row: IntakeObjectRow,
  tally: Tally,
): Promise<boolean> {
  if (row.multipart_upload_id === null) return true;
  if (aborter === null) {
    tally.failed += 1;
    return false;
  }
  if (aborter.userPrefix !== null && row.staging_key.startsWith(aborter.userPrefix)) {
    if (aborter.underUserPrefix === null) return false;
    const upload = aborter.underUserPrefix.get(row.multipart_upload_id);
    if (upload === undefined || upload.key !== row.staging_key) return true;
    aborter.underUserPrefix.delete(upload.uploadId);
    return abortUpload(aborter, upload, tally);
  }
  let listed: PendingMultipartUpload[];
  try {
    listed = await aborter.store.listPendingMultipartUploads(aborter.bucket, row.staging_key);
  } catch (error) {
    tally.failed += 1;
    logger.warn({ error: errorText(error) }, 'Chat file multipart uploads could not be listed');
    return false;
  }
  let complete = true;
  for (const upload of listed) {
    if (upload.key !== row.staging_key || upload.uploadId !== row.multipart_upload_id) continue;
    complete = (await abortUpload(aborter, upload, tally)) && complete;
  }
  return complete;
}

async function abortStrayUserUploads(
  aborter: UploadAborter | null,
  tally: Tally,
): Promise<boolean> {
  if (aborter === null || aborter.userPrefix === null) return true;
  if (aborter.underUserPrefix === null) return false;
  let complete = true;
  for (const upload of aborter.underUserPrefix.values()) {
    complete = (await abortUpload(aborter, upload, tally)) && complete;
  }
  return complete;
}

function intakeObjectKeys(row: IntakeObjectRow): string[] {
  return row.sealing_entered_at !== null && row.state !== 'sealed'
    ? [row.staging_key, sealedChatAttachmentPathname(row.staging_key)]
    : [row.staging_key];
}

const RELAY_SEGMENTS_LEFT = 'Relayed upload segments could not all be removed';

/**
 * Segments of a relayed part that never finished are recorded by no row, so
 * they are found by their layout. A person's erasure takes everything under
 * their prefix. An organization's takes every segment relayed in that
 * workspace, by current and former members alike, and leaves the rest.
 */
async function eraseRelaySegments(
  target: StorageTarget | null,
  scope: ChatFileErasureScope,
  tally: Tally,
): Promise<boolean> {
  if (target === null) return true;
  try {
    const swept = await deleteObjectsUnderPrefix(
      target.store,
      'userId' in scope
        ? { bucket: target.bucket, prefix: relaySegmentPersonPrefix(scope.userId) }
        : {
            bucket: target.bucket,
            prefix: RELAY_SEGMENTS_PREFIX,
            matching: (key) => relaySegmentInWorkspace(key, scope.organizationId),
          },
    );
    tally.deleted += swept.deleted;
    tally.failed += swept.failed;
    return swept.supported && swept.failed === 0;
  } catch (error) {
    tally.failed += 1;
    logger.warn({ error: errorText(error) }, 'Relayed upload segments could not be listed');
    return false;
  }
}

interface RowPass {
  objectsLeft: boolean;
  error?: string;
}

const REMAINING_ROWS_SQL: Record<ChatFileTable, string> = {
  [CHAT_FILE_INTAKES_TABLE]: `select count(*)::int as remaining
       from public.chat_file_intakes
      where user_id = $1 or organization_id = $2::uuid`,
  [CHAT_FILE_PREPARATIONS_TABLE]: `select count(*)::int as remaining
       from public.chat_file_preparations
      where user_id = $1 or organization_id = $2::uuid`,
};

async function deleteUnchangedIntake(
  db: Pick<DatabaseAdapter, 'query'>,
  row: IntakeObjectRow,
  params: [string | null, string | null],
): Promise<void> {
  await db.query<{ id: string }>(
    `delete from public.chat_file_intakes
      where id = $1::uuid
        and (user_id = $2 or organization_id = $3::uuid)
        and state = $4
        and (sealing_entered_at is null) = $5::boolean
        and multipart_upload_id is not distinct from $6::text
      returning id`,
    [row.id, ...params, row.state, row.sealing_entered_at === null, row.multipart_upload_id],
  );
}

async function deleteUnchangedPreparation(
  db: Pick<DatabaseAdapter, 'query'>,
  row: PreparationObjectRow,
  params: [string | null, string | null],
): Promise<void> {
  await db.query<{ id: string }>(
    `delete from public.chat_file_preparations
      where id = $1::uuid
        and (user_id = $2 or organization_id = $3::uuid)
        and derived_keys = $4::text[]
        and updated_at = $5::timestamptz
      returning id`,
    [row.id, ...params, row.derived_keys ?? [], row.updated_at],
  );
}

async function eraseRows<Row extends { id: string }>(
  rows: readonly Row[],
  objectsGone: (row: Row) => Promise<boolean>,
  deleteRow: (row: Row) => Promise<void>,
): Promise<RowPass> {
  const pass: RowPass = { objectsLeft: false };
  for (const row of rows) {
    if (!(await objectsGone(row))) {
      pass.objectsLeft = true;
      continue;
    }
    try {
      await deleteRow(row);
    } catch (error) {
      pass.error ??= errorText(error);
    }
  }
  return pass;
}

async function tableOutcome(
  db: Pick<DatabaseAdapter, 'query'>,
  table: ChatFileTable,
  params: [string | null, string | null],
  pass: RowPass,
): Promise<ChatFileTableErasure> {
  if (pass.error !== undefined) {
    return { deleted: false, retainedForRetry: true, error: pass.error };
  }
  if (pass.objectsLeft) return { deleted: false, retainedForRetry: true };
  try {
    const [left] = await db.query<{ remaining: number }>(REMAINING_ROWS_SQL[table], params);
    return (left?.remaining ?? 0) === 0
      ? { deleted: true }
      : {
          deleted: false,
          retainedForRetry: true,
          error: 'Chat file rows changed or were added during erasure',
        };
  } catch (error) {
    return { deleted: false, retainedForRetry: true, error: errorText(error) };
  }
}

/**
 * Deletes every staging, unsealed copy and derived object of a user's or an
 * organization's chat file rows before the rows, so a row is gone only when
 * nothing it points at is left. These rows are the only record of those keys.
 * Relayed segments have no row and are found by their owner's prefix. A row is
 * deleted only if it still looks as it did when read, since a seal or a
 * preparation step may write a new key for it while erasure runs.
 */
export async function eraseChatFiles(
  db: Pick<DatabaseAdapter, 'query'>,
  scope: ChatFileErasureScope,
): Promise<ChatFileErasureReport> {
  const tally: Tally = { deleted: 0, failed: 0, aborted: 0 };
  const report = (tables: ChatFileErasureReport['tables']): ChatFileErasureReport => ({
    tables,
    objectsDeleted: tally.deleted,
    objectsFailed: tally.failed,
    uploadsAborted: tally.aborted,
  });

  let target: StorageTarget | null = null;
  try {
    target = storageTarget();
  } catch (error) {
    logger.warn({ error: errorText(error) }, 'Chat file storage could not be resolved');
  }
  const relaySegmentsGone = await eraseRelaySegments(target, scope, tally);
  const withRelaySegments = (
    tables: ChatFileErasureReport['tables'],
  ): ChatFileErasureReport['tables'] =>
    relaySegmentsGone
      ? tables
      : {
          ...tables,
          [CHAT_FILE_INTAKES_TABLE]: {
            deleted: false,
            retainedForRetry: true,
            error: tables[CHAT_FILE_INTAKES_TABLE].error ?? RELAY_SEGMENTS_LEFT,
          },
        };

  let ready: boolean;
  try {
    ready = await chatFileSchemaReady(db);
  } catch (error) {
    return report(everyTable({ deleted: false, retainedForRetry: true, error: errorText(error) }));
  }
  if (!ready) return report(withRelaySegments(everyTable({ deleted: true })));

  const params = scopeParams(scope);
  let intakes: IntakeObjectRow[];
  let preparations: PreparationObjectRow[];
  try {
    intakes = await db.query<IntakeObjectRow>(
      `select id, user_id, staging_key, multipart_upload_id, state, sealing_entered_at
         from public.chat_file_intakes
        where user_id = $1 or organization_id = $2::uuid`,
      params,
    );
    preparations = await db.query<PreparationObjectRow>(
      `select id, user_id, derived_keys, updated_at::text as updated_at
         from public.chat_file_preparations
        where user_id = $1 or organization_id = $2::uuid`,
      params,
    );
  } catch (error) {
    return report(everyTable({ deleted: false, retainedForRetry: true, error: errorText(error) }));
  }

  const aborter = await uploadAborter(target, scope, tally);
  const intakePass = await eraseRows(
    intakes,
    async (row) => {
      const uploadGone = await abortIntakeUpload(aborter, row, tally);
      const keysGone = await deleteKeys(
        target,
        intakeObjectKeys(row),
        () => userChatAttachmentPrefix(row.user_id),
        tally,
      );
      return keysGone && uploadGone;
    },
    (row) => deleteUnchangedIntake(db, row, params),
  );
  if (!(await abortStrayUserUploads(aborter, tally))) intakePass.objectsLeft = true;
  const preparationPass = await eraseRows(
    preparations,
    (row) =>
      deleteKeys(target, row.derived_keys ?? [], () => userDerivedPrefix(row.user_id), tally),
    (row) => deleteUnchangedPreparation(db, row, params),
  );

  return report(
    withRelaySegments({
      [CHAT_FILE_INTAKES_TABLE]: await tableOutcome(
        db,
        CHAT_FILE_INTAKES_TABLE,
        params,
        intakePass,
      ),
      [CHAT_FILE_PREPARATIONS_TABLE]: await tableOutcome(
        db,
        CHAT_FILE_PREPARATIONS_TABLE,
        params,
        preparationPass,
      ),
    }),
  );
}
