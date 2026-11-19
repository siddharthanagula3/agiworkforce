import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({ ...headers, 'x-csrf-token': 't' })),
  getCsrfToken: vi.fn(async () => 't'),
}));

const { loadArtifactComments, resetArtifactCommentsCache, useArtifactComments } =
  await import('./artifact-comments-client');

const ARTIFACT_ID = '4f3e2d1c-0b9a-4c8d-8e7f-6a5b4c3d2e1f';

function stored(id: string, body: string, parentId: string | null = null) {
  return {
    id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
    artifactId: ARTIFACT_ID,
    parentId,
    anchor: { kind: 'artifact' },
    body,
    author: 'user' as const,
    resolvedAt: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
  };
}

interface Deferred {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

function deferredGet(): { fetchMock: ReturnType<typeof vi.fn>; gets: Deferred[] } {
  const gets: Deferred[] = [];
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return new Promise<Response>((resolve, reject) => gets.push({ resolve, reject }));
    }
    if (method === 'POST') {
      const body = JSON.parse(String(init!.body));
      return new Response(
        JSON.stringify({ comment: stored('900', body.body, body.parentId ?? null) }),
        { status: 201 },
      );
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, gets };
}

describe('artifact comments client', () => {
  beforeEach(() => {
    resetArtifactCommentsCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps an acknowledged comment when an older empty read finishes afterwards', async () => {
    const { gets } = deferredGet();
    const { result } = renderHook(() => useArtifactComments(ARTIFACT_ID));

    let read!: Promise<void>;
    act(() => {
      read = loadArtifactComments(ARTIFACT_ID);
    });
    await waitFor(() => expect(gets).toHaveLength(1));

    await act(async () => {
      await result.current.create({ body: 'ship it' });
    });
    expect(result.current.comments.map((entry) => entry.body)).toEqual(['ship it']);

    await act(async () => {
      gets[0]!.resolve(new Response(JSON.stringify({ comments: [] })));
      await read;
    });
    expect(result.current.state.status).toBe('ready');
    expect(result.current.comments.map((entry) => entry.body)).toEqual(['ship it']);
  });

  it('merges the older snapshot with the acknowledged comment without duplicating it', async () => {
    const { gets } = deferredGet();
    const { result } = renderHook(() => useArtifactComments(ARTIFACT_ID));
    const earlier = stored('1', 'earlier');

    let read!: Promise<void>;
    act(() => {
      read = loadArtifactComments(ARTIFACT_ID);
    });
    await waitFor(() => expect(gets).toHaveLength(1));
    await act(async () => {
      await result.current.create({ body: 'new' });
    });
    await act(async () => {
      gets[0]!.resolve(new Response(JSON.stringify({ comments: [earlier, stored('900', 'new')] })));
      await read;
    });
    expect(result.current.comments.map((entry) => entry.body)).toEqual(['earlier', 'new']);
  });

  it('does not bring back a comment deleted while an older read was pending', async () => {
    const { gets } = deferredGet();
    const { result } = renderHook(() => useArtifactComments(ARTIFACT_ID));
    const doomed = stored('2', 'doomed');
    const reply = stored('3', 'reply', doomed.id);

    let read!: Promise<void>;
    act(() => {
      read = loadArtifactComments(ARTIFACT_ID);
    });
    await waitFor(() => expect(gets).toHaveLength(1));
    await act(async () => {
      await result.current.remove(doomed.id);
    });
    await act(async () => {
      gets[0]!.resolve(new Response(JSON.stringify({ comments: [doomed, reply] })));
      await read;
    });
    expect(result.current.comments).toEqual([]);
  });

  it('keeps the acknowledged comment and re-reads when the older read fails', async () => {
    const { gets } = deferredGet();
    const { result } = renderHook(() => useArtifactComments(ARTIFACT_ID));

    let read!: Promise<void>;
    act(() => {
      read = loadArtifactComments(ARTIFACT_ID);
    });
    await waitFor(() => expect(gets).toHaveLength(1));
    await act(async () => {
      await result.current.create({ body: 'kept' });
    });
    await act(async () => {
      gets[0]!.resolve(new Response('{}', { status: 500 }));
      await read;
    });
    expect(result.current.state.status).toBe('ready');
    expect(result.current.comments.map((entry) => entry.body)).toEqual(['kept']);

    await waitFor(() => expect(gets).toHaveLength(2));
    await act(async () => {
      gets[1]!.resolve(
        new Response(JSON.stringify({ comments: [stored('1', 'earlier'), stored('900', 'kept')] })),
      );
    });
    await waitFor(() =>
      expect(result.current.comments.map((entry) => entry.body)).toEqual(['earlier', 'kept']),
    );
  });

  it('reports a failed read when nothing was acknowledged meanwhile', async () => {
    const { gets } = deferredGet();
    const { result } = renderHook(() => useArtifactComments(ARTIFACT_ID));

    let read!: Promise<void>;
    act(() => {
      read = loadArtifactComments(ARTIFACT_ID);
    });
    await waitFor(() => expect(gets).toHaveLength(1));
    await act(async () => {
      gets[0]!.resolve(new Response('{}', { status: 500 }));
      await read;
    });
    expect(result.current.state.status).toBe('failed');
  });

  it('ignores a read that finishes after the cache was reset', async () => {
    const { gets } = deferredGet();
    const { result } = renderHook(() => useArtifactComments(ARTIFACT_ID));

    let read!: Promise<void>;
    act(() => {
      read = loadArtifactComments(ARTIFACT_ID);
    });
    await waitFor(() => expect(gets).toHaveLength(1));
    act(() => {
      resetArtifactCommentsCache();
    });
    await act(async () => {
      gets[0]!.resolve(new Response(JSON.stringify({ comments: [stored('1', 'old account')] })));
      await read;
    });
    expect(result.current.comments).toEqual([]);
  });
});
