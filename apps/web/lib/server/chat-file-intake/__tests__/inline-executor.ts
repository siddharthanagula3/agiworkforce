import { createHash } from 'node:crypto';

import {
  MemoryObjectStore,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_BUCKET_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_PRIVATE_BUCKET_ENV,
  OBJECT_STORAGE_PROVIDER_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
} from '@agiworkforce/object-storage';
import { vi } from 'vitest';

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { getObjectStore } from '@/lib/server/object-storage-runtime';
import type { SealCommitOutcome, SealDeps } from '../seal';
import { runChatFileIntakeStep, type ChatFileIntakeDeps } from '../steps';
import type { ChatFileIntakeRow } from '../store';
import { defaultIntakeObjects, type ChatFileIntakeDirective } from '../transitions';
import type { FakeScanner } from './fake-scanner';
import { createMemoryIntakeStore, type MemoryIntakeStore } from './memory-intake-store';

export const PRIVATE_BUCKET = 'chat-intake-private-test';
export const START_MS = Date.parse('2026-11-15T09:00:00.000Z');

export interface FakeClock {
  now(): number;
  advance(ms: number): void;
}

export function createFakeClock(startMs: number = START_MS): FakeClock {
  let current = startMs;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    },
  };
}

export function stubMemoryObjectStorage(): void {
  vi.stubEnv(OBJECT_STORAGE_PROVIDER_ENV, 'memory');
  vi.stubEnv(OBJECT_STORAGE_ENDPOINT_ENV, 'http://127.0.0.1:1');
  vi.stubEnv(OBJECT_STORAGE_ACCESS_KEY_ID_ENV, 'test-access-key');
  vi.stubEnv(OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV, 'test-secret-key');
  vi.stubEnv(OBJECT_STORAGE_BUCKET_ENV, 'chat-intake-public-test');
  vi.stubEnv(OBJECT_STORAGE_PRIVATE_BUCKET_ENV, PRIVATE_BUCKET);
  memoryObjectStore().clear();
}

export function memoryObjectStore(): MemoryObjectStore {
  const store = getObjectStore();
  if (!(store instanceof MemoryObjectStore)) throw new Error('The test store is not in memory.');
  return store;
}

/** A PDF of `byteCount` bytes that passes the structural and credential checks. */
export function pdfBytes(byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount).fill(0x61);
  bytes.set(new TextEncoder().encode('%PDF-1.7\n'), 0);
  return bytes;
}

export async function putStagedFile(
  row: ChatFileIntakeRow,
  bytes: Uint8Array = pdfBytes(row.byteCount),
): Promise<{ etag: string; sha256: string }> {
  await memoryObjectStore().put({
    bucket: PRIVATE_BUCKET,
    key: row.stagingKey,
    body: bytes,
    contentType: row.mimeType,
  });
  const head = await memoryObjectStore().head(PRIVATE_BUCKET, row.stagingKey);
  return {
    etag: head?.etag ?? '',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function objectExists(key: string): Promise<boolean> {
  return (await memoryObjectStore().head(PRIVATE_BUCKET, key)) !== null;
}

export interface MemoryMediaRow {
  id: string;
  userId: string;
  contentSha256: string;
  scannedSha256: string;
  storagePathname: string;
  byteSize: number;
  metadata: Record<string, unknown>;
}

export interface MemorySeal extends SealDeps {
  media: MemoryMediaRow[];
  storageFull: boolean;
}

/** The seal's transaction in memory: the media row is kept only when the intake seals with it. */
export function createMemorySeal(store: MemoryIntakeStore): MemorySeal {
  const seal: MemorySeal = {
    media: [],
    storageFull: false,
    async findAssetByHash(row, sha256) {
      return (
        seal.media.find((asset) => asset.userId === row.userId && asset.contentSha256 === sha256)
          ?.id ?? null
      );
    },
    async storageAvailable() {
      return !seal.storageFull;
    },
    async commit({ row, runId, verdict, sealedKey, nowMs }): Promise<SealCommitOutcome> {
      const current = store.rows.get(row.id);
      if (!current || current.state !== 'sealing' || current.workflowRunId !== runId) {
        return 'not_held';
      }
      const id = `0000000${seal.media.length + 1}-0000-4000-8000-000000000000`.slice(-36);
      seal.media.push({
        id,
        userId: row.userId,
        contentSha256: verdict.sha256,
        scannedSha256: verdict.sha256,
        storagePathname: sealedKey,
        byteSize: row.byteCount,
        metadata: { source: 'chat-attachment', filename: row.fileName },
      });
      store.put({
        ...current,
        state: 'sealed',
        mediaAssetId: id,
        leaseUntil: null,
        stateChangedAt: nowMs,
      });
      return 'sealed';
    },
    async attach({ row, runId, assetId, nowMs }) {
      const current = store.rows.get(row.id);
      if (!current || current.state !== 'sealing' || current.workflowRunId !== runId) {
        return 'not_held';
      }
      store.put({
        ...current,
        state: 'sealed',
        mediaAssetId: assetId,
        leaseUntil: null,
        stateChangedAt: nowMs,
      });
      return 'sealed';
    },
  };
  return seal;
}

export interface IntakeHarness {
  deps: ChatFileIntakeDeps;
  clock: FakeClock;
  store: MemoryIntakeStore;
  seal: MemorySeal;
  presignGet: ReturnType<typeof vi.fn>;
  reindexed: string[];
}

export function createIntakeHarness(input: {
  scanner: FakeScanner;
  rows?: ChatFileIntakeRow[];
  clock?: FakeClock;
  overrides?: Partial<ChatFileIntakeDeps>;
}): IntakeHarness {
  const clock = input.clock ?? createFakeClock();
  const store = createMemoryIntakeStore(input.rows ?? []);
  const seal = createMemorySeal(store);
  const presignGet = vi.fn(
    async ({ key, expiresInSeconds }: { key: string; expiresInSeconds: number }) =>
      `https://storage.test/${PRIVATE_BUCKET}/${key}?X-Amz-Expires=${expiresInSeconds}`,
  );
  const reindexed: string[] = [];
  const deps: ChatFileIntakeDeps = {
    store,
    objects: { ...defaultIntakeObjects(), presignGet },
    now: clock.now,
    scanner: input.scanner.options,
    policy: CHAT_LARGE_FILE_POLICY,
    inspectContent: async () => 'allowed',
    seal,
    prepare: async () => ({ done: true }),
    async reindex(_row, assetId) {
      reindexed.push(assetId);
    },
    ...input.overrides,
  };
  return { deps, clock, store, seal, presignGet, reindexed };
}

export interface InlineRun {
  directives: ChatFileIntakeDirective[];
  sleeps: number[];
  last: ChatFileIntakeDirective;
}

/**
 * The workflow's loop run in this process: each directive is one step, and a
 * sleep moves the fake clock instead of waiting. `onSleep` sees the clock
 * after each wake, before the next step runs.
 */
export async function runInline(
  harness: IntakeHarness,
  input: {
    intakeId: string;
    runId: string;
    from?: ChatFileIntakeDirective;
    maxSteps?: number;
    onSleep?: (sleptMs: number) => void | Promise<void>;
  },
): Promise<InlineRun> {
  const longestSleepMs = harness.deps.policy.intake.scanGiveUpMs;
  const directives: ChatFileIntakeDirective[] = [];
  const sleeps: number[] = [];
  let directive: ChatFileIntakeDirective = input.from ?? { next: 'start' };
  for (let step = 0; step < (input.maxSteps ?? 2_000); step += 1) {
    const sleepMs = 'sleepMs' in directive ? (directive.sleepMs ?? 0) : 0;
    if (sleepMs > 0) {
      const slept = Math.min(sleepMs, longestSleepMs);
      sleeps.push(slept);
      harness.clock.advance(slept);
      await input.onSleep?.(slept);
    }
    directive = await runChatFileIntakeStep(
      harness.deps,
      { intakeId: input.intakeId, runId: input.runId },
      directive,
    );
    directives.push(directive);
    if (directive.next === 'end') break;
  }
  return { directives, sleeps, last: directive };
}
