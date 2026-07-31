import { describe, expect, it, vi } from 'vitest';
import { findInGitHubRestPages } from './github-rest-pagination';

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
