// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  MemoryObjectStore,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_BUCKET_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_PRIVATE_BUCKET_ENV,
  OBJECT_STORAGE_PROVIDER_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
} from '@agiworkforce/object-storage';

type LoggerModule = typeof import('@/lib/logger');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { eraseChatFiles } from '@/lib/server/chat-file-intake/erasure';
import { chatFileSchemaReady } from '@/lib/server/chat-file-intake/schema';
import { getObjectStore } from '@/lib/server/object-storage-runtime';

const connectionString = process.env['AGI_CHAT_FILE_INTAKE_TEST_DATABASE_URL'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
if (connectionString) {
  const address = new URL(connectionString);
  if (!LOCAL_HOSTS.has(address.hostname) || !/^\/[a-z0-9_]+_test$/.test(address.pathname)) {
    throw new Error(
      'The chat file intake fixture runs only against a local database whose name ends in _test.',
    );
  }
}

const OWNER = 'chat-file-owner';
const STRANGER = 'chat-file-stranger';
const CONVERSATION = '7a3e2c1d-5b4f-4e6a-9c8d-1f2e3a4b5c6d';
const CONTENT_SHA = 'b'.repeat(64);
const OTHER_SHA = 'c'.repeat(64);

class RolledBack extends Error {}

let db: DatabaseAdapter;
let migrationBody: string;

async function inRolledBackMigration(
  work: (tx: DatabaseAdapter) => Promise<void>,
  beforeMigration?: (tx: DatabaseAdapter) => Promise<void>,
): Promise<void> {
  await expect(
    db.transaction(async (tx) => {
      await tx.execute(`insert into public.profiles (id) values ($1), ($2)`, [OWNER, STRANGER]);
      await beforeMigration?.(tx);
      await tx.execute(migrationBody);
      await work(tx);
      throw new RolledBack();
    }),
  ).rejects.toBeInstanceOf(RolledBack);
}

async function sqlState(
  tx: DatabaseAdapter,
  sql: string,
  params: unknown[] = [],
): Promise<string | null> {
  await tx.execute('savepoint attempt');
  try {
    await tx.execute(sql, params);
    await tx.execute('release savepoint attempt');
    return null;
  } catch (error) {
    await tx.execute('rollback to savepoint attempt');
    return (error as { code?: string }).code ?? 'unknown';
  }
}

const INSERT_CHAT_MEDIA = `insert into public.media_assets
  (user_id, kind, mime_type, storage_url, storage_pathname, byte_size, content_sha256,
   scanned_sha256, metadata)
  values ($1, 'document', 'application/pdf', $2, $2, $3, $4, $5,
          jsonb_build_object('source', 'chat-attachment'))`;

function insertChatMedia(
  tx: DatabaseAdapter,
  name: string,
  byteSize: number,
  scanned: string | null,
): Promise<string | null> {
  return sqlState(tx, INSERT_CHAT_MEDIA, [
    OWNER,
    `chat-attachments/${OWNER}/${name}.pdf`,
    byteSize,
    CONTENT_SHA,
    scanned,
  ]);
}

const INSERT_INTAKE = `insert into public.chat_file_intakes
  (user_id, file_name, mime_type, byte_count, declared_sha256, staging_key, state,
   refusal_code)
  values ($1, 'report.pdf', 'application/pdf', 73400320, $2, $3, $4, $5)`;

// llm-guardrail-allow: requires a local disposable _test database; every case applies 0422 inside a transaction it rolls back.
describe.skipIf(!connectionString)('0422 chat file intakes against PostgreSQL', () => {
  beforeAll(async () => {
    db = createDatabaseClient({
      provider: 'postgres',
      connectionString: connectionString!,
      poolSize: 1,
      statementTimeoutMs: 30_000,
    });
    const migration = await readFile(
      new URL('./0422_chat_file_intakes.sql', import.meta.url),
      'utf8',
    );
    migrationBody = migration.replace(/^begin;$/m, '').replace(/^commit;$/m, '');
    const [applied] = await db.query<{ present: boolean }>(
      `select to_regclass('public.chat_file_intakes') is not null as present`,
    );
    if (applied?.present) {
      throw new Error('0422 is already applied to this database; the fixture needs it absent.');
    }
  });

  afterAll(async () => {
    await db?.dispose();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes a chat file of exactly the inline limit without a scan verdict', async () => {
    await inRolledBackMigration(async (tx) => {
      expect(await insertChatMedia(tx, 'at-limit', MAX_CHAT_ATTACHMENT_BYTES, null)).toBeNull();
    });
  });

  it('refuses one byte more without a matching verdict, and passes it with one', async () => {
    await inRolledBackMigration(async (tx) => {
      const over = MAX_CHAT_ATTACHMENT_BYTES + 1;
      expect(await insertChatMedia(tx, 'unscanned', over, null)).toBe('23514');
      expect(await insertChatMedia(tx, 'mismatched', over, OTHER_SHA)).toBe('23514');
      expect(await insertChatMedia(tx, 'scanned', over, CONTENT_SHA)).toBeNull();
    });
  });

  it('refuses an unscanned large file named by its chat attachment path alone', async () => {
    await inRolledBackMigration(async (tx) => {
      expect(
        await sqlState(
          tx,
          `insert into public.media_assets
             (user_id, kind, mime_type, storage_url, storage_pathname, byte_size, content_sha256)
           values ($1, 'document', 'application/pdf', $2, $2, $3, $4)`,
          [
            OWNER,
            `chat-attachments/${OWNER}/untagged.pdf`,
            MAX_CHAT_ATTACHMENT_BYTES + 1,
            CONTENT_SHA,
          ],
        ),
      ).toBe('23514');
    });
  });

  it('lets a legacy large row be soft deleted and lose its conversation', async () => {
    let legacyId = '';
    await inRolledBackMigration(
      async (tx) => {
        expect(
          await sqlState(tx, `update public.media_assets set deleted_at = now() where id = $1`, [
            legacyId,
          ]),
        ).toBeNull();
        expect(
          await sqlState(tx, `delete from public.web_conversations where id = $1`, [CONVERSATION]),
        ).toBeNull();
        const [row] = await tx.query<{ conversation_id: string | null; deleted: boolean }>(
          `select conversation_id, deleted_at is not null as deleted
             from public.media_assets where id = $1`,
          [legacyId],
        );
        expect(row).toEqual({ conversation_id: null, deleted: true });
      },
      async (tx) => {
        await tx.execute(
          `insert into public.web_conversations (id, user_id, server_version) values ($1, $2, 1)`,
          [CONVERSATION, OWNER],
        );
        const [legacy] = await tx.query<{ id: string }>(
          `insert into public.media_assets
             (user_id, kind, mime_type, storage_url, storage_pathname, byte_size, content_sha256,
              conversation_id, metadata)
           values ($1, 'document', 'application/pdf', $2, $2, $3, $4, $5,
                   jsonb_build_object('source', 'chat-attachment'))
           returning id`,
          [
            OWNER,
            `chat-attachments/${OWNER}/legacy.pdf`,
            MAX_CHAT_ATTACHMENT_BYTES * 2,
            CONTENT_SHA,
            CONVERSATION,
          ],
        );
        legacyId = legacy!.id;
      },
    );
  });

  it("shows app_rls none of another account's intakes or preparations", async () => {
    await inRolledBackMigration(async (tx) => {
      for (const [user, key] of [
        [OWNER, `chat-attachments/${OWNER}/mine.pdf`],
        [STRANGER, `chat-attachments/${STRANGER}/theirs.pdf`],
      ] as const) {
        await tx.execute(INSERT_INTAKE, [user, CONTENT_SHA, key, 'uploaded', null]);
        await tx.execute(
          `insert into public.chat_file_preparations (user_id, kind, preparer_version)
           values ($1, 'pdf', 1)`,
          [user],
        );
      }

      await tx.execute('set local role app_rls');
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [OWNER]);

      const intakes = await tx.query<{ user_id: string }>(
        'select user_id from public.chat_file_intakes',
      );
      const preparations = await tx.query<{ user_id: string }>(
        'select user_id from public.chat_file_preparations',
      );
      expect(intakes).toEqual([{ user_id: OWNER }]);
      expect(preparations).toEqual([{ user_id: OWNER }]);
      expect(
        await sqlState(tx, INSERT_INTAKE, [
          STRANGER,
          CONTENT_SHA,
          `chat-attachments/${STRANGER}/forged.pdf`,
          'uploaded',
          null,
        ]),
      ).toBe('42501');
      expect(
        await sqlState(tx, `delete from public.chat_file_intakes where user_id = $1`, [OWNER]),
      ).toBe('42501');
    });
  });

  it('refuses a state outside the lifecycle, and a terminal state without its code', async () => {
    await inRolledBackMigration(async (tx) => {
      const key = (name: string) => `chat-attachments/${OWNER}/${name}.pdf`;
      expect(
        await sqlState(tx, INSERT_INTAKE, [OWNER, CONTENT_SHA, key('odd'), 'quarantined', null]),
      ).toBe('23514');
      expect(
        await sqlState(tx, INSERT_INTAKE, [OWNER, CONTENT_SHA, key('bare'), 'rejected', null]),
      ).toBe('23514');
      expect(
        await sqlState(tx, INSERT_INTAKE, [
          OWNER,
          CONTENT_SHA,
          key('stray'),
          'uploaded',
          'malware',
        ]),
      ).toBe('23514');
      expect(
        await sqlState(tx, INSERT_INTAKE, [
          OWNER,
          CONTENT_SHA,
          key('refused'),
          'rejected',
          'malware',
        ]),
      ).toBeNull();
    });
  });

  it('passes a large media row that is not a chat attachment without a scan verdict', async () => {
    await inRolledBackMigration(async (tx) => {
      expect(
        await sqlState(
          tx,
          `insert into public.media_assets
             (user_id, kind, mime_type, storage_url, storage_pathname, byte_size, content_sha256,
              metadata)
           values ($1, 'video', 'video/mp4', $2, $2, $3, $4,
                   jsonb_build_object('source', 'video-generation'))`,
          [OWNER, `generated-media/${OWNER}/clip.mp4`, MAX_CHAT_ATTACHMENT_BYTES * 4, CONTENT_SHA],
        ),
      ).toBeNull();
    });
  });

  it('keeps the trigger inert for the app role: a file at the limit passes, one byte more is refused, and the readiness probe answers true', async () => {
    await inRolledBackMigration(async (tx) => {
      await tx.execute('set local role app_rls');
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [OWNER]);

      expect(await insertChatMedia(tx, 'small-as-app', MAX_CHAT_ATTACHMENT_BYTES, null)).toBeNull();
      expect(await insertChatMedia(tx, 'large-as-app', MAX_CHAT_ATTACHMENT_BYTES + 1, null)).toBe(
        '23514',
      );
      expect(await chatFileSchemaReady(tx)).toBe(true);
    });
  });

  it('runs the erasure statements for a user and for an organization and leaves both tables empty', async () => {
    const bucket = 'chat-files-private-live-test';
    vi.stubEnv(OBJECT_STORAGE_PROVIDER_ENV, 'memory');
    vi.stubEnv(OBJECT_STORAGE_ENDPOINT_ENV, 'http://127.0.0.1:1');
    vi.stubEnv(OBJECT_STORAGE_ACCESS_KEY_ID_ENV, 'test-access-key');
    vi.stubEnv(OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV, 'test-secret-key');
    vi.stubEnv(OBJECT_STORAGE_BUCKET_ENV, 'chat-files-public-live-test');
    vi.stubEnv(OBJECT_STORAGE_PRIVATE_BUCKET_ENV, bucket);
    const store = getObjectStore();
    if (!(store instanceof MemoryObjectStore)) throw new Error('The test store is not in memory.');
    store.clear();
    const put = (key: string) =>
      store.put({ bucket, key, body: new Uint8Array([1]), contentType: 'application/pdf' });

    await inRolledBackMigration(async (tx) => {
      const [organization] = await tx.query<{ id: string }>(
        `insert into public.organizations (name, slug) values ('Erasure fixture', $1) returning id`,
        [`chat-file-erasure-${Date.now()}`],
      );
      const owners = [
        { userId: OWNER, organizationId: null, label: 'personal' },
        { userId: STRANGER, organizationId: organization!.id, label: 'workspace' },
      ];
      for (const { userId, organizationId, label } of owners) {
        const stagingKey = `chat-attachments/${userId}/${label}.pdf`;
        const upload = await store.createMultipartUpload({
          bucket,
          key: stagingKey,
          contentType: 'application/pdf',
        });
        await put(stagingKey);
        await put(`chat-derived/${userId}/${label}/v1/text/0001.txt`);
        await tx.execute(
          `insert into public.chat_file_intakes
             (user_id, organization_id, file_name, mime_type, byte_count, declared_sha256,
              staging_key, multipart_upload_id, state, sealing_entered_at)
           values ($1, $2::uuid, 'report.pdf', 'application/pdf', 73400320, $3, $4, $5,
                   'sealing', now())`,
          [userId, organizationId, CONTENT_SHA, stagingKey, upload.uploadId],
        );
        await tx.execute(
          `insert into public.chat_file_preparations
             (user_id, organization_id, kind, preparer_version, derived_keys)
           values ($1, $2::uuid, 'pdf', 1, $3::text[])`,
          [userId, organizationId, [`chat-derived/${userId}/${label}/v1/text/0001.txt`]],
        );
      }

      const personal = await eraseChatFiles(tx, { userId: OWNER });
      const workspace = await eraseChatFiles(tx, { organizationId: organization!.id });

      for (const report of [personal, workspace]) {
        expect(report.tables).toEqual({
          chat_file_intakes: { deleted: true },
          chat_file_preparations: { deleted: true },
        });
        expect(report.objectsFailed).toBe(0);
        expect(report.uploadsAborted).toBe(1);
      }
      const [left] = await tx.query<{ intakes: number; preparations: number }>(
        `select (select count(*)::int from public.chat_file_intakes) as intakes,
                (select count(*)::int from public.chat_file_preparations) as preparations`,
      );
      expect(left).toEqual({ intakes: 0, preparations: 0 });
      for (const { userId, label } of owners) {
        expect(await store.head(bucket, `chat-attachments/${userId}/${label}.pdf`)).toBeNull();
        expect(
          await store.head(bucket, `chat-derived/${userId}/${label}/v1/text/0001.txt`),
        ).toBeNull();
      }
      expect(await store.listPendingMultipartUploads(bucket, 'chat-attachments/')).toEqual([]);
    });
  });

  it('refuses to delete an owner while an intake still points at stored bytes', async () => {
    await inRolledBackMigration(async (tx) => {
      await tx.execute(INSERT_INTAKE, [
        OWNER,
        CONTENT_SHA,
        `chat-attachments/${OWNER}/kept.pdf`,
        'uploaded',
        null,
      ]);
      expect(await sqlState(tx, `delete from public.profiles where id = $1`, [OWNER])).toBe(
        '23503',
      );
    });
  });
});
