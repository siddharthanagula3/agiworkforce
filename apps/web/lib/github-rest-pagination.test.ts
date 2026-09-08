import { describe, expect, it, vi } from 'vitest';
import { collectGitHubRestPages, findInGitHubRestPages } from './github-rest-pagination';

describe('findInGitHubRestPages', () => {
  it('searches pages without accumulating the full collection', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], totalCount: 3 })
      .mockResolvedValueOnce({ items: [3], totalCount: 3 });

    await expect(
      findInGitHubRestPages({ loadPage, matches: (item) => item === 3, perPage: 2, maxPages: 5 }),
    ).resolves.toBe(3);
    expect(loadPage).toHaveBeenNthCalledWith(1, 1);
    expect(loadPage).toHaveBeenNthCalledWith(2, 2);
  });

  it('treats a present Link header as authoritative', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [1, 2],
        totalCount: 2,
        linkHeader:
          '<https://api.github.com/items?page=2>; rel="next", <https://api.github.com/items?page=2>; rel="last"',
      })
      .mockResolvedValueOnce({ items: [3], totalCount: 3, linkHeader: '' });

    await expect(
      findInGitHubRestPages({ loadPage, matches: (item) => item === 3, perPage: 2, maxPages: 5 }),
    ).resolves.toBe(3);
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('does not follow a Link header that has no next relation', async () => {
    const loadPage = vi.fn().mockResolvedValue({
      items: [1, 2],
      totalCount: 20,
      linkHeader: '<https://api.github.com/items?page=1>; rel="prev first"',
    });

    await expect(
      findInGitHubRestPages({ loadPage, matches: (item) => item === 3, perPage: 2, maxPages: 5 }),
    ).resolves.toBeNull();
    expect(loadPage).toHaveBeenCalledOnce();
  });

  it('fails closed when the collection exceeds the configured page limit', async () => {
    const loadPage = vi.fn().mockResolvedValue({ items: [1, 2], totalCount: 20 });

    await expect(
      findInGitHubRestPages({ loadPage, matches: () => false, perPage: 2, maxPages: 2 }),
    ).rejects.toThrow(/exceeded 2 pages/i);
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('rejects unbounded or invalid pagination settings', async () => {
    const loadPage = vi.fn();
    await expect(
      findInGitHubRestPages({ loadPage, matches: () => false, perPage: 0, maxPages: 1 }),
    ).rejects.toThrow(/positive page size/i);
    await expect(
      findInGitHubRestPages({ loadPage, matches: () => false, perPage: 1, maxPages: 0 }),
    ).rejects.toThrow(/positive page limit/i);
    expect(loadPage).not.toHaveBeenCalled();
  });
});

describe('collectGitHubRestPages', () => {
  it('accumulates every page until the Link header stops naming a next page', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [1, 2],
        linkHeader: '<https://api.github.com/items?page=2>; rel="next"',
      })
      .mockResolvedValueOnce({ items: [3], linkHeader: '' });

    await expect(
      collectGitHubRestPages({ loadPage, perPage: 2, maxPages: 5, maxItems: 100 }),
    ).resolves.toEqual({ items: [1, 2, 3], truncated: false });
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('stops at the item ceiling and says the answer is partial', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], totalCount: 20 })
      .mockResolvedValueOnce({ items: [3, 4], totalCount: 20 });

    await expect(
      collectGitHubRestPages({ loadPage, perPage: 2, maxPages: 5, maxItems: 3 }),
    ).resolves.toEqual({ items: [1, 2, 3], truncated: true });
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('reports truncation rather than throwing when the page limit is reached', async () => {
    const loadPage = vi.fn().mockResolvedValue({ items: [1, 2], totalCount: 20 });

    await expect(
      collectGitHubRestPages({ loadPage, perPage: 2, maxPages: 2, maxItems: 100 }),
    ).resolves.toEqual({ items: [1, 2, 1, 2], truncated: true });
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('rejects an unbounded item limit before it calls the loader', async () => {
    const loadPage = vi.fn();
    await expect(
      collectGitHubRestPages({ loadPage, perPage: 1, maxPages: 1, maxItems: 0 }),
    ).rejects.toThrow(/positive item limit/i);
    expect(loadPage).not.toHaveBeenCalled();
  });
});
