import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { buildContextAttachment } from '../data/composerContext';

type ContextBuilderModule = typeof import('../data/contextBuilder');

vi.mock('../data/contextBuilder', async (importOriginal) => ({
  ...(await importOriginal<ContextBuilderModule>()),
  getContextBuilder: vi.fn(),
}));

const HOSTILE_BUDGET_MS = 2000;

async function attachPage(html: string): Promise<{ text: string | undefined; ms: number }> {
  vi.mocked(vscode.window.showInputBox).mockResolvedValue('https://example.com/page');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
      ),
  );
  const started = performance.now();
  const attachment = await buildContextAttachment('url');
  return { text: attachment?.text, ms: performance.now() - started };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('attaching a hostile web page', () => {
  it.each([
    ['unterminated script openers', '<script '.repeat(65_000)],
    ['unterminated less-than signs', '<'.repeat(160_000)],
    ['unterminated svg openers inside a page', `<p>x</p>${'<svg '.repeat(70_000)}`],
  ])('reads %s in linear time', async (_label, html) => {
    const { text, ms } = await attachPage(html);
    expect(text).toContain('Content of https://example.com/page:');
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
  });
});

describe('attaching a real-shaped web page', () => {
  it('drops scripts and styles, breaks on block tags and decodes entities', async () => {
    const { text } = await attachPage(
      '<html><head><style>p{color:red}</style><SCRIPT type="x">var a = "<p>";</SCRIPT></head>' +
        '<body><h1>Title &amp; more</h1><p>First<br/>line</p><div>Second &lt;b&gt;</div>' +
        '<noscript>enable js</noscript><svg><path d="M0"/></svg><p>1 < 2 and 3 > 2 <a href="x">link</a></p></body></html>',
    );
    expect(text).toBe(
      'Content of https://example.com/page:\nTitle & more\nFirst\nline\nSecond <b>\n1 2 link',
    );
  });

  it.each([
    ['&amp;lt;script&amp;gt;', '&lt;script&gt;'],
    ['&amp;amp;', '&amp;'],
    ['&amp;quot; &amp;#39; &amp;nbsp;', '&quot; &#39; &nbsp;'],
    ['a&nbsp;b &quot;q&quot; it&#39;s &lt;i&gt; &amp; &unknown;', 'a b "q" it\'s <i> & &unknown;'],
  ])('decodes each entity once in %j', async (html, expected) => {
    const { text } = await attachPage(`<p>${html}</p>`);
    expect(text).toBe(`Content of https://example.com/page:\n${expected}`);
  });

  it('keeps text after an unclosed script and still drops a closed style', async () => {
    const { text } = await attachPage('<script>never closed <style>x</style> tail');
    expect(text).toBe('Content of https://example.com/page:\nnever closed tail');
  });

  it.each([
    ['<p>Use List<> in Java</p>', 'Use List<> in Java'],
    ['ab<>cd', 'ab<>cd'],
    ['1 <', '1 <'],
    ['a < b', 'a < b'],
    ['a <b', 'a <b'],
    ['a <> <i>b</i> <>', 'a <> b <>'],
  ])('keeps the text around an empty or unfinished tag in %j', async (html, expected) => {
    const { text } = await attachPage(html);
    expect(text).toBe(`Content of https://example.com/page:\n${expected}`);
  });

  it('drops an element whose closing tag differs only in case', async () => {
    const { text } = await attachPage('a<STYLE>x</style>b');
    expect(text).toBe('Content of https://example.com/page:\na b');
  });
});
