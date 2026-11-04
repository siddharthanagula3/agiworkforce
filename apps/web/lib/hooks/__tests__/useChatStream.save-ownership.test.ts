import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority, type SessionAuthority } from '@/lib/identity/request-authority';
import { createChatRequestSettlements, createChatRequestToken } from '../chat-request-settlement';
import { saveMessageToDb } from '../useChatStream';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
  getCsrfToken: async () => 'fixture-csrf',
}));

const ASSISTANT = 'b1111111-1111-4111-8111-111111111111';
const USER = 'b2222222-2222-4222-8222-222222222222';
const OTHER_ASSISTANT = 'b3333333-3333-4333-8333-333333333333';
const CONVERSATION = 'b4444444-4444-4444-8444-444444444444';

const pendingSaves: Promise<unknown>[] = [];
const releaseGates = new Set<() => void>();
const finishRequests = new Set<() => void>();
const disposeScopes = new Set<() => void>();

function deferred<T>(fallback: T) {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolvePromise = complete; });
  const release = () => resolve(fallback);
  const resolve = (value: T) => {
    releaseGates.delete(release);
    resolvePromise(value);
  };
  releaseGates.add(release);
  return { promise, resolve };
}

function trackSave<T>(promise: Promise<T>): Promise<T> {
  pendingSaves.push(promise);
  void promise.catch(() => undefined);
  return promise;
}

function scope() {
  let current = true;
  const session: SessionAuthority = {
    userId: 'fixture-user',
    sessionId: 'fixture-session',
    isCurrent: () => current,
    getToken: vi.fn(async () => 'fixture-token'),
  };
  const parent = createRequestAuthority(session);
  const requests = createChatRequestSettlements(new Map());
  const begin = (messageId: string) => {
    const request = requests.begin(CONVERSATION, messageId);
    finishRequests.add(request.finish);
    return request;
  };
  disposeScopes.add(() => {
    requests.dispose();
    parent.retire();
  });
  const request = begin(ASSISTANT);
  const base = Object.assign(() => parent.getToken(), { authority: parent });
  return {
    session, parent, requests, request, begin,
    token: createChatRequestToken(base, request, requests),
    replaceSession: () => { current = false; },
  };
}

function response(id: string, status = 200): Response {
  return new Response(JSON.stringify(status === 200 ? { message: { id } } : { error: 'Retry later' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(async () => {
  try {
    for (const release of releaseGates) release();
    await Promise.allSettled(pendingSaves.splice(0));
  } finally {
    for (const finish of finishRequests) finish();
    finishRequests.clear();
    for (const dispose of disposeScopes) dispose();
    disposeScopes.clear();
    releaseGates.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

describe('account-owned chat save receipts', () => {
  it('keeps an issued receipt after the same row and original request are replaced', async () => {
    const owner = scope();
    const issued = deferred<void>(undefined);
    const reply = deferred<Response>(response(ASSISTANT));
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((_input, init) => {
      signal = init?.signal;
      issued.resolve();
      return reply.promise;
    }));
    const save = trackSave(owner.request.track(saveMessageToDb(CONVERSATION, {
      id: ASSISTANT, role: 'assistant', content: 'Partial answer',
    }, owner.token)));
    owner.request.finish();
    await issued.promise;
    owner.parent.retire();
    const successor = owner.begin(ASSISTANT);
    expect(signal?.aborted).toBe(false);
    reply.resolve(response(ASSISTANT));
    await expect(save).resolves.toEqual({ id: ASSISTANT });
    expect(successor.isCurrent()).toBe(true);
    successor.finish();
  });

  it('preserves queued different-message persistence after a newer send retires the old parent', async () => {
    const owner = scope();
    const issued = deferred<void>(undefined);
    const reply = deferred<Response>(response(ASSISTANT));
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => { issued.resolve(); return reply.promise; })
      .mockImplementationOnce(() => response(ASSISTANT));
    vi.stubGlobal('fetch', fetchMock);
    const first = trackSave(owner.request.track(saveMessageToDb(CONVERSATION, {
      id: ASSISTANT, role: 'assistant', content: 'Partial',
    }, owner.token)));
    const queued = trackSave(owner.request.track(saveMessageToDb(CONVERSATION, {
      id: ASSISTANT, role: 'assistant', content: 'Partial with metadata',
    }, owner.token)));
    owner.request.finish();
    await issued.promise;
    owner.parent.retire();
    const successor = owner.begin(OTHER_ASSISTANT);
    reply.resolve(response(ASSISTANT));
    await expect(first).resolves.toEqual({ id: ASSISTANT });
    await expect(queued).resolves.toEqual({ id: ASSISTANT });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    successor.finish();
  });

  it('does not retry a superseded same-row generation even after the successor releases', async () => {
    const owner = scope();
    const issued = deferred<void>(undefined);
    const reply = deferred<Response>(response(ASSISTANT));
    const fetchMock = vi.fn(() => { issued.resolve(); return reply.promise; });
    vi.stubGlobal('fetch', fetchMock);
    const save = trackSave(owner.request.track(saveMessageToDb(CONVERSATION, {
      id: ASSISTANT, role: 'assistant', content: 'Old partial',
    }, owner.token, { retryDelayMs: 0 })));
    const rejected = expect(save).rejects.toMatchObject({ name: 'AbortError' });
    owner.request.finish();
    await issued.promise;
    owner.begin(ASSISTANT).finish();
    reply.resolve(response(ASSISTANT, 429));
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the captured user-row write when only its assistant generation is replaced', async () => {
    const owner = scope();
    const tokenStarted = deferred<void>(undefined);
    const token = deferred<string>('fixture-token');
    vi.mocked(owner.session.getToken).mockImplementationOnce(() => {
      tokenStarted.resolve();
      return token.promise;
    });
    const fetchMock = vi.fn(async () => response(USER));
    vi.stubGlobal('fetch', fetchMock);
    const save = trackSave(owner.request.track(saveMessageToDb(CONVERSATION, {
      id: USER, role: 'user', content: 'Original question',
    }, owner.token)));
    owner.request.finish();
    await tokenStarted.promise;
    const successor = owner.begin(ASSISTANT);
    token.resolve('fixture-token');
    await expect(save).resolves.toEqual({ id: USER });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    successor.finish();
  });

  it.each([false, true])('checks final-token dispatch ownership with replacement=%s', async (replaced) => {
    const owner = scope();
    const finalTokenStarted = deferred<void>(undefined);
    const finalToken = deferred<string>('fixture-token');
    vi.mocked(owner.session.getToken)
      .mockResolvedValueOnce('fixture-token')
      .mockImplementationOnce(() => {
        finalTokenStarted.resolve();
        return finalToken.promise;
      });
    const fetchMock = vi.fn<typeof fetch>(async () => response(ASSISTANT));
    vi.stubGlobal('fetch', fetchMock);
    const save = trackSave(owner.request.track(saveMessageToDb(CONVERSATION, {
      id: ASSISTANT, role: 'assistant', content: 'Superseded answer',
    }, owner.token, { maxAttempts: 1 })));
    const outcome = replaced
      ? expect(save).rejects.toMatchObject({ name: 'AbortError' })
      : expect(save).resolves.toEqual({ id: ASSISTANT });
    owner.request.finish();
    await finalTokenStarted.promise;
    const successor = replaced ? owner.begin(ASSISTANT) : undefined;
    finalToken.resolve('fixture-token');
    await outcome;
    expect(fetchMock).toHaveBeenCalledTimes(replaced ? 0 : 1);
    if (successor) {
      expect(successor.isCurrent()).toBe(true);
      successor.finish();
    }
  });

  it('rejects a receipt when the session changes during response decoding', async () => {
    const owner = scope();
    const decoding = deferred<void>(undefined);
    const decoded = deferred<unknown>({ message: { id: ASSISTANT } });
    const reply = response(ASSISTANT);
    vi.spyOn(reply, 'json').mockImplementation(() => {
      decoding.resolve();
      return decoded.promise;
    });
    const fetchMock = vi.fn(async () => reply);
    vi.stubGlobal('fetch', fetchMock);
    const save = trackSave(owner.request.track(saveMessageToDb(CONVERSATION, {
      id: ASSISTANT, role: 'assistant', content: 'Answer',
    }, owner.token)));
    const rejected = expect(save).rejects.toMatchObject({ name: 'AbortError' });
    owner.request.finish();
    await decoding.promise;
    owner.replaceSession();
    decoded.resolve({ message: { id: ASSISTANT } });
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
