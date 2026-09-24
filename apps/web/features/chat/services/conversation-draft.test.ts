import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit) => headers),
}));

import {
  clearObservedConversationDraftRevisions,
  observeConversationDraftRevision,
  saveConversationDraft,
} from './conversation-draft';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const INITIAL_REVISION = '2026-09-23T00:00:00.000Z';
const NEXT_REVISION = '2026-09-23T00:00:01.000Z';

beforeEach(() => {
  clearObservedConversationDraftRevisions();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('conversation draft server revisions', () => {
  it('sends the last observed server revision and carries the acknowledgement forward', async () => {
    observeConversationDraftRevision(CONVERSATION_ID, INITIAL_REVISION);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ saved: true, draftUpdatedAt: NEXT_REVISION }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ saved: true, draftUpdatedAt: '2026-09-23T00:00:02.000Z' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect(await saveConversationDraft(CONVERSATION_ID, 'first', async () => ({}))).toBe('saved');
    expect(await saveConversationDraft(CONVERSATION_ID, 'second', async () => ({}))).toBe('saved');

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).draftUpdatedAt).toBe(
      INITIAL_REVISION,
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).draftUpdatedAt).toBe(
      NEXT_REVISION,
    );
  });

  it('keeps its revision and text local when the server reports a conflict', async () => {
    observeConversationDraftRevision(CONVERSATION_ID, INITIAL_REVISION);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ saved: false, conflict: true }), { status: 409 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect(await saveConversationDraft(CONVERSATION_ID, 'local text', async () => ({}))).toBe(
      'conflict',
    );
    expect(await saveConversationDraft(CONVERSATION_ID, 'more local text', async () => ({}))).toBe(
      'conflict',
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).draftUpdatedAt).toBe(
      INITIAL_REVISION,
    );
  });

  it('does not let an older conversation GET roll back a saved draft revision', async () => {
    observeConversationDraftRevision(CONVERSATION_ID, NEXT_REVISION);
    observeConversationDraftRevision(CONVERSATION_ID, INITIAL_REVISION);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ saved: true, draftUpdatedAt: NEXT_REVISION }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await saveConversationDraft(CONVERSATION_ID, 'new text', async () => ({}))).toBe(
      'saved',
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).draftUpdatedAt).toBe(
      NEXT_REVISION,
    );
  });
});
