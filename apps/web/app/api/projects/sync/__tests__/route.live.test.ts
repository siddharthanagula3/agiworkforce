// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { PostgresDatabaseAdapter, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { ProjectsSyncPushResponseSchema } from '@agiworkforce/cloud-contracts';
import { afterAll, describe, expect, it, vi } from 'vitest';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type LoggerModule = typeof import('@/lib/logger');
type CorsModule = typeof import('@/lib/cors');

const liveDatabaseUrl = process.env['AGI_LIVE_DATABASE_URL'] ?? '';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackDatabase(connectionString: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(connectionString).hostname);
  } catch {
    return false;
  }
}

const live = isLoopbackDatabase(liveDatabaseUrl);

type RlsDbModule = typeof import('@/lib/server/rls-db');

const scope = vi.hoisted(() => ({ db: null as DatabaseAdapter | null, userId: '' }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: scope.db,
    userId: scope.userId,
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => ({ plan_tier: 'free' })) },
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<CorsModule>()),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { POST } = await import('../route');

class RollBack extends Error {}

const database = live ? new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl }) : null;

afterAll(async () => {
  await database?.dispose();
});

function joined(tx: DatabaseAdapter): DatabaseAdapter {
  return {
    query: (sql, params) => tx.query(sql, params),
    execute: (sql, params) => tx.execute(sql, params),
    transaction: (run) => run(tx),
    withUser: (token) => tx.withUser(token),
    withOrg: (organizationId) => tx.withOrg(organizationId),
    dispose: () => tx.dispose(),
  };
}

async function inRolledBackTransaction(
  run: (
    push: (project: Record<string, unknown>) => Promise<Response>,
    stored: (id: string) => Promise<StoredProject | undefined>,
  ) => Promise<void>,
): Promise<void> {
  scope.userId = `qa-projects-sync-${randomUUID()}`;
  await database!
    .transaction(async (tx) => {
      scope.db = joined(tx);
      await run(
        (project) =>
          POST(
            new NextRequest('https://agiworkforce.com/api/projects/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projects: [project] }),
            }),
          ),
        async (id) =>
          (
            await tx.query<StoredProject>(
              `select name, instructions, deleted_at is not null as "deleted",
                      server_version::text as "serverVersion"
                 from public.user_projects
                where id = $1 and user_id = $2`,
              [id, scope.userId],
            )
          )[0],
      );
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    })
    .finally(() => {
      scope.db = null;
    });
}

interface StoredProject {
  name: string;
  instructions: string | null;
  deleted: boolean;
  serverVersion: string;
}

async function appliedVersion(response: Response, id: string): Promise<string> {
  expect(response.status).toBe(200);
  const body = ProjectsSyncPushResponseSchema.parse(await response.json());
  expect(body.conflicts).toEqual([]);
  const applied = body.applied.find((row) => row.id === id);
  expect(applied).toBeDefined();
  return applied!.server_version;
}

// llm-guardrail-allow: needs a loopback AGI_LIVE_DATABASE_URL at a migrated Postgres, which ci.yml js-verify sets for its test step; every case rolls its transaction back.
describe.skipIf(!live)('projects sync push against the real statement', () => {
  it('stores a new project, an edit to it and its deletion tombstone', async () => {
    await inRolledBackTransaction(async (push, stored) => {
      const id = randomUUID();

      const created = await appliedVersion(
        await push({ id, name: 'Launch notes', instructions: 'Keep it short', baseVersion: '0' }),
        id,
      );
      expect(await stored(id)).toEqual({
        name: 'Launch notes',
        instructions: 'Keep it short',
        deleted: false,
        serverVersion: created,
      });

      const edited = await appliedVersion(
        await push({
          id,
          name: 'Launch plan',
          instructions: 'Keep it short',
          baseVersion: created,
        }),
        id,
      );
      expect(BigInt(edited)).toBeGreaterThan(BigInt(created));
      expect((await stored(id))?.name).toBe('Launch plan');

      const removed = await appliedVersion(
        await push({
          id,
          name: 'Launch plan',
          baseVersion: edited,
          deletedAt: '2026-11-14T00:00:00Z',
        }),
        id,
      );
      expect(BigInt(removed)).toBeGreaterThan(BigInt(edited));
      expect((await stored(id))?.deleted).toBe(true);
    });
  });

  it('counts a restored tombstone against the project limit through the same statement', async () => {
    await inRolledBackTransaction(async (push, stored) => {
      const id = randomUUID();
      const created = await appliedVersion(
        await push({ id, name: 'Restore me', baseVersion: '0' }),
        id,
      );
      const removed = await appliedVersion(
        await push({
          id,
          name: 'Restore me',
          baseVersion: created,
          deletedAt: '2026-11-14T00:00:00Z',
        }),
        id,
      );

      await appliedVersion(await push({ id, name: 'Restore me', baseVersion: removed }), id);
      expect((await stored(id))?.deleted).toBe(false);
    });
  });
});
