import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  assertResolvedPublicHostname: vi.fn(async () => undefined),
  sealEnvelope: vi.fn(() => 'sealed-secret'),
  platformTenantRing: vi.fn(() => ({})),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: vi.fn() }));
vi.mock('@/lib/egress-policy', () => ({
  EgressPolicyError: class EgressPolicyError extends Error {},
  assertResolvedPublicHostname: mocks.assertResolvedPublicHostname,
  pinnedPublicFetch: vi.fn(),
}));
vi.mock('@/lib/crypto/envelope', () => ({
  openEnvelope: vi.fn(),
  sealEnvelope: mocks.sealEnvelope,
}));
vi.mock('@/lib/server/organization-encryption-keys', () => ({
  platformTenantRing: mocks.platformTenantRing,
}));

import {
  DEVELOPER_WEBHOOK_ENDPOINT_LIMIT,
  createWebhookEndpoint,
} from '../developer-webhook-service';

const USER_ID = 'webhook-owner';
const INPUT = {
  url: 'https://example.com/hooks',
  description: null,
  eventTypes: ['api_key.created' as const],
};

interface EndpointRecord {
  id: string;
  url: string;
  description: string | null;
  event_types: string[];
  secret_prefix: string;
  enabled: boolean;
  created_at: string;
}

function createFakeDatabase(initialCount: number) {
  const rows: EndpointRecord[] = Array.from({ length: initialCount }, (_, index) => ({
    id: `seed-${index}`,
    url: `https://example.com/seed-${index}`,
    description: null,
    event_types: ['api_key.created'],
    secret_prefix: 'whsec_seed',
    enabled: true,
    created_at: '2026-11-09T00:00:00.000Z',
  }));
  const statements: string[] = [];
  let ownerLockTail: Promise<void> = Promise.resolve();

  const transactionAdapter = (releases: Array<() => void>) =>
    ({
      query: async (sql: string, params: unknown[] = []) => {
        statements.push(sql);
        if (sql.includes('pg_advisory_xact_lock')) {
          const previous = ownerLockTail;
          let release!: () => void;
          ownerLockTail = new Promise<void>((resolve) => {
            release = resolve;
          });
          releases.push(release);
          await previous;
          return [{ locked: true }];
        }
        if (sql.includes('count(*)')) {
          const total = rows.length;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          return [{ total }];
        }
        if (sql.includes('insert into public.developer_webhook_endpoints')) {
          const row: EndpointRecord = {
            id: String(params[0]),
            url: String(params[2]),
            description: params[3] as string | null,
            event_types: params[4] as string[],
            secret_prefix: String(params[6]),
            enabled: true,
            created_at: '2026-11-09T00:00:01.000Z',
          };
          rows.push(row);
          return [row];
        }
        throw new Error(`unexpected statement: ${sql}`);
      },
      execute: async () => 0,
      transaction: async () => {
        throw new Error('nested transactions are not supported');
      },
    }) as unknown as DatabaseAdapter;

  const db = {
    query: async () => {
      throw new Error('create must run inside one transaction');
    },
    execute: async () => 0,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => {
      const releases: Array<() => void> = [];
      try {
        return await fn(transactionAdapter(releases));
      } finally {
        for (const release of releases) release();
      }
    },
  } as unknown as DatabaseAdapter;

  return { db, rows, statements };
}

describe('createWebhookEndpoint admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admits exactly one of two concurrent creates at the endpoint limit minus one', async () => {
    const { db, rows } = createFakeDatabase(DEVELOPER_WEBHOOK_ENDPOINT_LIMIT - 1);

    const results = await Promise.allSettled([
      createWebhookEndpoint(db, USER_ID, INPUT),
      createWebhookEndpoint(db, USER_ID, INPUT),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { message: expect.stringContaining(`${DEVELOPER_WEBHOOK_ENDPOINT_LIMIT} endpoints`) },
    });
    expect(rows).toHaveLength(DEVELOPER_WEBHOOK_ENDPOINT_LIMIT);
  });

  it('locks the owner before counting and inserting, and returns the signing secret once', async () => {
    const { db, statements } = createFakeDatabase(0);

    const created = await createWebhookEndpoint(db, USER_ID, INPUT);

    expect(statements[0]).toContain('pg_advisory_xact_lock');
    expect(statements[1]).toContain('count(*)');
    expect(statements[2]).toContain('insert into public.developer_webhook_endpoints');
    expect(created.secret).toEqual(expect.any(String));
    expect(created.endpoint.url).toBe('https://example.com/hooks');
  });

  it('refuses at the limit without inserting', async () => {
    const { db, rows, statements } = createFakeDatabase(DEVELOPER_WEBHOOK_ENDPOINT_LIMIT);

    await expect(createWebhookEndpoint(db, USER_ID, INPUT)).rejects.toThrow(
      `${DEVELOPER_WEBHOOK_ENDPOINT_LIMIT} endpoints`,
    );

    expect(rows).toHaveLength(DEVELOPER_WEBHOOK_ENDPOINT_LIMIT);
    expect(statements.some((sql) => sql.includes('insert into'))).toBe(false);
  });
});
