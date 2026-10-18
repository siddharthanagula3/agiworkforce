import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderMarkdown,
  renderMarkdownInto,
  sanitizeHtml,
} from '../src/features/side-panel/markdown';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const catalog = JSON.parse(
  readFileSync(join(APP_ROOT, '_locales', 'en', 'messages.json'), 'utf8'),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

function getMessage(key: string, substitutions: string[] = []): string {
  const entry = catalog[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

function render(text: string): HTMLElement {
  const root = document.createElement('div');
  renderMarkdownInto(root, text);
  return root;
}

function cssRule(source: string, selector: string): string {
  const start = source.indexOf(`    ${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('}', start));
}

beforeEach(() => {
  (globalThis as { chrome?: unknown }).chrome = {
    i18n: { getMessage, getUILanguage: () => 'en' },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bubble width', () => {
  const sidePanel = readFileSync(join(APP_ROOT, 'src', 'side_panel.ts'), 'utf8');

  it('lets every bubble shrink to the column and break an unbroken token', () => {
    const bubble = cssRule(sidePanel, '.sp-bubble');
    expect(bubble).toContain('min-width: 0;');
    expect(bubble).toContain('max-width: 100%;');
    expect(bubble).toContain('overflow-wrap: anywhere;');
  });

  it('still scrolls fenced code sideways instead of wrapping it', () => {
    const pre = cssRule(sidePanel, '.sp-bubble-assistant pre');
    expect(pre).toContain('overflow-x: auto;');
    expect(pre).toContain('white-space: pre;');
  });
});

describe('display maths', () => {
  it('lifts a one-line $$ expression into display maths', () => {
    const root = render('Energy:\n\n$$E = mc^2$$\n\nDone.');
    expect(root.querySelector('.katex-display')).not.toBeNull();
    expect(root.querySelector('annotation')?.textContent).toBe('E = mc^2');
  });

  it('leaves a one-line $$ inside a fenced block as code', () => {
    const root = render('```\n$$E = mc^2$$\nsecond line\n```');
    expect(root.querySelector('pre')?.textContent).toBe('$$E = mc^2$$\nsecond line');
    expect(root.querySelector('.katex')).toBeNull();
  });

  it('leaves $$ inside inline code as code', () => {
    const root = render('Write `$$E = mc^2$$` to get display maths.');
    expect(root.querySelector('code')?.textContent).toBe('$$E = mc^2$$');
    expect(root.querySelector('.katex')).toBeNull();
  });

  it('renders \\[ \\] as display and \\( \\) as inline maths', () => {
    const root = render('Inline \\(a+b\\) and block:\n\n\\[\\frac{1}{2}\\]');
    expect(root.querySelectorAll('.katex')).toHaveLength(2);
    expect(root.querySelectorAll('.katex-display')).toHaveLength(1);
  });
});

describe('inline maths', () => {
  it('renders $...$ with MathML for screen readers', () => {
    const root = render('The area is $\\pi r^2$ here.');
    const katex = root.querySelector('p > span > .katex');
    expect(katex).not.toBeNull();
    expect(katex?.querySelector('math')).not.toBeNull();
  });

  it('keeps currency as text', () => {
    const root = render('It costs $5 to $10 a month.');
    expect(root.querySelector('.katex')).toBeNull();
    expect(root.textContent?.trim()).toBe('It costs $5 to $10 a month.');
  });

  it('shows invalid TeX as an error span instead of throwing', () => {
    const root = render('Broken $\\frac{1}{$ maths');
    expect(root.querySelector('.katex-error')).not.toBeNull();
  });

  it('cannot be reached through raw html in the answer', () => {
    const root = render('<span data-math="inline">x</span>');
    expect(root.querySelector('[data-math]')).toBeNull();
    expect(root.textContent).toContain('<span data-math="inline">x</span>');
  });

  it('does not decorate citation markers inside maths', async () => {
    const { decorateCitations } = await import('../src/features/side-panel/sources');
    const root = render('Index $x_{[1]}$ here');
    decorateCitations(root, [{ url: 'https://example.com', title: 'Example' }]);
    expect(root.querySelector('.sp-citation')).toBeNull();
  });
});

describe('code fences', () => {
  it('renders an unlabeled multiline fence as a code block', () => {
    const root = render('```\nfirst\nsecond\n```');
    expect(root.querySelector('.sp-code-block > pre > code')?.textContent).toBe('first\nsecond');
  });

  it.each(['shell-session', 'c++', 'c#'])('reads %s as the whole language token', (language) => {
    const html = renderMarkdown(`\`\`\`${language}\n$ make\nok\n\`\`\``);
    expect(html).toContain('<pre><code>$ make\nok</code></pre>');
    expect(html).not.toContain(language);
  });
});

describe('footnotes', () => {
  const answer = 'Water boils at 100 C.[^1] See [the method](#method).\n\n[^1]: At sea level.';

  it('links each reference to its note and back, through the sanitizer id prefix', () => {
    const root = render(answer);
    const ref = root.querySelector<HTMLAnchorElement>('sup > a');
    const note = root.querySelector('section li');
    expect(ref?.textContent).toBe('[1]');
    expect(note?.id.startsWith('user-content-')).toBe(true);
    expect(ref?.getAttribute('href')).toBe(`#${note?.id}`);
    expect(ref?.id.startsWith('user-content-')).toBe(true);
    const back = note?.querySelector<HTMLAnchorElement>('a');
    expect(back?.getAttribute('href')).toBe(`#${ref?.id}`);
    expect(back?.getAttribute('aria-label')).toBe('Back to reference 1');
    expect(root.querySelector('section')?.getAttribute('aria-label')).toBe('Footnotes');
    expect(ref?.hasAttribute('target')).toBe(false);
  });

  it('keeps other in-page links as written', () => {
    const root = render(answer);
    const method = [...root.querySelectorAll('a')].find((a) => a.textContent === 'the method');
    expect(method?.getAttribute('href')).toBe('#method');
    expect(method?.hasAttribute('target')).toBe(false);
  });

  it('still opens external links in a new tab', () => {
    const root = render('[docs](https://example.com/docs)');
    expect(root.querySelector('a')?.getAttribute('target')).toBe('_blank');
  });

  it('gives each rendered answer its own footnote ids', () => {
    const first = render(answer).querySelector('section li')?.id;
    const second = render(answer).querySelector('section li')?.id;
    expect(first).not.toBe(second);
  });

  it('prefixes a raw id the sanitizer sees', () => {
    const clean = sanitizeHtml('<p id="location">x</p>');
    expect(clean).toContain('id="user-content-location"');
  });
});

describe('markdown images', () => {
  it('stay links, because the extension CSP only loads images from the extension itself', () => {
    const manifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8')) as {
      content_security_policy: { extension_pages: string };
    };
    expect(manifest.content_security_policy.extension_pages).toContain("img-src 'self' data:;");
    const root = render('![chart](https://example.com/chart.png)');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com/chart.png');
  });
});

describe('code copy', () => {
  function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: writeText ? { writeText } : undefined,
    });
  }

  async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('says a failed copy failed, offers a retry, and copies on the retry', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(undefined);
    stubClipboard(writeText);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const root = render('```\nnpm test\n```');
    const button = root.querySelector<HTMLButtonElement>('.sp-code-block__copy');
    const status = root.querySelector('.sp-code-block__status');
    expect(button?.getAttribute('aria-label')).toBe('Copy code');
    expect(status?.getAttribute('role')).toBe('status');

    button?.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('npm test');
    expect(status?.textContent).toBe('The code could not be copied. Try again.');
    expect(button?.getAttribute('aria-label')).toBe('Retry copying code');
    expect(button?.dataset['state']).toBe('failed');

    button?.click();
    await settle();
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(status?.textContent).toBe('Copied');
    expect(button?.getAttribute('aria-label')).toBe('Copy code');
    expect(open).not.toHaveBeenCalled();
    expect(root.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('reports a failure when the clipboard is unavailable', () => {
    stubClipboard(undefined);
    const root = render('```\nnpm test\n```');
    root.querySelector<HTMLButtonElement>('.sp-code-block__copy')?.click();
    expect(root.querySelector('.sp-code-block__status')?.textContent).toBe(
      'The code could not be copied. Try again.',
    );
  });

  it('clears the copied status after a moment', async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    const root = render('```\nnpm test\n```');
    root.querySelector<HTMLButtonElement>('.sp-code-block__copy')?.click();
    await settle();
    expect(root.querySelector('.sp-code-block__status')?.textContent).toBe('Copied');
    vi.advanceTimersByTime(1500);
    expect(root.querySelector('.sp-code-block__status')?.textContent).toBe('');
  });
});
