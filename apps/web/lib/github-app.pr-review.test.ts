import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn() }),
}));

import { getPrDiff, listPrReviewCommentBodies, postPrReview } from './github-app';

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
