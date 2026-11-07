import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { copySharedArtifactToChat } from './copy-shared-artifact';

const conversationId = '11111111-1111-4111-8111-111111111111';
const organizationId = '22222222-2222-4222-8222-222222222222';
const input = { title: 'Shared', kind: 'html' as const, language: null, content: '<h1>Copy</h1>' };
function created(organization: string | null | undefined = null) {
  return {
    conversation: {
      id: conversationId,
      organization_id: organization,
      title: 'Shared',
      model: null,
      project_id: null,
      pinned: false,
      starred: false,
      archived: false,
      is_temporary: false,
      created_at: '2026-11-04',
      updated_at: '2026-11-04',
    },
  };
}
function saved(init?: RequestInit) {
  const message = JSON.parse(String(init?.body)).messages[0];
  return {
    messages: [
      {
        ...message,
        content: message.content.trim(),
        model: null,
        provider: null,
        input_tokens: 0,
        output_tokens: 0,
        created_at: '2026-11-04',
        metadata: null,
      },
    ],
  };
}
function owner(dispatch?: () => void) {
  let current = true;
  const session = {
    userId: 'user-a',
    sessionId: 'session-a',
    isCurrent: () => current,
    getToken: vi.fn(async () => 'token-a'),
  };
  return {
    session,
    authority: createRequestAuthority(session, undefined, dispatch),
    retire: () => {
      current = false;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => vi.unstubAllGlobals());

describe('owned shared artifact copy', () => {
  it.each([null, organizationId])(
    'pins the accepted destination %s and returns a correlated artifact',
    async (organization) => {
      const fetchMock = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
          Response.json(fetchMock.mock.calls.length === 1 ? created(organization) : saved(init)),
      );
      vi.stubGlobal('fetch', fetchMock);
      const result = await copySharedArtifactToChat(input, owner().authority);
      expect(result).toMatchObject({
        kind: 'copied',
        conversationId,
        artifact: { content: input.content, conversationId },
      });
      const init = fetchMock.mock.calls[1]?.[1];
      expect(new Headers(init?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
        organization ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      );
      for (const [, request] of fetchMock.mock.calls) {
        expect(request?.credentials).toBe('omit');
        expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer token-a');
        expect(request?.method).toBe('POST');
      }
    },
  );

  it('preserves a known chat when the receipt omits workspace scope', async () => {
    const payload = created();
    payload.conversation.organization_id = undefined;
    const fetchMock = vi.fn(async () => Response.json(payload));
    vi.stubGlobal('fetch', fetchMock);
    expect(await copySharedArtifactToChat(input, owner().authority)).toEqual({
      kind: 'unconfirmed',
      conversationId,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'server-error',
    'wrong-message',
    'wrong-content',
    'extra-message',
    'invalid-json',
    'lost-response',
  ])('does not discard or retry an uncertain save: %s', async (failure) => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (fetchMock.mock.calls.length === 1) return Response.json(created());
        if (failure === 'server-error') return new Response('', { status: 500 });
        if (failure === 'invalid-json') return new Response('{');
        if (failure === 'lost-response') throw new TypeError('Connection lost');
        const payload = saved(init);
        if (failure === 'wrong-message') payload.messages[0].id = 'wrong';
        if (failure === 'wrong-content') payload.messages[0].content = 'other';
        if (failure === 'extra-message') payload.messages.push(payload.messages[0]);
        return Response.json(payload);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await copySharedArtifactToChat(input, owner().authority)).toEqual({
      kind: 'unconfirmed',
      conversationId,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('retains uncertainty when creation fails after a possible commit', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await copySharedArtifactToChat(input, owner().authority)).toEqual({
      kind: 'unconfirmed',
      conversationId: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves an authentication refusal for the current owner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    );
    expect(await copySharedArtifactToChat(input, owner().authority)).toEqual({ kind: 'sign-in' });
  });

  it('blocks new dispatch after source retirement during create receipt parsing', async () => {
    let visible = true;
    const payload = deferred<unknown>();
    const parsing = deferred<void>();
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 201,
          json: () => {
            parsing.resolve();
            return payload.promise;
          },
        }) as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    const current = owner(() => {
      if (!visible) throw new DOMException('Retired', 'AbortError');
    });
    const copying = copySharedArtifactToChat(input, current.authority);
    await parsing.promise;
    visible = false;
    payload.resolve(created());
    await expect(copying).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps an accepted bulk receipt after source retirement', async () => {
    let visible = true;
    const payload = deferred<unknown>();
    const parsing = deferred<RequestInit | undefined>();
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (fetchMock.mock.calls.length === 1) return Response.json(created());
        return {
          ok: true,
          status: 200,
          json: () => {
            parsing.resolve(init);
            return payload.promise;
          },
        } as Response;
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const current = owner(() => {
      if (!visible) throw new DOMException('Retired', 'AbortError');
    });
    const copying = copySharedArtifactToChat(input, current.authority);
    const request = await parsing.promise;
    visible = false;
    payload.resolve(saved(request));
    expect(await copying).toMatchObject({ kind: 'copied', conversationId });
  });

  it('rejects account retirement during token acquisition without dispatch', async () => {
    const token = deferred<string>();
    const acquiring = deferred<void>();
    const current = owner();
    current.session.getToken = vi.fn(() => {
      acquiring.resolve();
      return token.promise;
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const copying = copySharedArtifactToChat(input, current.authority);
    await acquiring.promise;
    current.retire();
    token.resolve('token-a');
    await expect(copying).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
