import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUPPORT_HISTORY_LIMIT,
  SUPPORT_MAX_HISTORY_TURN_LENGTH,
  SupportAskRequestSchema,
  type SupportTurn,
} from '@agiworkforce/cloud-contracts/support';

type ScanModule0 = typeof import('@/lib/client/csrf');

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

import { askSupport } from '../lib/support-client';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sentBody(): unknown {
  const init = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
  return JSON.parse(init?.body ?? 'null');
}

describe('askSupport', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns the hourly 429 into a card instead of an error, and keeps the handoff', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'RATE_LIMIT_EXCEEDED', retry_after_seconds: 1800 } }, 429),
    );

    const reply = await askSupport({ message: 'how do I sign in', surface: 'app', turns: [] });

    expect(reply.kind).toBe('abstention');
    if (reply.kind !== 'abstention') return;
    expect(reply.reason).toBe('transport_error');
    expect(reply.text).toContain("You've asked a lot of questions");
    expect(reply.escalationOffered).toBe(true);
  });

  it('shows a daily-ceiling refusal from its own body, with the help-centre link', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        kind: 'abstention',
        reason: 'model_unavailable',
        text: "The assistant has reached its limit for now, so I can't answer this one.",
        authoritativeLinks: [
          { title: 'Help centre', url: 'https://agiworkforce.com/help', chunkId: 'help' },
        ],
        handoffOffered: true,
        route: null,
      }),
    );

    const reply = await askSupport({ message: 'how do I sign in', surface: 'app', turns: [] });

    expect(reply.kind).toBe('abstention');
    if (reply.kind !== 'abstention') return;
    expect(reply.reason).toBe('model_unavailable');
    expect(reply.text).toContain('reached its limit for now');
    expect(reply.citations.map((citation) => citation.title)).toEqual(['Help centre']);
    expect(reply.escalationOffered).toBe(true);
  });

  it('shows an out-of-scope refusal without offering a person', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        kind: 'abstention',
        reason: 'out_of_scope',
        text: 'I can only help with AGI Workforce.',
        authoritativeLinks: [],
        handoffOffered: false,
        route: null,
      }),
    );

    const reply = await askSupport({ message: 'write me a poem', surface: 'app', turns: [] });

    expect(reply.kind).toBe('abstention');
    if (reply.kind !== 'abstention') return;
    expect(reply.reason).toBe('out_of_scope');
    expect(reply.escalationOffered).toBe(false);
  });

  it('sends only the history the server accepts, however long the conversation ran', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ kind: 'abstention', reason: 'no_relevant_source' }));
    const turns: SupportTurn[] = [];
    for (let index = 0; index < SUPPORT_HISTORY_LIMIT * 2; index += 1) {
      turns.push({ id: `u${String(index)}`, role: 'user', text: `question ${String(index)}` });
      turns.push({
        id: `a${String(index)}`,
        role: 'assistant',
        reply: {
          kind: 'answer',
          text: 'x'.repeat(SUPPORT_MAX_HISTORY_TURN_LENGTH + 300),
          citations: [{ id: 'c', title: 'Doc', url: '/help' }],
          proposedActionId: null,
        },
      });
    }

    await askSupport({ message: 'and then?', surface: 'app', turns });

    const body = sentBody();
    const parsed = SupportAskRequestSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.history).toHaveLength(SUPPORT_HISTORY_LIMIT);
    for (const turn of parsed.data.history ?? []) {
      expect(turn.content.length).toBeLessThanOrEqual(SUPPORT_MAX_HISTORY_TURN_LENGTH);
    }
  });
});
