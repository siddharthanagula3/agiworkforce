// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import { ManagedCloudChatFileIntakeStatusResponseSchema } from '@agiworkforce/cloud-contracts';

type StoreModule = typeof import('@/lib/server/chat-file-intake/store');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  keyValue: null as unknown,
  deps: null as unknown,
  depsFor: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireCsrfToken: (...args: unknown[]) => mocks.requireCsrfToken(...args),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getKeyValueStore: () => mocks.keyValue,
}));
vi.mock('@/lib/server/chat-file-intake/transitions', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  defaultIntakeTransitionDeps: (db: unknown, ownerUserId: string) => {
    mocks.depsFor(db, ownerUserId);
    return mocks.deps;
  },
}));
vi.mock('@/lib/server/chat-file-intake/store', async (importOriginal) => {
  const actual = await importOriginal<StoreModule>();
  return {
    ...actual,
    readIntakeStatus: async (
      db: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> },
      input: { userId: string; intakeId: string },
    ) => {
      await db.query('select from public.chat_file_intakes i where i.id = $2 and i.user_id = $1', [
        input.userId,
        input.intakeId,
      ]);
      const deps = mocks.deps as { store: { get(id: string): Promise<{ userId: string } | null> } };
      const row = await deps.store.get(input.intakeId);
      return row && row.userId === input.userId ? row : null;
    },
  };
});

import { createQueryDb } from '@/lib/server/chat-file-intake/__tests__/fake-query-db';
import {
  createMemoryIntakeStore,
  intakeRow,
  type MemoryIntakeStore,
} from '@/lib/server/chat-file-intake/__tests__/memory-intake-store';
import { createSchemaAbsentDb } from '@/lib/server/chat-file-intake/__tests__/schema-absent-db';
import { DELETE, GET } from '../route';

const OWNER = 'user-owner';
const INTAKE_ID = intakeRow().id;
const MIB = 1024 * 1024;
const BASE_MS = Date.parse('2026-11-15T12:00:00Z');

let systemTimeMs = BASE_MS;
let store: MemoryIntakeStore;
let objects: Record<string, ReturnType<typeof vi.fn>>;

function readyDb() {
  return createQueryDb(async (sql) =>
    /to_regclass/.test(sql)
      ? [{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }]
      : [],
  );
}

function signedInAs(userId: string, db: unknown = readyDb().db) {
  mocks.getUserScopedDb.mockResolvedValue({ db, userId, organizationId: null });
}

function context(intakeId: string) {
  return { params: Promise.resolve({ intakeId }) } as never;
}

function statusRequest(intakeId = INTAKE_ID) {
  return GET(
    new NextRequest(`http://localhost:3000/api/files/intakes/${intakeId}`),
    context(intakeId),
  );
}

function cancelRequest(intakeId = INTAKE_ID) {
  return DELETE(
    new NextRequest(`http://localhost:3000/api/files/intakes/${intakeId}`, { method: 'DELETE' }),
    context(intakeId),
  );
}

async function intakeOf(response: Response) {
  return ManagedCloudChatFileIntakeStatusResponseSchema.parse(await response.json()).intake;
}

beforeEach(() => {
  vi.clearAllMocks();
  systemTimeMs += 60 * 60_000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(systemTimeMs);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.keyValue = createMemoryKeyValueStore();
  store = createMemoryIntakeStore([
    intakeRow({
      state: 'awaiting_parts',
      byteCount: 40 * MIB,
      dailyBytesCharged: 40 * MIB,
      createdAt: systemTimeMs,
    }),
  ]);
  objects = {
    head: vi.fn(async () => null),
    readHead: vi.fn(async () => null),
    copyIfUnchanged: vi.fn(async () => false),
    presignGet: vi.fn(async () => ''),
    delete: vi.fn(async () => undefined),
    uploadedBytes: vi.fn(async () => 10 * MIB),
    abortUpload: vi.fn(async () => true),
  };
  mocks.deps = { store, objects, now: () => systemTimeMs };
  signedInAs(OWNER);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/files/intakes/:intakeId', () => {
  it('answers the owner the intake as the client reads it, on its own rate limit bucket', async () => {
    store.put(intakeRow({ state: 'scanning', attempts: 1 }));

    const response = await statusRequest();

    expect(response.status).toBe(200);
    expect(await intakeOf(response)).toMatchObject({ id: INTAKE_ID });
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'uploads-intake-status',
      OWNER,
    );
  });

  it('carries the attachment once the intake is sealed', async () => {
    store.put(intakeRow({ state: 'sealed', mediaAssetId: '9d7c1c1e-5a0b-4a61-9a2b-3f7e2d1c0b9a' }));

    const intake = await intakeOf(await statusRequest());

    expect(intake).toMatchObject({
      attachment: {
        id: '9d7c1c1e-5a0b-4a61-9a2b-3f7e2d1c0b9a',
        name: 'report.pdf',
        url: '/api/files/9d7c1c1e-5a0b-4a61-9a2b-3f7e2d1c0b9a',
      },
    });
  });

  it('tells the owner a sealed file is gone when its media row was deleted since', async () => {
    store.put(intakeRow({ state: 'sealed', mediaAssetId: null }));

    const response = await statusRequest();

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe(
      'This file is no longer stored. Attach it again to use it.',
    );
  });

  it('names the refusal of a rejected intake', async () => {
    store.put(intakeRow({ state: 'rejected', refusalCode: 'malware' }));

    expect(await intakeOf(await statusRequest())).toMatchObject({ refusalCode: 'malware' });
  });

  it('answers another person as if the intake did not exist', async () => {
    signedInAs('user-intruder');

    expect((await statusRequest()).status).toBe(404);
  });

  it('answers an id that is not an intake id with 404 before reading anything', async () => {
    const { db, query } = readyDb();
    signedInAs(OWNER, db);

    expect((await statusRequest('not-an-id')).status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });

  it('answers 404 on a database without the intake tables, sending only the probe', async () => {
    const delegate = createQueryDb(async () => []);
    signedInAs(OWNER, createSchemaAbsentDb(delegate.db));

    expect((await statusRequest()).status).toBe(404);
    expect(delegate.query).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/files/intakes/:intakeId', () => {
  it('cancels for the client, refunds the bytes not stored and builds its deps for the signed-in owner', async () => {
    const kv = mocks.keyValue as ReturnType<typeof createMemoryKeyValueStore>;
    const dayKey = `agi:chat-files:daily-bytes:${OWNER}:${new Date(systemTimeMs).toISOString().slice(0, 10)}`;
    await kv.increment(dayKey, 40 * MIB);

    const response = await cancelRequest();

    expect(response.status).toBe(200);
    expect(await intakeOf(response)).toMatchObject({ id: INTAKE_ID, cancelReason: 'client' });
    expect(store.row(INTAKE_ID)).toMatchObject({ state: 'cancelled', cancelReason: 'client' });
    expect(mocks.depsFor).toHaveBeenCalledWith(expect.anything(), OWNER);
    expect(await kv.get<number>(dayKey)).toBe(10 * MIB);
  });

  it('answers a second cancel with the cancelled intake again', async () => {
    await cancelRequest();

    const again = await cancelRequest();

    expect(again.status).toBe(200);
    expect(await intakeOf(again)).toMatchObject({ cancelReason: 'client' });
  });

  it('answers a sealing intake as it stands, leaving it to finish', async () => {
    store.put(
      intakeRow({ state: 'sealing', workflowRunId: 'run-a', sealingEnteredAt: systemTimeMs }),
    );

    const response = await cancelRequest();

    expect(response.status).toBe(200);
    expect(store.row(INTAKE_ID).state).toBe('sealing');
  });

  it('refuses another person with 404 and leaves the intake alone', async () => {
    signedInAs('user-intruder');

    expect((await cancelRequest()).status).toBe(404);
    expect(store.row(INTAKE_ID).state).toBe('awaiting_parts');
  });

  it('refuses a request that fails the CSRF check before touching the intake', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    expect((await cancelRequest()).status).toBe(403);
    expect(store.row(INTAKE_ID).state).toBe('awaiting_parts');
  });

  it('answers 404 on a database without the intake tables and cancels nothing', async () => {
    const delegate = createQueryDb(async () => []);
    signedInAs(OWNER, createSchemaAbsentDb(delegate.db));

    expect((await cancelRequest()).status).toBe(404);
    expect(mocks.depsFor).not.toHaveBeenCalled();
  });
});
