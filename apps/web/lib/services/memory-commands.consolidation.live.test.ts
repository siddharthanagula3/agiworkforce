// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { PostgresDatabaseAdapter, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterAll, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');

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

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { runMemoryCommand } = await import('./memory-commands');
const { SAVE_MEMORY_TOOL_NAME, executeMemoryTool } =
  await import('@/lib/server/tools/memory-tools');

class RollBack extends Error {}

const database = live ? new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl }) : null;

afterAll(async () => {
  await database?.dispose();
});

async function forMemoryUser(run: (tx: DatabaseAdapter, userId: string) => Promise<void>) {
  const userId = `qa-memory-consolidation-${randomUUID()}`;
  await database!
    .transaction(async (tx) => {
      await tx.execute(
        `insert into public.user_settings (user_id, settings) values ($1, $2::jsonb)`,
        [
          userId,
          JSON.stringify({ capabilities: { memory: true, allowToolAssistedGeneration: true } }),
        ],
      );
      await run(tx, userId);
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });
}

async function activeMemories(tx: DatabaseAdapter, userId: string): Promise<string[]> {
  const rows = await tx.query<{ content: string }>(
    `select content
       from public.user_memories
      where user_id = $1 and is_deleted = false and superseded_by is null
      order by created_at`,
    [userId],
  );
  return rows.map((row) => row.content);
}

// llm-guardrail-allow: needs a loopback AGI_LIVE_DATABASE_URL at a migrated Postgres, which ci.yml js-verify sets for its test step; every case rolls its transaction back.
describe.skipIf(!live)('one remembered statement against the real memory writer', () => {
  it('keeps one memory when the model saves in the third person what the person asked to remember', async () => {
    await forMemoryUser(async (tx, userId) => {
      const scope = { userId, organizationId: null, source: 'mobile' };
      const explicit = await runMemoryCommand(tx, scope, {
        message: 'remember my favorite color is teal',
      });
      expect(explicit?.kind === 'remember' && explicit.outcome.status).toBe('stored');

      const saved = await executeMemoryTool(
        SAVE_MEMORY_TOOL_NAME,
        { fact: "The user's favorite color is teal." },
        { db: tx, userId, organizationId: null, source: 'mobile', temporaryChat: false },
      );

      expect(JSON.parse(saved.content)).toMatchObject({ saved: false, alreadyKnown: true });
      expect(await activeMemories(tx, userId)).toHaveLength(1);
    });
  });

  it('still keeps two different statements about the same person apart', async () => {
    await forMemoryUser(async (tx, userId) => {
      const scope = { userId, organizationId: null, source: 'mobile' };
      await runMemoryCommand(tx, scope, { message: 'remember my favorite color is teal' });
      await executeMemoryTool(
        SAVE_MEMORY_TOOL_NAME,
        { fact: "The user's favorite food is ramen." },
        { db: tx, userId, organizationId: null, source: 'mobile', temporaryChat: false },
      );

      expect(await activeMemories(tx, userId)).toHaveLength(2);
    });
  });
});
