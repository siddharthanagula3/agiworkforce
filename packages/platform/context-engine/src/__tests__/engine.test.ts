import { describe, expect, it, vi } from 'vitest';
import { contextSource } from '@agiworkforce/context';
import { resolveContext, factKey } from '../engine';
import {
  createPostgresContextManifestStore,
  type ContextManifestQueryClient,
} from '../manifest-store';
import { OPEN_ORGANIZATION_CONTEXT_POLICY } from '../permissions';
import type { ContextActor, ContextManifest, ContextSourceLoader } from '../types';

const ACTOR: ContextActor = { userId: 'user_1', organizationId: null, projectId: null };

function memory(id: string, text: string, capturedAt?: string): ReturnType<typeof candidate> {
  return candidate('account_memory', id, text, capturedAt);
}

function candidate(
  sourceClass: 'account_memory' | 'past_chat',
  id: string,
  text: string,
  capturedAt?: string,
) {
  return {
    source: contextSource({
      sourceClass,
      locator: `${sourceClass}/${id}`,
      ...(sourceClass === 'past_chat' ? { authoredBy: 'user' as const } : {}),
      recordId: id,
      ownerUserId: ACTOR.userId,
      ...(capturedAt ? { capturedAt } : {}),
    }),
    text,
  };
}

function loader(overrides: Partial<ContextSourceLoader> & Pick<ContextSourceLoader, 'load'>) {
  return {
    sourceClass: 'account_memory' as const,
    budgetChars: 1_000,
    ...overrides,
  } satisfies ContextSourceLoader;
}

describe('resolveContext', () => {
  it('records every source with counts, budget and scope in one manifest', async () => {
    const resolution = await resolveContext({
      turnId: 'turn_1',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [
        loader({ load: () => [memory('m1', 'ships on fridays')] }),
        loader({
          sourceClass: 'past_chat',
          budgetChars: 10,
          load: () => [candidate('past_chat', 'p1', 'a'.repeat(20))],
        }),
      ],
    });

    expect(resolution.items).toHaveLength(1);
    expect(resolution.manifest.entries.map((entry) => entry.sourceClass)).toEqual([
      'account_memory',
      'past_chat',
    ]);
    const [memoryEntry, pastChatEntry] = resolution.manifest.entries;
    expect(memoryEntry).toMatchObject({
      candidateCount: 1,
      includedCount: 1,
      budgetChars: 1_000,
      budgetUsedChars: 'ships on fridays'.length,
      scope: 'global',
      failed: false,
    });
    expect(pastChatEntry?.includedCount).toBe(0);
    expect(pastChatEntry?.excluded).toEqual([{ reason: 'budget_exhausted', count: 1 }]);
    expect(resolution.manifest.includedCount).toBe(1);
    expect(resolution.manifest.contentDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('drops a fact a higher-priority source already stated', async () => {
    const resolution = await resolveContext({
      turnId: 'turn_2',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      loaders: [
        loader({ load: () => [memory('m1', 'Deploys happen on Fridays.')] }),
        loader({
          sourceClass: 'past_chat',
          load: () => [candidate('past_chat', 'p1', 'deploys happen on fridays')],
        }),
      ],
    });

    expect(resolution.itemsOf('past_chat')).toHaveLength(0);
    expect(resolution.manifest.entries[1]?.excluded).toEqual([
      { reason: 'duplicate_fact', count: 1 },
    ]);
  });

  it('marks a time-sensitive source stale and drops it when the loader says to', async () => {
    const nowMs = Date.parse('2026-09-18T00:00:00.000Z');
    const old = new Date(nowMs - 90 * 86_400_000).toISOString();

    const marked = await resolveContext({
      turnId: 'turn_3',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      nowMs,
      loaders: [loader({ freshnessMs: 86_400_000, load: () => [memory('m1', 'old fact', old)] })],
    });
    expect(marked.items[0]?.stale).toBe(true);
    expect(marked.manifest.entries[0]?.staleCount).toBe(1);

    const dropped = await resolveContext({
      turnId: 'turn_4',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      nowMs,
      loaders: [
        loader({
          freshnessMs: 86_400_000,
          dropStale: true,
          load: () => [memory('m1', 'old fact', old)],
        }),
      ],
    });
    expect(dropped.items).toHaveLength(0);
    expect(dropped.manifest.entries[0]?.excluded).toEqual([{ reason: 'stale', count: 1 }]);
  });

  it('records a loader that threw instead of failing the whole turn', async () => {
    const onLoaderError = vi.fn();
    const resolution = await resolveContext({
      turnId: 'turn_5',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      onLoaderError,
      loaders: [
        loader({
          load: () => {
            throw new Error('index unavailable');
          },
        }),
      ],
    });

    expect(resolution.manifest.entries[0]?.failed).toBe(true);
    expect(onLoaderError).toHaveBeenCalledWith('account_memory', expect.any(Error));
  });

  it('refetches a written manifest by turn id and never stores the content', async () => {
    const rows: Record<string, unknown>[] = [];
    const db: ContextManifestQueryClient = {
      async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        if (sql.includes('insert into')) {
          rows.push({
            turn_id: params[0],
            user_id: params[1],
            organization_id: params[2],
            project_id: params[3],
            created_at: params[4],
            included_count: params[5],
            budget_used_chars: params[6],
            content_digest: params[7],
            entries: JSON.parse(String(params[8])),
          });
          return [];
        }
        return rows.filter(
          (row) => row['turn_id'] === params[0] && row['user_id'] === params[1],
        ) as T[];
      },
    };
    const store = createPostgresContextManifestStore(db);

    const resolution = await resolveContext({
      turnId: 'turn_6',
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      store,
      loaders: [loader({ load: () => [memory('m1', 'the secret fact')] })],
    });

    expect(JSON.stringify(rows)).not.toContain('the secret fact');
    const replayed = (await store.read('turn_6', ACTOR)) as ContextManifest;
    expect(replayed.entries).toEqual(resolution.manifest.entries);
    expect(replayed.contentDigest).toBe(resolution.manifest.contentDigest);
    expect(await store.read('turn_6', { userId: 'user_2' })).toBeNull();
  });

  it('resolves the same inputs to the same manifest', async () => {
    const input = {
      actor: ACTOR,
      policy: OPEN_ORGANIZATION_CONTEXT_POLICY,
      nowMs: 1,
      loaders: [loader({ load: () => [memory('m1', 'one'), memory('m2', 'two')] })],
    };
    const first = await resolveContext({ turnId: 'turn_7', ...input });
    const second = await resolveContext({ turnId: 'turn_7', ...input });
    expect(second.manifest).toEqual(first.manifest);
  });
});

describe('factKey', () => {
  it('collapses punctuation and case so one fact has one key', () => {
    expect(factKey('Deploys happen on Fridays.')).toBe(factKey('deploys  happen on fridays'));
    expect(factKey('...')).toBe('');
  });
});
