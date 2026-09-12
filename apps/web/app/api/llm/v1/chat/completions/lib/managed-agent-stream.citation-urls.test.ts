import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = '0190a000-0000-7000-8000-00000000aaa1';
const MESSAGE_ID = '0190a000-0000-7000-8000-00000000aaa2';

const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/managed';
const PUBLISHER = 'https://apnews.com/article/managed';

const events: string[] = [];

const persistenceMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  resolveRoutingRedirectUrls: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => {
  const pool = {
    execute: persistenceMocks.execute,
    query: persistenceMocks.query,
    transaction: (run: (tx: unknown) => Promise<unknown>) => run(pool),
  };
  return { getNeonDb: () => pool };
});
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  markManagedUsageClientDelivered: vi.fn(),
  estimateMicrousdOf: vi.fn(() => 0),
}));
vi.mock('@/lib/services/free-trial-service', () => ({ settleFreeTrialRequest: vi.fn() }));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  appendCloudAgentEvents: vi.fn(),
  transitionCloudAgentRun: vi.fn(),
  recordCloudAgentRunSettledUsage: vi.fn(),
}));
vi.mock('@/app/api/chat/conversations/[id]/messages/lib/index-artifacts', () => ({
  scheduleArtifactIndexing: vi.fn(),
}));

// The host check stays real, so this test still fails if the routing hosts stop
// matching what a grounded turn actually emits. Only the hop is stubbed.
vi.mock('@/lib/web-search/web-search-tool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/web-search/web-search-tool')>()),
  resolveRoutingRedirectUrls: (results: unknown, overrides: unknown) =>
    persistenceMocks.resolveRoutingRedirectUrls(results, overrides),
}));

import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import { buildManagedAgentStream } from './managed-agent-stream';
import type { ProcessedRequest } from './request-processor';

const processed = {
  provider: 'google',
  chatRequest: { model: 'gemini-test' },
  requestId: 'request-managed-citation',
  conversationId: CONVERSATION_ID,
  assistantMessageId: MESSAGE_ID,
  conversationIsTemporary: false,
  organizationId: null,
} as unknown as ProcessedRequest;

async function* groundedGenerator(): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  const line = (delta: unknown) =>
    encoder.encode(`data: ${JSON.stringify({ choices: [{ delta, index: 0 }] })}\n\n`);
  yield line({ content: 'The filing landed on Tuesday.[1]' });
  yield line({
    x_search_results: {
      content: [
        {
          type: 'web_search_result',
          url: REDIRECT,
          title: 'apnews.com',
          encrypted_content: 'a snippet',
          position: 1,
        },
      ],
    },
  });
  yield encoder.encode('data: [DONE]\n\n');
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';
  while (true) {
    const next = await reader.read();
    if (next.done) return output;
    output += decoder.decode(next.value);
    if (output.includes('[DONE]')) events.push('terminal-visible');
  }
}

function insertedMetadata(): Record<string, unknown> {
  const call = persistenceMocks.execute.mock.calls.find(([sql]) =>
    String(sql).includes('insert into web_messages'),
  );
  expect(call, 'the turn should have been persisted').toBeDefined();
  return JSON.parse(String((call?.[1] as unknown[])[7])) as Record<string, unknown>;
}

function patchedMetadata(): Record<string, unknown> {
  const call = persistenceMocks.execute.mock.calls.find(([sql]) =>
    String(sql).includes('update web_messages'),
  );
  expect(call, 'the stored citations should have been patched').toBeDefined();
  return JSON.parse(String((call?.[1] as unknown[])[3])) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  persistenceMocks.execute.mockImplementation(async (sql: string) => {
    if (String(sql).includes('update web_messages')) events.push('patched');
    return 1;
  });
  // The conversation has never branched, and the row the patch reads back is
  // the one the insert just wrote.
  persistenceMocks.query.mockImplementation(async (sql: string) => {
    if (String(sql).includes('select m.metadata')) {
      return [
        {
          metadata: {
            searchResults: [{ url: REDIRECT, title: 'apnews.com', snippet: 'a snippet' }],
            citations: [{ type: 'url_citation', url: REDIRECT, title: 'apnews.com' }],
          },
        },
      ];
    }
    return [{ active_leaf_message_id: null }];
  });
  persistenceMocks.resolveRoutingRedirectUrls.mockImplementation(
    async (results: { url: string }[]) =>
      results.map((result) => (result.url === REDIRECT ? { url: PUBLISHER } : result)),
  );
});

/**
 * This path persists its own sources and was never wired to the citation patch,
 * so a grounded turn served through a managed agent kept the routing provider's
 * redirect as every href and went dead as those redirects expired, while the
 * same turn served through the plain stream did not.
 */
describe('a managed agent turn resolves its citation hrefs', () => {
  it('stores the publisher URL for a turn that cited a routing redirect', async () => {
    await readAll(buildManagedAgentStream(input()));
    await vi.waitFor(() => expect(events).toContain('patched'));

    expect(patchedMetadata()['searchResults']).toEqual([
      { url: PUBLISHER, title: 'apnews.com', snippet: 'a snippet' },
    ]);
    expect(patchedMetadata()['citations']).toEqual([
      { type: 'url_citation', url: PUBLISHER, title: 'apnews.com' },
    ]);
  });

  /**
   * Resolution is a network call with a timeout. Running it before the terminal
   * event would hold the answer the reader already has open in front of a hop
   * that only improves a stored href, so it runs after the stream is closed.
   */
  it('writes the row first and patches it only once the reader has the terminal event', async () => {
    await readAll(buildManagedAgentStream(input()));
    await vi.waitFor(() => expect(events).toContain('patched'));

    expect(insertedMetadata()['searchResults']).toEqual([
      { url: REDIRECT, title: 'apnews.com', snippet: 'a snippet' },
    ]);
    expect(events.indexOf('patched')).toBeGreaterThan(events.indexOf('terminal-visible'));
  });

  /**
   * Most turns cite publishers directly, and this path settles billing and a run
   * journal on the same tail. A turn with no redirect must not pay for a read of
   * the row it just wrote.
   */
  it('reads nothing back and resolves nothing when the turn cited no redirect', async () => {
    async function* publisherGenerator(): AsyncGenerator<Uint8Array> {
      const encoder = new TextEncoder();
      yield encoder.encode(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                x_search_results: {
                  content: [
                    {
                      type: 'web_search_result',
                      url: PUBLISHER,
                      title: 'AP News',
                      encrypted_content: 'a snippet',
                    },
                  ],
                },
              },
              index: 0,
            },
          ],
        })}\n\n`,
      );
      yield encoder.encode('data: [DONE]\n\n');
    }

    await readAll(buildManagedAgentStream({ ...input(), generator: publisherGenerator() }));

    expect(persistenceMocks.resolveRoutingRedirectUrls).not.toHaveBeenCalled();
    expect(
      persistenceMocks.query.mock.calls.filter(([sql]) =>
        String(sql).includes('select m.metadata'),
      ),
    ).toEqual([]);
    expect(events).not.toContain('patched');
  });
});

function input() {
  return {
    generator: groundedGenerator(),
    processed,
    usage: createObservedProviderUsage(),
    completionReason: 'managed_agent_completed',
    cancellationReason: 'client_cancelled_managed_agent',
    userId: 'user-managed-citation',
  };
}
