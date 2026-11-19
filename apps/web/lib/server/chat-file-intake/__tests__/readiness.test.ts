// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';

import { createQueryDb } from './fake-query-db';
import { PROTOCOL_2, SCANNER_ENV } from './fake-scanner';
import { createSchemaAbsentDb } from './schema-absent-db';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type ReadinessModule = typeof import('../readiness');

const READY_SCHEMA_ROW = {
  intakes_table: true,
  preparations_table: true,
  scanned_sha256_column: true,
};
const NATIVE_REQUEST_URL = 'https://app.example.com/api/me';
const PREVIEW_ORIGIN = 'https://preview-chat-files.example.app';

function readyDb() {
  return createQueryDb(async () => [READY_SCHEMA_ROW]);
}

function capabilityFetch(body: Record<string, unknown> = PROTOCOL_2.answers['capability']!.body) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

function nativeRequest(): Request {
  return new Request(NATIVE_REQUEST_URL);
}

function previewBrowserRequest(): Request {
  return new Request(`${PREVIEW_ORIGIN}/api/me`, { headers: { origin: PREVIEW_ORIGIN } });
}

async function freshReadiness(): Promise<ReadinessModule> {
  vi.resetModules();
  return import('../readiness');
}

describe('readChatLargeFileReadiness', () => {
  let store: KeyValueStore;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', 'on');
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', SCANNER_ENV.UPLOAD_SCAN_WEBHOOK_URL);
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_TOKEN', SCANNER_ENV.UPLOAD_SCAN_WEBHOOK_TOKEN);
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    store = createMemoryKeyValueStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is ready when the flag, plan, origin, schema and scanner all answer', async () => {
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();
    const fetch = capabilityFetch();

    const readiness = await readChatLargeFileReadiness(
      { request: nativeRequest(), db, planTier: 'pro' },
      { fetch, store },
    );

    expect(readiness).toEqual({
      ready: true,
      maxSourceScanBytes: PROTOCOL_2.answers['capability']!.body['maxSourceScanBytes'],
    });
  });

  it.each([undefined, '', 'off', 'ON', 'true', '1'])(
    'with the flag set to %s no query and no fetch is made',
    async (flag) => {
      if (flag === undefined) vi.stubEnv('CHAT_LARGE_FILES_ENABLED', undefined);
      else vi.stubEnv('CHAT_LARGE_FILES_ENABLED', flag);
      const { readChatLargeFileReadiness } = await freshReadiness();
      const { db, query } = readyDb();
      const fetch = capabilityFetch();

      const readiness = await readChatLargeFileReadiness(
        { request: nativeRequest(), db, planTier: 'pro' },
        { fetch, store },
      );

      expect(readiness).toEqual({ ready: false, missing: 'flag' });
      expect(query).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['free', 'no-such-plan', null])(
    'stops at the plan for %s, before the schema or the scanner is asked',
    async (planTier) => {
      const { readChatLargeFileReadiness } = await freshReadiness();
      const { db, query } = readyDb();
      const fetch = capabilityFetch();

      const readiness = await readChatLargeFileReadiness(
        { request: nativeRequest(), db, planTier },
        { fetch, store },
      );

      expect(readiness).toEqual({ ready: false, missing: 'plan' });
      expect(query).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('stops at the origin for a browser page whose bytes storage would refuse', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db, query } = readyDb();
    const fetch = capabilityFetch();

    const readiness = await readChatLargeFileReadiness(
      { request: previewBrowserRequest(), db, planTier: 'pro' },
      { fetch, store },
    );

    expect(readiness).toEqual({ ready: false, missing: 'origin' });
    expect(query).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes the origin for a preview page the storage CORS rule lists', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', PREVIEW_ORIGIN);
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();

    const readiness = await readChatLargeFileReadiness(
      { request: previewBrowserRequest(), db, planTier: 'pro' },
      { fetch: capabilityFetch(), store },
    );

    expect(readiness.ready).toBe(true);
  });

  it('stops at the schema on a database without the intake tables, sending it nothing else', async () => {
    const { readChatLargeFileReadiness } = await freshReadiness();
    const delegate = createQueryDb(async () => []);
    const fetch = capabilityFetch();

    const readiness = await readChatLargeFileReadiness(
      { request: nativeRequest(), db: createSchemaAbsentDb(delegate.db), planTier: 'pro' },
      { fetch, store },
    );

    expect(readiness).toEqual({ ready: false, missing: 'schema' });
    expect(delegate.query).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('treats a schema probe that fails as not ready', async () => {
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = createQueryDb(async () => {
      throw new Error('connection reset');
    });

    const readiness = await readChatLargeFileReadiness(
      { request: nativeRequest(), db, planTier: 'pro' },
      { fetch: capabilityFetch(), store },
    );

    expect(readiness).toEqual({ ready: false, missing: 'schema' });
  });

  it('stops at the scanner when it answers protocol 1', async () => {
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();

    const readiness = await readChatLargeFileReadiness(
      { request: nativeRequest(), db, planTier: 'pro' },
      {
        fetch: capabilityFetch({ protocol: 1, maxSourceScanBytes: 1, queueDepth: 0, running: 0 }),
        store,
      },
    );

    expect(readiness).toEqual({ ready: false, missing: 'scanner' });
  });

  it('stops at the scanner when none is configured', async () => {
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', '');
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();
    const fetch = capabilityFetch();

    const readiness = await readChatLargeFileReadiness(
      { request: nativeRequest(), db, planTier: 'pro' },
      { fetch, store },
    );

    expect(readiness).toEqual({ ready: false, missing: 'scanner' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks the scanner once a minute per instance, a negative answer included', async () => {
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();
    const fetch = vi.fn(async () => new Response('{}', { status: 503 }));
    let nowMs = 1_000_000;
    const deps = { fetch, store: null, now: () => nowMs };
    const input = { request: nativeRequest(), db, planTier: 'pro' };

    expect((await readChatLargeFileReadiness(input, deps)).ready).toBe(false);
    nowMs += 59_000;
    expect((await readChatLargeFileReadiness(input, deps)).ready).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockImplementation(capabilityFetch());
    nowMs += 2_000;
    expect((await readChatLargeFileReadiness(input, deps)).ready).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sends one capability read for concurrent callers on a cold instance', async () => {
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();
    const answers: Array<(response: Response) => void> = [];
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answers.push(resolve);
        }),
    );
    const input = { request: nativeRequest(), db, planTier: 'pro' };

    const reads = Array.from({ length: 6 }, () =>
      readChatLargeFileReadiness(input, { fetch, store }),
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const answer of answers) {
      answer(new Response(JSON.stringify(PROTOCOL_2.answers['capability']!.body), { status: 200 }));
    }
    const results = await Promise.all(reads);

    expect(results.every((readiness) => readiness.ready)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks again once a shared read has settled and its answer has expired', async () => {
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();
    let nowMs = 1_000_000;
    const fetch = vi.fn(async () => new Response('{}', { status: 503 }));
    const deps = { fetch, store: null, now: () => nowMs };
    const input = { request: nativeRequest(), db, planTier: 'pro' };

    await Promise.all([
      readChatLargeFileReadiness(input, deps),
      readChatLargeFileReadiness(input, deps),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);

    nowMs += 61_000;
    fetch.mockImplementation(capabilityFetch());
    expect((await readChatLargeFileReadiness(input, deps)).ready).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('lets a cold instance take the answer another instance shared, without a fetch', async () => {
    const first = await freshReadiness();
    const { db } = readyDb();
    const input = { request: nativeRequest(), db, planTier: 'pro' };
    await first.readChatLargeFileReadiness(input, { fetch: capabilityFetch(), store });

    const cold = await freshReadiness();
    const fetch = capabilityFetch();
    const readiness = await cold.readChatLargeFileReadiness(input, { fetch, store });

    expect(readiness.ready).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps a shared answer only until the minute after the scanner gave it', async () => {
    let nowMs = 1_000_000;
    const first = await freshReadiness();
    const { db } = readyDb();
    const input = { request: nativeRequest(), db, planTier: 'pro' };
    await first.readChatLargeFileReadiness(input, {
      fetch: vi.fn(async () => new Response('{}', { status: 503 })),
      store,
      now: () => nowMs,
    });

    const cold = await freshReadiness();
    const fetch = capabilityFetch();
    const deps = { fetch, store, now: () => nowMs };
    nowMs += 50_000;
    expect(await cold.readChatLargeFileReadiness(input, deps)).toEqual({
      ready: false,
      missing: 'scanner',
    });
    expect(fetch).not.toHaveBeenCalled();

    nowMs += 15_000;
    expect((await cold.readChatLargeFileReadiness(input, deps)).ready).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores a shared answer that carries no expiry and asks the scanner', async () => {
    await store.set(
      'agi:chat-files:scanner-capability',
      { capability: PROTOCOL_2.answers['capability']!.body },
      { ttlMilliseconds: 60_000 },
    );
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();
    const fetch = capabilityFetch();

    const readiness = await readChatLargeFileReadiness(
      { request: nativeRequest(), db, planTier: 'pro' },
      { fetch, store },
    );

    expect(readiness.ready).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores a shared answer that is not a protocol 2 capability and asks the scanner', async () => {
    await store.set(
      'agi:chat-files:scanner-capability',
      { capability: { protocol: 1, maxSourceScanBytes: 10 }, expiresAt: Date.now() + 60_000 },
      { ttlMilliseconds: 60_000 },
    );
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();
    const fetch = capabilityFetch();

    const readiness = await readChatLargeFileReadiness(
      { request: nativeRequest(), db, planTier: 'pro' },
      { fetch, store },
    );

    expect(readiness.ready).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('still answers when the shared store fails', async () => {
    const { readChatLargeFileReadiness } = await freshReadiness();
    const { db } = readyDb();
    const failing = Object.create(store) as KeyValueStore;
    failing.get = vi.fn(async () => {
      throw new Error('kv down');
    });
    failing.set = vi.fn(async () => {
      throw new Error('kv down');
    });

    const readiness = await readChatLargeFileReadiness(
      { request: nativeRequest(), db, planTier: 'pro' },
      { fetch: capabilityFetch(), store: failing },
    );

    expect(readiness.ready).toBe(true);
  });
});

describe('chatLargeFilesMayBeOffered', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', 'on');
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', '');
    vi.stubEnv('VERCEL_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers yes for a paid plan from a caller that can reach storage', async () => {
    const { chatLargeFilesMayBeOffered } = await freshReadiness();
    expect(chatLargeFilesMayBeOffered({ request: nativeRequest(), planTier: 'pro' })).toBe(true);
  });

  it('answers no with the flag off', async () => {
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', '');
    const { chatLargeFilesMayBeOffered } = await freshReadiness();
    expect(chatLargeFilesMayBeOffered({ request: nativeRequest(), planTier: 'pro' })).toBe(false);
  });

  it.each(['free', 'no-such-plan', null])('answers no for the plan %s', async (planTier) => {
    const { chatLargeFilesMayBeOffered } = await freshReadiness();
    expect(chatLargeFilesMayBeOffered({ request: nativeRequest(), planTier })).toBe(false);
  });

  it('answers no for a browser page whose bytes storage would refuse', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { chatLargeFilesMayBeOffered } = await freshReadiness();
    expect(chatLargeFilesMayBeOffered({ request: previewBrowserRequest(), planTier: 'pro' })).toBe(
      false,
    );
  });
});
