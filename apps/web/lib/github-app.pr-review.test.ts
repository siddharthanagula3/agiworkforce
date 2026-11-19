import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn() }),
}));

import {
  getPrDiff,
  getPrReviewSnapshot,
  listPrReviewCommentBodies,
  postPrReview,
} from './github-app';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postPrReview with line comments', () => {
  it('anchors each comment to the right side of the named line', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await postPrReview('token', 'acme', 'repo', 7, 'summary', 'COMMENT', [
      { path: 'src/auth.ts', line: 11, body: 'this bypasses the check' },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/repos/acme/repo/pulls/7/reviews');
    expect(JSON.parse(String(init.body))).toEqual({
      body: 'summary',
      event: 'COMMENT',
      comments: [{ path: 'src/auth.ts', line: 11, side: 'RIGHT', body: 'this bypasses the check' }],
    });
  });

  it('sends no comments key when there are no findings', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await postPrReview('token', 'acme', 'repo', 7, 'nothing found');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty('comments');
  });

  it('refuses a repository path segment that is not one', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postPrReview('token', '../../etc', 'repo', 7, 'x')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('listPrReviewCommentBodies', () => {
  it('follows pages until a short one, so an old comment is still seen', async () => {
    const page = (count: number, marker: string) =>
      Array.from({ length: count }, (_, index) => ({ body: `${marker}-${index}` }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page(100, 'first')))
      .mockResolvedValueOnce(jsonResponse(page(3, 'second')));
    vi.stubGlobal('fetch', fetchMock);

    const bodies = await listPrReviewCommentBodies('token', 'acme', 'repo', 7);

    expect(bodies).toHaveLength(103);
    expect(bodies.at(-1)).toBe('second-2');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('page=2');
  });

  it('throws rather than reporting an empty history it did not read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    await expect(listPrReviewCommentBodies('token', 'acme', 'repo', 7)).rejects.toThrow(/500/);
  });
});

describe('getPrDiff', () => {
  it('keeps enough of a large diff for the chunked reviewer to work through', async () => {
    const huge = 'diff --git a/a b/a\n'.repeat(20_000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(huge, { status: 200 })),
    );

    const diff = await getPrDiff('token', 'acme', 'repo', 7);

    expect(diff.length).toBeGreaterThan(50_000);
    expect(diff).toContain('[... diff truncated at 300000 characters ...]');
  });
});

function pullResponse(sha: string): Response {
  return jsonResponse({ number: 7, title: 'change', head: { ref: 'feature', sha } });
}

describe('postPrReview commit binding', () => {
  it('names the commit the review was made against', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await postPrReview('token', 'acme', 'repo', 7, 'nothing found', 'COMMENT', [], 'abc123');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ commit_id: 'abc123' });
  });
});

describe('getPrReviewSnapshot', () => {
  it('returns the diff with the head commit it was read at', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pullResponse('aaa111'))
      .mockResolvedValueOnce(new Response('diff --git a/a b/a\n', { status: 200 }))
      .mockResolvedValueOnce(pullResponse('aaa111'));
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getPrReviewSnapshot('token', 'acme', 'repo', 7);

    expect(snapshot).toEqual({ diff: 'diff --git a/a b/a\n', truncated: false, headSha: 'aaa111' });
  });

  it('reads again when a push landed while the diff was being fetched', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pullResponse('aaa111'))
      .mockResolvedValueOnce(new Response('old diff', { status: 200 }))
      .mockResolvedValueOnce(pullResponse('bbb222'))
      .mockResolvedValueOnce(pullResponse('bbb222'))
      .mockResolvedValueOnce(new Response('new diff', { status: 200 }))
      .mockResolvedValueOnce(pullResponse('bbb222'));
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getPrReviewSnapshot('token', 'acme', 'repo', 7);

    expect(snapshot.diff).toBe('new diff');
    expect(snapshot.headSha).toBe('bbb222');
  });

  it('refuses a diff it cannot tie to one head', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const position = call % 3;
        const round = Math.floor(call / 3);
        call += 1;
        if (position === 1) return new Response('diff', { status: 200 });
        return pullResponse(position === 0 ? `before-${round}` : `after-${round}`);
      }),
    );

    await expect(getPrReviewSnapshot('token', 'acme', 'repo', 7)).rejects.toThrow(/kept changing/);
  });

  it('says when the diff was cut at the fetch limit', async () => {
    const huge = 'diff --git a/a b/a\n'.repeat(20_000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pullResponse('aaa111'))
      .mockResolvedValueOnce(new Response(huge, { status: 200 }))
      .mockResolvedValueOnce(pullResponse('aaa111'));
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getPrReviewSnapshot('token', 'acme', 'repo', 7);

    expect(snapshot.truncated).toBe(true);
  });
});
