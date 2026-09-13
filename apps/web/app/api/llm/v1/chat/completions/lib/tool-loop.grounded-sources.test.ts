import { describe, expect, it, vi } from 'vitest';

import { enrichServerSearchResultsLine } from './tool-loop';

/**
 * A grounded source card used to carry a routing redirect for a URL, a bare
 * domain for a title, and nothing for a snippet or a date, while a searched
 * source beside it carried all three. These pin the frame the reader is sent.
 */

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

  it('passes a line that carries no search results straight through', async () => {
    const line = `data: ${JSON.stringify({ choices: [{ delta: { content: 'hello' }, index: 0 }] })}\n\n`;
    expect(await enrichServerSearchResultsLine(line)).toBe(line);
  });
});
