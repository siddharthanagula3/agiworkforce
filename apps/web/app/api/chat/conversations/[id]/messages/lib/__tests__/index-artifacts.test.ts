/**
 * Unit tests for the artifact index writer (migration 0121).
 *
 * The index exists because web artifacts are DERIVED from message markdown at
 * render time, so the client only knows about conversations it has actually
 * opened. Verified empirically on 2026-08-15: after clearing
 * `agi-artifacts-store`, the gallery showed 1 artifact where the account had 4.
 * These tests pin the two properties that make the index trustworthy, it
 * indexes exactly what the client will re-derive, and it never stores content.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { indexMessageArtifacts, scheduleArtifactIndexing } from '../index-artifacts';
import { deriveArtifacts } from '@agiworkforce/artifacts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user_abc';

function makeDb() {
  // Typed explicitly: an inferred `vi.fn(async () => undefined)` has a zero-arg
  // signature, so `mock.calls` types as `[]` and every `calls[0]?.[1]` below
  // fails typecheck even though it works at runtime.
  const execute = vi.fn(async (_sql: string, _params?: unknown[]): Promise<void> => undefined);
  return { db: { execute, query: vi.fn() } as unknown as DatabaseAdapter, execute };
}

const MARKDOWN = [
  'Here you go:',
  '',
  '```html',
  '<!doctype html><title>Dashboard</title><h1>Hi</h1>',
  '```',
  '',
  'and a diagram:',
  '',
  '```mermaid',
  'graph TD; A-->B;',
  '```',
].join('\n');

beforeEach(() => vi.clearAllMocks());

describe('indexMessageArtifacts', () => {
  it('indexes exactly the artifacts the client will re-derive, under the same ids', async () => {
    const { db, execute } = makeDb();

    const count = await indexMessageArtifacts({
      db,
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      content: MARKDOWN,
    });

    // The ids the client computes for this exact message.
    const expected = deriveArtifacts(MARKDOWN, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    expect(expected.length).toBeGreaterThan(0);
    expect(count).toBe(expected.length);

    const insert = execute.mock.calls.find((c) => String(c[0]).includes('insert into'));
    expect(insert).toBeDefined();
    const ids = (insert?.[1] as unknown[])[0] as string[];
    // Identity match is the whole point: an index row and a locally-derived
    // artifact must be the same object so the gallery merges them without
    // reconciliation.
    expect(ids).toEqual(expected.map((a) => a.id));
  });

  it('never writes artifact content, the index is metadata only', async () => {
    const { db, execute } = makeDb();
    await indexMessageArtifacts({
      db,
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      content: MARKDOWN,
    });

    const insert = execute.mock.calls.find((c) => String(c[0]).includes('insert into'));
    // No content column exists in the statement at all.
    expect(String(insert?.[0])).not.toContain('content');
    // And the artifact body is not smuggled in as a bound parameter.
    const flat = JSON.stringify(insert?.[1] ?? []);
    expect(flat).not.toContain('<!doctype html>');
    expect(flat).not.toContain('<h1>Hi</h1>');
  });

  it('caps a content-derived title so the index cannot become a content store', async () => {
    const { db, execute } = makeDb();
    // A mermaid block has no extractable title, so derivation falls back to a
    // slice of the block itself. Make that slice enormous.
    const longBlock = `graph TD; ${'A-->B; '.repeat(400)}`;
    await indexMessageArtifacts({
      db,
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      content: ['```mermaid', longBlock, '```'].join('\n'),
    });

    const insert = execute.mock.calls.find((c) => String(c[0]).includes('insert into'));
    const titles = (insert?.[1] as unknown[])[5] as Array<string | null>;
    expect(titles).toHaveLength(1);
    expect((titles[0] ?? '').length).toBeLessThanOrEqual(200);
  });

  it('clears the message’s previous rows first, so a retry cannot leave stale artifacts', async () => {
    const { db, execute } = makeDb();
    await indexMessageArtifacts({
      db,
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      content: MARKDOWN,
    });

    const first = String(execute.mock.calls[0]?.[0]);
    expect(first).toContain('delete from web_artifact_index');
    expect(execute.mock.calls[0]?.[1]).toEqual([MESSAGE_ID]);
  });

  it('still clears, but writes nothing, when a message produces no artifacts', async () => {
    const { db, execute } = makeDb();
    const count = await indexMessageArtifacts({
      db,
      userId: USER_ID,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      content: 'Just prose, no fenced blocks at all.',
    });

    expect(count).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(String(execute.mock.calls[0]?.[0])).toContain('delete from');
  });
});

describe('scheduleArtifactIndexing', () => {
  it('swallows a failure rather than breaking the message save', async () => {
    const execute = vi.fn(async () => {
      throw new Error('db down');
    });
    const db = { execute, query: vi.fn() } as unknown as DatabaseAdapter;

    // Must not throw synchronously...
    expect(() =>
      scheduleArtifactIndexing({
        db,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        content: MARKDOWN,
      }),
    ).not.toThrow();

    // ...nor reject in the background. Indexing is a discovery aid; the message
    // the user just sent must be saved regardless.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(execute).toHaveBeenCalled();
  });
});
