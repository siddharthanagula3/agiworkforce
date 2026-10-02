import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { PostgresDatabaseAdapter, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterAll, describe, expect, it, vi } from 'vitest';

type RlsDbModule = typeof import('@/lib/server/rls-db');
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

const live =
  process.env['AGI_TEST_LIVE_CONVERSATION_DRAFTS'] === '1' && isLoopbackDatabase(liveDatabaseUrl);

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

const { PUT } = await import('./route');

const STORED_MICROSECOND_REVISION = '2026-10-02 05:07:11.629123+00';
const REVISION_THE_CLIENT_WAS_SHOWN = '2026-10-02T05:07:11.629Z';

class RollBack extends Error {}

const database = live ? new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl }) : null;

afterAll(async () => {
  await database?.dispose();
});

interface StoredRow {
  draft: string | null;
  revision: string | null;
  serverVersion: string;
}

async function inConversation(
  stored: { draft: string | null; revision: string | null },
  run: (
    send: (body: unknown) => Promise<Response>,
    readRow: () => Promise<StoredRow | undefined>,
  ) => Promise<void>,
): Promise<void> {
  const conversationId = randomUUID();
  scope.userId = `qa-draft-revision-${randomUUID()}`;
  await database!
    .transaction(async (tx) => {
      await tx.execute(
        `insert into public.web_conversations (id, user_id, draft, draft_updated_at)
         values ($1, $2, $3, $4::timestamptz)`,
        [conversationId, scope.userId, stored.draft, stored.revision],
      );
      scope.db = tx;
      await run(
        (body) =>
          PUT(
            new NextRequest(`https://agiworkforce.com/api/chat/conversations/${conversationId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
            { params: Promise.resolve({ id: conversationId }) },
          ),
        async () =>
          (
            await tx.query<StoredRow>(
              `select draft,
                      draft_updated_at::text as "revision",
                      server_version::text as "serverVersion"
                 from public.web_conversations
                where id = $1`,
              [conversationId],
            )
          )[0],
      );
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });
}

// llm-guardrail-allow: needs AGI_TEST_LIVE_CONVERSATION_DRAFTS=1 and a loopback AGI_LIVE_DATABASE_URL, which ci.yml js-verify sets for its migrated Postgres.
describe.skipIf(!live)('draft revisions against Postgres timestamps', () => {
  it('saves over the revision the client was shown, though Postgres stored microseconds', async () => {
    await inConversation(
      { draft: 'first thought', revision: STORED_MICROSECOND_REVISION },
      async (send) => {
        const response = await send({
          draft: 'second thought',
          draftUpdatedAt: REVISION_THE_CLIENT_WAS_SHOWN,
        });

        expect(response.status).toBe(200);
        const body = (await response.json()) as { saved: boolean; draftUpdatedAt: string };
        expect(body.saved).toBe(true);
        expect(Date.parse(body.draftUpdatedAt)).toBeGreaterThan(
          Date.parse(REVISION_THE_CLIENT_WAS_SHOWN),
        );
      },
    );
  });

  it('lets the next save build on the revision the first save returned', async () => {
    await inConversation({ draft: null, revision: null }, async (send) => {
      const first = (await (await send({ draft: 'a', draftUpdatedAt: null })).json()) as {
        draftUpdatedAt: string;
      };

      const second = await send({ draft: 'ab', draftUpdatedAt: first.draftUpdatedAt });

      expect(second.status).toBe(200);
    });
  });

  it('stamps no revision and writes nothing for an empty draft that stays empty', async () => {
    await inConversation({ draft: null, revision: null }, async (send, readRow) => {
      const before = await readRow();

      const response = await send({ draft: '', draftUpdatedAt: null });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: true, draftUpdatedAt: null });
      expect(await readRow()).toEqual(before);
    });
  });

  it('leaves the row and its sync version alone when the text did not change', async () => {
    await inConversation(
      { draft: 'same words', revision: STORED_MICROSECOND_REVISION },
      async (send, readRow) => {
        const before = await readRow();

        const response = await send({
          draft: 'same words',
          draftUpdatedAt: REVISION_THE_CLIENT_WAS_SHOWN,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          saved: true,
          draftUpdatedAt: REVISION_THE_CLIENT_WAS_SHOWN,
        });
        expect(await readRow()).toEqual(before);
      },
    );
  });

  it('answers a stale save of the text already stored with its revision, writing nothing', async () => {
    await inConversation(
      { draft: 'same words', revision: STORED_MICROSECOND_REVISION },
      async (send, readRow) => {
        const before = await readRow();

        const response = await send({ draft: 'same words', draftUpdatedAt: null });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          saved: true,
          draftUpdatedAt: REVISION_THE_CLIENT_WAS_SHOWN,
        });
        expect(await readRow()).toEqual(before);
      },
    );
  });

  it('still refuses different text written over a revision the client never saw', async () => {
    await inConversation(
      { draft: 'their words', revision: STORED_MICROSECOND_REVISION },
      async (send) => {
        const response = await send({
          draft: 'my words',
          draftUpdatedAt: '2026-10-02T05:07:10.000Z',
        });

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
          saved: false,
          conflict: true,
          current: { draft: 'their words', draftUpdatedAt: REVISION_THE_CLIENT_WAS_SHOWN },
        });
      },
    );
  });
});
