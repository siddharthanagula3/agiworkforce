import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { addCsrfHeaders } from '@/lib/client/csrf';

vi.mock('@/lib/client/csrf', () => ({
  CsrfTokenError: vi.fn(),
  clearCsrfToken: vi.fn(),
  getCsrfToken: vi.fn(),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit) => headers),
}));

import {
  adoptConversationDraftRevision,
  bindConversationDraftOwners,
  isConversationDraftOwnerCurrent,
  clearObservedConversationDraftRevisions,
  observeConversationDraftRevision,
  saveConversationDraft,
} from './conversation-draft';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const INITIAL_REVISION = '2026-09-23T00:00:00.000Z';
const NEXT_REVISION = '2026-09-23T00:00:01.000Z';

function createSession(userId = 'user-1', sessionId = 'session-1') {
  let current = true;
  return {
    userId,
    sessionId,
    isCurrent: () => current,
    getToken: vi.fn(async () => 'captured-token'),
    retire: () => {
      current = false;
    },
  } satisfies SessionAuthority & { retire: () => void };
}

let session = createSession();

beforeEach(() => {
  clearObservedConversationDraftRevisions();
  session.retire();
  session = createSession();
  vi.mocked(addCsrfHeaders).mockClear();
  vi.mocked(addCsrfHeaders).mockImplementation(async (headers = {}) => headers);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('conversation draft server revisions', () => {
  it('sends the last observed server revision and carries the acknowledgement forward', async () => {
    observeConversationDraftRevision(CONVERSATION_ID, INITIAL_REVISION, session);
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

    expect(await saveConversationDraft(CONVERSATION_ID, 'first', session, () => true)).toBe(
      'saved',
    );
    expect(await saveConversationDraft(CONVERSATION_ID, 'second', session, () => true)).toBe(
      'saved',
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).draftUpdatedAt).toBe(
      INITIAL_REVISION,
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).draftUpdatedAt).toBe(
      NEXT_REVISION,
    );
  });

  it('keeps its revision and text local when the server reports a conflict', async () => {
    observeConversationDraftRevision(CONVERSATION_ID, INITIAL_REVISION, session);
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            saved: false,
            conflict: true,
            current: { draft: 'their text', draftUpdatedAt: NEXT_REVISION },
          }),
          { status: 409 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const conflict = { kind: 'conflict', theirs: 'their text', theirsRevision: NEXT_REVISION };

    expect(await saveConversationDraft(CONVERSATION_ID, 'local text', session, () => true)).toEqual(
      conflict,
    );
    expect(
      await saveConversationDraft(CONVERSATION_ID, 'more local text', session, () => true),
    ).toEqual(conflict);
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).draftUpdatedAt).toBe(
      INITIAL_REVISION,
    );
  });

  it('counts an empty draft the server left unstamped as saved, and sends no revision next', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ saved: true, draftUpdatedAt: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ saved: true, draftUpdatedAt: NEXT_REVISION }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect(await saveConversationDraft(CONVERSATION_ID, '', session, () => true)).toBe('saved');
    expect(await saveConversationDraft(CONVERSATION_ID, 'typed later', session, () => true)).toBe(
      'saved',
    );

    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).draftUpdatedAt).toBeNull();
  });

  it('does not let an older conversation GET roll back a saved draft revision', async () => {
    observeConversationDraftRevision(CONVERSATION_ID, NEXT_REVISION, session);
    observeConversationDraftRevision(CONVERSATION_ID, INITIAL_REVISION, session);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ saved: true, draftUpdatedAt: NEXT_REVISION }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await saveConversationDraft(CONVERSATION_ID, 'new text', session, () => true)).toBe(
      'saved',
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).draftUpdatedAt).toBe(
      NEXT_REVISION,
    );
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function savedResponse(revision: string | null) {
  return new Response(JSON.stringify({ saved: true, draftUpdatedAt: revision }), { status: 200 });
}

describe('captured draft request ownership', () => {
  it('checks dispatch eligibility after the captured token resolves', async () => {
    const token = deferred<string>();
    session.getToken.mockReturnValueOnce(token.promise);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let eligible = true;
    const result = saveConversationDraft(CONVERSATION_ID, 'private text', session, () => eligible);
    await vi.waitFor(() => expect(session.getToken).toHaveBeenCalled());
    eligible = false;
    token.resolve('captured-token');
    expect(await result).toBe('superseded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks dispatch eligibility again after CSRF preparation', async () => {
    const headers = deferred<HeadersInit>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(headers.promise);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let eligible = true;
    const result = saveConversationDraft(CONVERSATION_ID, 'private text', session, () => eligible);
    await vi.waitFor(() => expect(addCsrfHeaders).toHaveBeenCalled());
    eligible = false;
    headers.resolve({});
    expect(await result).toBe('superseded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send after the captured session retires during token lookup', async () => {
    const token = deferred<string>();
    session.getToken.mockReturnValueOnce(token.promise);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = saveConversationDraft(CONVERSATION_ID, 'old account text', session, () => true);
    await vi.waitFor(() => expect(session.getToken).toHaveBeenCalled());
    session.retire();
    token.resolve('old-token');
    expect(await result).toBe('superseded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serializes a later clear across consumers and carries the dispatched acknowledgment forward', async () => {
    const first = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(savedResponse(NEXT_REVISION));
    vi.stubGlobal('fetch', fetchMock);
    let originalDraftCurrent = true;
    const saving = saveConversationDraft(
      CONVERSATION_ID,
      'first text',
      session,
      () => originalDraftCurrent,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    originalDraftCurrent = false;
    const otherConsumer = { ...session };
    const clearing = saveConversationDraft(CONVERSATION_ID, '', otherConsumer, () => true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    first.resolve(savedResponse(INITIAL_REVISION));
    expect(await saving).toBe('saved');
    expect(await clearing).toBe('saved');
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      draft: null,
      draftUpdatedAt: INITIAL_REVISION,
    });
    expect(fetchMock.mock.calls[1]?.[1]?.credentials).toBe('omit');
  });

  it('does not publish an old-session response body into the new session revision cache', async () => {
    const body = deferred<unknown>();
    const response = new Response(null, { status: 200 });
    vi.spyOn(response, 'json').mockReturnValue(body.promise);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(savedResponse(NEXT_REVISION));
    vi.stubGlobal('fetch', fetchMock);
    const oldSave = saveConversationDraft(CONVERSATION_ID, 'old text', session, () => true);
    await vi.waitFor(() => expect(response.json).toHaveBeenCalled());
    session.retire();
    const nextSession = createSession('user-2', 'session-2');
    body.resolve({ saved: true, draftUpdatedAt: INITIAL_REVISION });
    expect(await oldSave).toBe('superseded');
    expect(await saveConversationDraft(CONVERSATION_ID, 'new text', nextSession, () => true)).toBe(
      'saved',
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).draftUpdatedAt).toBeNull();
  });

  it('keeps an explicit conflict choice as its exact CAS even after a newer observation', async () => {
    const newest = '2026-09-23T00:00:02.000Z';
    observeConversationDraftRevision(CONVERSATION_ID, newest, session);
    adoptConversationDraftRevision(CONVERSATION_ID, NEXT_REVISION, session);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          current: { draft: 'changed again', draftUpdatedAt: newest },
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await saveConversationDraft(CONVERSATION_ID, 'chosen text', session, () => true),
    ).toMatchObject({
      kind: 'conflict',
      theirsRevision: newest,
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).draftUpdatedAt).toBe(
      NEXT_REVISION,
    );
  });

  it('does not roll a newer observation backward when a dispatched save finishes later', async () => {
    const first = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(savedResponse(NEXT_REVISION));
    vi.stubGlobal('fetch', fetchMock);
    const saving = saveConversationDraft(CONVERSATION_ID, 'first text', session, () => true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    observeConversationDraftRevision(CONVERSATION_ID, NEXT_REVISION, session);
    first.resolve(savedResponse(INITIAL_REVISION));
    expect(await saving).toBe('saved');
    expect(await saveConversationDraft(CONVERSATION_ID, 'second text', session, () => true)).toBe(
      'saved',
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string).draftUpdatedAt).toBe(
      NEXT_REVISION,
    );
  });
});

describe('draft slot session admission', () => {
  it('retains same-session slot ownership across consumer remounts', () => {
    bindConversationDraftOwners(session, {});
    const slot = {};
    bindConversationDraftOwners(session, { conversation: slot });
    expect(isConversationDraftOwnerCurrent(slot, session)).toBe(true);
    const remounted = { ...session };
    bindConversationDraftOwners(remounted, { conversation: slot });
    expect(isConversationDraftOwnerCurrent(slot, remounted)).toBe(true);
  });

  it('quarantines claimed and unclaimed extant slots at an observed identity replacement without deleting data', () => {
    bindConversationDraftOwners(session, {});
    const claimed = {};
    const unclaimed = {};
    bindConversationDraftOwners(session, { claimed });
    session.retire();
    clearObservedConversationDraftRevisions();
    const replacement = createSession('user-2', 'session-2');
    const owners = { claimed, unclaimed };
    bindConversationDraftOwners(replacement, owners);
    expect(owners).toEqual({ claimed, unclaimed });
    expect(isConversationDraftOwnerCurrent(claimed, replacement)).toBe(false);
    expect(isConversationDraftOwnerCurrent(unclaimed, replacement)).toBe(false);
    const newlyEdited = {};
    bindConversationDraftOwners(replacement, { ...owners, newlyEdited });
    expect(isConversationDraftOwnerCurrent(newlyEdited, replacement)).toBe(true);
  });
});

describe('explicit empty conflict revision choice', () => {
  it('keeps an adopted null revision distinct from a newer observed revision', async () => {
    observeConversationDraftRevision(CONVERSATION_ID, NEXT_REVISION, session);
    adoptConversationDraftRevision(CONVERSATION_ID, null, session);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          current: { draft: 'new remote text', draftUpdatedAt: NEXT_REVISION },
        }),
        { status: 409 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await saveConversationDraft(CONVERSATION_ID, 'chosen text', session, () => true),
    ).toMatchObject({ kind: 'conflict' });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).draftUpdatedAt).toBeNull();
  });
});
