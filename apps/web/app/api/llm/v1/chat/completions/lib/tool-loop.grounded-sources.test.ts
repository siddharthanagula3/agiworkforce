import { describe, expect, it, vi } from 'vitest';

import { enrichServerSearchResultsLine, serverToolResultSources } from './tool-loop';

/**
 * A grounded source card used to carry a routing redirect for a URL, a bare
 * domain for a title, and nothing for a snippet or a date, while a searched
 * source beside it carried all three. These pin the frame the reader is sent.
 */

const OPAQUE_PROVIDER_TOKEN =
  'EqoDCioIBhgCIiQ0NGFlNjc2Yy05NThmLTRkNjQtYTQ3ZS0wNzMxNjZhNzE3ODQSDBlC8ePkQx7r9XmXrRoMbXNhdGVzLWNoYXQtMSIwTWQ2ZXF0V3pJcVhqR1RkUmF4eXpWbnZ4c0Y1K1FyNE1PeFRtWlZGU0dKZz0=';
const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZ123';

function frame(content: unknown[]): string {
  return `data: ${JSON.stringify({
    choices: [
      { delta: { x_search_results: { type: 'web_search_tool_result', content } }, index: 0 },
    ],
    model: 'test-model',
  })}\n\n`;
}

function parseFrame(line: string): Array<Record<string, unknown>> {
  const event = JSON.parse(line.trim().slice(6)) as {
    choices: Array<{ delta: { x_search_results: { content: Array<Record<string, unknown>> } } }>;
  };
  return event.choices[0]!.delta.x_search_results.content;
}

describe('enrichServerSearchResultsLine', () => {
  it('resolves the redirect and fills the title, snippet and date from the page', async () => {
    const out = await enrichServerSearchResultsLine(
      frame([{ type: 'web_search_result', url: REDIRECT, title: 'intel.com' }]),
      {
        resolveRedirects: (async (rows: Array<{ url: string }>) =>
          rows.map((row) => ({
            ...row,
            url: 'https://intel.example/newsroom/ceo',
          }))) as never,
        enrichTitles: (async (rows: Array<Record<string, unknown>>) =>
          rows.map((row) => ({
            ...row,
            title: 'Intel names a new chief executive',
            snippet: 'The board appointed a new chief executive effective immediately.',
            date: '2026-03-12',
          }))) as never,
      },
    );

    expect(parseFrame(out)[0]).toMatchObject({
      url: 'https://intel.example/newsroom/ceo',
      title: 'Intel names a new chief executive',
      encrypted_content: 'The board appointed a new chief executive effective immediately.',
      page_age: '2026-03-12',
    });
  });

  it('leaves a frame that already carries all three fields untouched and unfetched', async () => {
    const resolveRedirects = vi.fn();
    const enrichTitles = vi.fn();
    const line = frame([
      {
        type: 'web_search_result',
        url: 'https://publisher.example/story',
        title: 'A story',
        encrypted_content: 'What the story says.',
        page_age: '2026-09-01',
      },
    ]);

    expect(
      await enrichServerSearchResultsLine(line, {
        resolveRedirects: resolveRedirects as never,
        enrichTitles: enrichTitles as never,
      }),
    ).toBe(line);
    expect(resolveRedirects).not.toHaveBeenCalled();
    expect(enrichTitles).not.toHaveBeenCalled();
  });

  it('keeps the redirect when nothing resolves, because an emptied href is dead immediately', async () => {
    const out = await enrichServerSearchResultsLine(
      frame([{ type: 'web_search_result', url: REDIRECT, title: 'intel.com' }]),
      {
        resolveRedirects: (async (rows: unknown) => rows) as never,
        enrichTitles: (async (rows: unknown) => rows) as never,
      },
    );

    expect(parseFrame(out)[0]).toMatchObject({ url: REDIRECT, title: 'intel.com' });
  });

  it("replaces a bare-domain title with the page's real one", async () => {
    const out = await enrichServerSearchResultsLine(
      frame([{ type: 'web_search_result', url: REDIRECT, title: 'intel.com' }]),
      {
        resolveRedirects: (async (rows: Array<{ url: string }>) =>
          rows.map((row) => ({ ...row, url: 'https://intel.example/newsroom/ceo' }))) as never,
        enrichTitles: (async (rows: Array<Record<string, unknown>>) => {
          expect(rows[0]?.['title']).toBe('');
          return rows.map((row) => ({ ...row, title: 'Intel appoints a chief executive' }));
        }) as never,
      },
    );
    expect(parseFrame(out)[0]).toMatchObject({ title: 'Intel appoints a chief executive' });
  });

  it('keeps a real title the provider reported', async () => {
    const out = await enrichServerSearchResultsLine(
      frame([{ type: 'web_search_result', url: REDIRECT, title: 'Intel names its next chief' }]),
      {
        resolveRedirects: (async (rows: unknown) => rows) as never,
        enrichTitles: (async (rows: Array<Record<string, unknown>>) => {
          expect(rows[0]?.['title']).toBe('Intel names its next chief');
          return rows;
        }) as never,
      },
    );
    expect(parseFrame(out)[0]).toMatchObject({ title: 'Intel names its next chief' });
  });

  it('withholds an opaque provider token from the snippet the reader is sent, without a fetch', async () => {
    const resolveRedirects = vi.fn();
    const enrichTitles = vi.fn();
    const out = await enrichServerSearchResultsLine(
      frame([
        {
          type: 'web_search_result',
          url: 'https://www.w3.org/TR/WCAG22/',
          title: 'Web Content Accessibility Guidelines (WCAG) 2.2',
          encrypted_content: OPAQUE_PROVIDER_TOKEN,
          page_age: '2024-12-12',
        },
      ]),
      { resolveRedirects: resolveRedirects as never, enrichTitles: enrichTitles as never },
    );

    expect(parseFrame(out)[0]).toMatchObject({
      url: 'https://www.w3.org/TR/WCAG22/',
      title: 'Web Content Accessibility Guidelines (WCAG) 2.2',
      encrypted_content: '',
    });
    expect(out).not.toContain(OPAQUE_PROVIDER_TOKEN);
    expect(resolveRedirects).not.toHaveBeenCalled();
    expect(enrichTitles).not.toHaveBeenCalled();
  });

  it('keeps the opaque token out of the receipt sources too', () => {
    expect(
      serverToolResultSources([
        {
          type: 'web_search_result',
          url: 'https://www.w3.org/TR/WCAG22/',
          title: 'WCAG 2.2',
          encrypted_content: OPAQUE_PROVIDER_TOKEN,
        },
        {
          type: 'web_search_result',
          url: 'https://example.com',
          title: 'Example',
          encrypted_content: 'A readable summary.',
        },
      ]),
    ).toEqual([
      { url: 'https://www.w3.org/TR/WCAG22/', title: 'WCAG 2.2' },
      { url: 'https://example.com', title: 'Example', snippet: 'A readable summary.' },
    ]);
  });

  it('passes a line that carries no search results straight through', async () => {
    const line = `data: ${JSON.stringify({ choices: [{ delta: { content: 'hello' }, index: 0 }] })}\n\n`;
    expect(await enrichServerSearchResultsLine(line)).toBe(line);
  });
});
