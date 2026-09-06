import { describe, expect, it, vi } from 'vitest';

import {
  fetchDirectoryDetail,
  fetchPublicDirectory,
  parseDirectoryDetail,
  parseDirectoryListing,
  parseDirectoryPageParam,
  worksWithFromLabel,
} from '../public-directory';
import { cardHtml, listingHtml } from './fixtures';

describe('parseDirectoryListing', () => {
  it('reads slug, name, description, badge, installs and works-with from each card', () => {
    const cards = parseDirectoryListing(
      listingHtml([
        cardHtml('frontend-design', {
          name: 'Frontend Design',
          installs: '12,300',
          verified: true,
        }),
        cardHtml('sales', { name: 'Sales', worksWith: ['Cowork'] }),
      ]),
    );
    expect(cards).toEqual([
      {
        slug: 'frontend-design',
        name: 'Frontend Design',
        description: 'Description for frontend-design & friends.',
        verified: true,
        installs: 12300,
        worksWith: ['claude-code'],
      },
      {
        slug: 'sales',
        name: 'Sales',
        description: 'Description for sales & friends.',
        verified: false,
        installs: null,
        worksWith: ['cowork'],
      },
    ]);
  });

  it('finds the pagination parameter the first page advertises', () => {
    expect(parseDirectoryPageParam(listingHtml([], 'ab12cd_page'))).toBe('ab12cd_page');
    expect(parseDirectoryPageParam('<html></html>')).toBeNull();
  });

  it('maps works-with labels and ignores unknown ones', () => {
    expect(worksWithFromLabel('Claude Code')).toBe('claude-code');
    expect(worksWithFromLabel('Claude Cowork')).toBe('cowork');
    expect(worksWithFromLabel('Desktop')).toBeNull();
  });
});

describe('parseDirectoryDetail', () => {
  it('extracts the CLI install command and the first github repository link', () => {
    const html = [
      '<button data-copy="claude plugin install superpowers@claude-plugins-official">Copy</button>',
      '<button data-copy="">Copy</button>',
      '<a href="https://github.com/obra/superpowers">Source</a>',
    ].join('');
    expect(parseDirectoryDetail(html)).toEqual({
      installCommand: 'claude plugin install superpowers@claude-plugins-official',
      repositoryUrl: 'https://github.com/obra/superpowers',
    });
  });

  it('returns nulls for a Cowork-only page', () => {
    expect(parseDirectoryDetail('<button data-copy="">Copy</button>')).toEqual({
      installCommand: null,
      repositoryUrl: null,
    });
  });
});

describe('fetchPublicDirectory', () => {
  it('walks pages until one adds nothing new and dedupes by slug', async () => {
    const pages = [
      listingHtml([cardHtml('a'), cardHtml('b')]),
      listingHtml([cardHtml('b'), cardHtml('c')]),
      listingHtml([cardHtml('c')]),
    ];
    const fetchImpl = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get('cc61befa_page') ?? '1');
      return new Response(pages[page - 1] ?? listingHtml([]), { status: 200 });
    });
    const result = await fetchPublicDirectory(fetchImpl);
    expect(result.cards.map((card) => card.slug)).toEqual(['a', 'b', 'c']);
    expect(result.pagesFetched).toBe(3);
    expect(result.complete).toBe(true);
  });

  it('stops at the deadline and reports an incomplete crawl', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return new Response(listingHtml([cardHtml(`p${calls}`)]), { status: 200 });
    });
    let clock = 0;
    const result = await fetchPublicDirectory(fetchImpl, 2, () => (clock += 1));
    expect(result.pagesFetched).toBe(1);
    expect(result.complete).toBe(false);
  });

  it('treats a failed first page as an empty listing', async () => {
    const result = await fetchPublicDirectory(async () => new Response('', { status: 503 }));
    expect(result).toEqual({ cards: [], pagesFetched: 0, complete: false });
  });
});

describe('fetchDirectoryDetail', () => {
  it('returns null when the page cannot be fetched', async () => {
    await expect(
      fetchDirectoryDetail('x', async () => {
        throw new Error('offline');
      }),
    ).resolves.toBeNull();
  });
});
