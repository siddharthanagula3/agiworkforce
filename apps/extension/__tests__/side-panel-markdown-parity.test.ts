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

async function render(text: string): Promise<HTMLElement> {
  const root = document.createElement('div');
  await renderMarkdownInto(root, text);
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

describe('lazy maths', () => {
  it('loads the maths renderer only once an answer contains maths', async () => {
    const styles = (): number => document.head.querySelectorAll('style').length;
    const before = styles();
    await render('Plain answer with `code`, a $ sign and $5 to $10.');
    expect(styles()).toBe(before);
    await render('Now $x^2$.');
    expect(styles()).toBe(before + 1);
    await render('And $y$.');
    expect(styles()).toBe(before + 1);
  });
});

describe('bubble width', () => {
  const sidePanel = readFileSync(join(APP_ROOT, 'src', 'side_panel.ts'), 'utf8');

  it('lets every bubble shrink to the column and break an unbroken token', async () => {
    const bubble = cssRule(sidePanel, '.sp-bubble');
    expect(bubble).toContain('min-width: 0;');
    expect(bubble).toContain('max-width: 100%;');
    expect(bubble).toContain('overflow-wrap: anywhere;');
  });

  it('still scrolls fenced code sideways instead of wrapping it', async () => {
    const pre = cssRule(sidePanel, '.sp-bubble-assistant pre');
    expect(pre).toContain('overflow-x: auto;');
    expect(pre).toContain('white-space: pre;');
  });
});

describe('display maths', () => {
  it('lifts a one-line $$ expression into display maths', async () => {
    const root = await render('Energy:\n\n$$E = mc^2$$\n\nDone.');
    expect(root.querySelector('.katex-display')).not.toBeNull();
    expect(root.querySelector('annotation')?.textContent).toBe('E = mc^2');
  });

  it('leaves a one-line $$ inside a fenced block as code', async () => {
    const root = await render('```\n$$E = mc^2$$\nsecond line\n```');
    expect(root.querySelector('pre')?.textContent).toBe('$$E = mc^2$$\nsecond line');
    expect(root.querySelector('.katex')).toBeNull();
  });

  it('leaves $$ inside inline code as code', async () => {
    const root = await render('Write `$$E = mc^2$$` to get display maths.');
    expect(root.querySelector('code')?.textContent).toBe('$$E = mc^2$$');
    expect(root.querySelector('.katex')).toBeNull();
  });

  it('renders a multiline $$ block', async () => {
    const root = await render('$$\na = b\n+ c\n$$');
    expect(root.querySelector('.katex-display')).not.toBeNull();
    expect(root.querySelector('annotation')?.textContent).toBe('a = b\n+ c');
  });

  it('keeps an unclosed $$ as text while the answer streams', async () => {
    const root = await render('$$\na = b');
    expect(root.querySelector('[data-math]')).toBeNull();
    expect(root.textContent).toContain('$$');
  });

  it('keeps $$ inside a sentence in the paragraph', async () => {
    const root = await render('So $$x^2$$ holds.');
    expect(root.querySelector('p [data-math="display"] .katex-display')).not.toBeNull();
  });

  it('renders \\[ \\] as display and \\( \\) as inline maths', async () => {
    const root = await render('Inline \\(a+b\\) and block:\n\n\\[\\frac{1}{2}\\]');
    expect(root.querySelectorAll('.katex')).toHaveLength(2);
    expect(root.querySelectorAll('.katex-display')).toHaveLength(1);
  });
});

describe('inline maths', () => {
  it('renders $...$ with MathML for screen readers', async () => {
    const root = await render('The area is $\\pi r^2$ here.');
    const katex = root.querySelector('p > span > .katex');
    expect(katex).not.toBeNull();
    expect(katex?.querySelector('math')).not.toBeNull();
  });

  it('ignores a dollar glued to a word', async () => {
    const root = await render('Use a$b$c or $HOME and $PATH.');
    expect(root.querySelector('[data-math]')).toBeNull();
  });

  it('keeps currency as text', async () => {
    const root = await render('It costs $5 to $10 a month.');
    expect(root.querySelector('.katex')).toBeNull();
    expect(root.textContent?.trim()).toBe('It costs $5 to $10 a month.');
  });

  it('shows invalid TeX as an error span instead of throwing', async () => {
    const root = await render('Broken $\\frac{1}{$ maths');
    expect(root.querySelector('.katex-error')).not.toBeNull();
  });

  it('cannot be reached through raw html in the answer', async () => {
    const root = await render('<span data-math="inline">x</span>');
    expect(root.querySelector('[data-math]')).toBeNull();
    expect(root.textContent).toContain('<span data-math="inline">x</span>');
  });

  it('does not decorate citation markers inside maths', async () => {
    const { decorateCitations } = await import('../src/features/side-panel/sources');
    const root = await render('Index $x_{[1]}$ here');
    decorateCitations(root, [{ url: 'https://example.com', title: 'Example' }]);
    expect(root.querySelector('.sp-citation')).toBeNull();
  });
});

describe('code fences', () => {
  it('renders an unlabeled multiline fence as a code block', async () => {
    const root = await render('```\nfirst\nsecond\n```');
    expect(root.querySelector('.sp-code-block > pre > code')?.textContent).toBe('first\nsecond');
  });

  it.each(['shell-session', 'c++', 'c#'])(
    'reads %s as the whole language token',
    async (language) => {
      const html = renderMarkdown(`\`\`\`${language}\n$ make\nok\n\`\`\``);
      expect(html).toContain(`<pre data-lang="${language}"><code>$ make\nok</code></pre>`);
      expect(html.slice(html.indexOf('<code>'))).not.toContain(language);
    },
  );
});

describe('footnotes', () => {
  const answer = 'Water boils at 100 C.[^1] See [the method](#method).\n\n[^1]: At sea level.';

  it('links each reference to its note and back, through the sanitizer id prefix', async () => {
    const root = await render(answer);
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

  it('keeps other in-page links as written', async () => {
    const root = await render(answer);
    const method = [...root.querySelectorAll('a')].find((a) => a.textContent === 'the method');
    expect(method?.getAttribute('href')).toBe('#method');
    expect(method?.hasAttribute('target')).toBe(false);
  });

  it('still opens external links in a new tab', async () => {
    const root = await render('[docs](https://example.com/docs)');
    expect(root.querySelector('a')?.getAttribute('target')).toBe('_blank');
  });

  it('gives each rendered answer its own footnote ids', async () => {
    const first = (await render(answer)).querySelector('section li')?.id;
    const second = (await render(answer)).querySelector('section li')?.id;
    expect(first).not.toBe(second);
  });

  it('prefixes a raw id the sanitizer sees', async () => {
    const clean = sanitizeHtml('<p id="location">x</p>');
    expect(clean).toContain('id="user-content-location"');
  });
});

describe('markdown images', () => {
  const loadButton = (root: HTMLElement): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>('.sp-md-image-notice button');

  it('stays a link until the user loads it from that host', async () => {
    const root = await render('![Sales chart](https://img.example.com/blocked.png)');
    expect(root.querySelector('img')).toBeNull();
    const link = root.querySelector<HTMLAnchorElement>('.sp-md-image-notice a');
    expect(link?.getAttribute('href')).toBe('https://img.example.com/blocked.png');
    expect(link?.textContent).toBe('Sales chart');
    expect(root.querySelector('.sp-md-image-notice')?.textContent).toContain(
      'Image from img.example.com',
    );
    expect(loadButton(root)?.getAttribute('aria-label')).toBe('Load image from img.example.com');
  });

  it('loads an approved image without a referrer and remembers the approval', async () => {
    const root = await render('![Sales chart](https://img.example.com/approved.png "Q3")');
    document.body.appendChild(root);
    loadButton(root)?.click();
    const img = root.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://img.example.com/approved.png');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img?.alt).toBe('Sales chart');
    expect(root.querySelector('a.sp-md-image')?.getAttribute('aria-label')).toBe(
      'Open image in a new tab: Sales chart',
    );
    expect(document.activeElement).toBe(root.querySelector('a.sp-md-image'));
    root.remove();

    const again = await render('![Sales chart](https://img.example.com/approved.png#frag)');
    expect(again.querySelector('img')).not.toBeNull();
    const other = await render('![x](https://img.example.com/other.png)');
    expect(other.querySelector('img')).toBeNull();
  });

  it('offers two retries and a download link when the image fails', async () => {
    const root = await render('![Sales chart](https://img.example.com/broken.png)');
    loadButton(root)?.click();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      root.querySelector('img')?.dispatchEvent(new Event('error'));
      const failed = root.querySelector('.sp-md-image-notice');
      expect(failed?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
        'Image failed to load: Sales chart',
      );
      const download = failed?.querySelector<HTMLAnchorElement>('a[download]');
      expect(download?.getAttribute('href')).toBe('https://img.example.com/broken.png');
      expect(download?.textContent).toBe('Download image');
      const retry = failed?.querySelector<HTMLButtonElement>('button');
      expect(retry?.textContent).toBe('Retry');
      retry?.click();
      expect(root.querySelector('img')).not.toBeNull();
    }
    root.querySelector('img')?.dispatchEvent(new Event('error'));
    expect(root.querySelector('.sp-md-image-notice button')).toBeNull();
    expect(root.querySelector('.sp-md-image-notice a[download]')).not.toBeNull();
  });

  it('offers no load button for an image inside a link', async () => {
    const root = await render('[![badge](https://img.example.com/badge.png)](https://example.com)');
    expect(loadButton(root)).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(root.querySelector('a')?.textContent).toBe('badge');
  });

  it('keeps a non-web image source as text', async () => {
    const root = await render('![x](javascript:alert(1))');
    expect(root.querySelector('img, a')).toBeNull();
  });
});

describe('message copy', () => {
  it('says a failed copy failed, offers a retry, and copies on the retry', async () => {
    const { buildBubbleWithTools } = await import('../src/features/side-panel/bubbles');
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const node = buildBubbleWithTools({
      id: 'm1',
      role: 'assistant',
      content: 'the answer is 42',
      timestamp: 0,
    });
    const button = node.querySelector<HTMLButtonElement>('.sp-bubble-actions .sp-copy-btn');
    const status = node.querySelector('.sp-bubble-actions .sp-copy-status');
    expect(button?.getAttribute('aria-label')).toBe('Copy response');
    expect(status?.getAttribute('role')).toBe('status');

    button?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('the answer is 42');
    expect(status?.textContent).toBe('Could not copy. Try again.');
    expect(button?.getAttribute('aria-label')).toBe('Retry copy');

    button?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(status?.textContent).toBe('');
    expect(button?.getAttribute('aria-label')).toBe('Copy response');
    expect(button?.classList.contains('copied')).toBe(true);
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
    const root = await render('```\nnpm test\n```');
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

  it('reports a failure when the clipboard is unavailable', async () => {
    stubClipboard(undefined);
    const root = await render('```\nnpm test\n```');
    root.querySelector<HTMLButtonElement>('.sp-code-block__copy')?.click();
    expect(root.querySelector('.sp-code-block__status')?.textContent).toBe(
      'The code could not be copied. Try again.',
    );
  });

  it('clears the copied status after a moment', async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    const root = await render('```\nnpm test\n```');
    root.querySelector<HTMLButtonElement>('.sp-code-block__copy')?.click();
    await settle();
    expect(root.querySelector('.sp-code-block__status')?.textContent).toBe('Copied');
    vi.advanceTimersByTime(1500);
    expect(root.querySelector('.sp-code-block__status')?.textContent).toBe('');
  });
});

describe('code blocks match web', () => {
  it('labels the language and colours tokens with the shared web highlighter', async () => {
    const root = await render('```ts\nconst sum = (a: number, b: number) => a + b;\n```');
    const block = root.querySelector('.sp-code-block')!;
    expect(block.querySelector('.sp-code-block__lang')?.textContent).toBe('ts');
    const tokens = block.querySelectorAll<HTMLElement>('pre code .shiki-token');
    expect(tokens.length).toBeGreaterThan(3);
    expect(block.querySelector('pre code')?.textContent).toBe(
      'const sum = (a: number, b: number) => a + b;',
    );
    expect(Array.from(tokens).some((token) => token.style.getPropertyValue('--shiki-dark'))).toBe(
      true,
    );
  });

  it('leaves an unlabelled or unknown fence as plain text', async () => {
    const root = await render('```\nplain\n```\n\n```nosuchlang\nmore\n```');
    expect(root.querySelectorAll('.shiki-token')).toHaveLength(0);
    const labels = Array.from(root.querySelectorAll('.sp-code-block__lang')).map(
      (label) => label.textContent,
    );
    expect(labels).toEqual(['', 'nosuchlang']);
  });
});
