import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../MermaidDiagram', () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre>{source}</pre>,
}));

vi.mock('../HighlightedCode', () => ({
  HighlightedCode: ({ code, language }: { code: string; language: string }) => (
    <code data-testid="highlighted" data-language={language}>
      {code}
    </code>
  ),
}));

const { MarkdownContent } = await import('../MarkdownContent');

beforeEach(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

function renderMarkdown(content: string) {
  return render(<MarkdownContent content={content} />).container;
}

describe('lists', () => {
  it('nests an unordered list inside its parent item rather than beside it', () => {
    const container = renderMarkdown('- outer\n  - inner\n    - deepest\n- sibling');

    const outer = container.querySelector('ul');
    expect(outer?.children).toHaveLength(2);
    const nested = outer?.querySelector('li > ul');
    expect(nested).not.toBeNull();
    expect(nested?.querySelector('li > ul > li')?.textContent).toContain('deepest');
  });

  it('nests an ordered list inside an unordered one and keeps both markers', () => {
    const container = renderMarkdown('- outer\n  1. first\n  2. second');

    const nested = container.querySelector('ul > li > ol');
    expect(nested?.className).toContain('list-decimal');
    expect(container.querySelector('ul')?.className).toContain('list-disc');
    expect(nested?.querySelectorAll('li')).toHaveLength(2);
  });

  it('starts an ordered list at the number the author wrote, not at one', () => {
    const container = renderMarkdown('5. five\n6. six');

    const list = container.querySelector('ol');
    expect(list?.getAttribute('start')).toBe('5');
    expect(list?.querySelectorAll('li')).toHaveLength(2);
  });

  it('numbers a plain ordered list from one with no start attribute', () => {
    expect(renderMarkdown('1. one\n2. two').querySelector('ol')?.getAttribute('start')).toBeNull();
  });

  it('restarts numbering for a nested ordered list', () => {
    const container = renderMarkdown('1. one\n   1. inner one\n   2. inner two\n2. two');

    const nested = container.querySelector('ol > li > ol');
    expect(nested?.getAttribute('start')).toBeNull();
    expect(nested?.querySelectorAll('li')).toHaveLength(2);
  });
});

describe('blockquote', () => {
  it('renders a quote with its own boundary and drops the trailing margin', () => {
    const container = renderMarkdown('> a quoted line\n>\n> and a second paragraph');

    const quote = container.querySelector('blockquote');
    expect(quote?.className).toContain('border-l-2');
    expect(quote?.querySelectorAll('p')).toHaveLength(2);
  });

  it('nests a quote inside a quote', () => {
    const container = renderMarkdown('> outer\n>\n> > inner');

    expect(container.querySelector('blockquote > blockquote')?.textContent).toContain('inner');
  });

  it('keeps a list inside a quote a list', () => {
    const container = renderMarkdown('> - one\n> - two');

    expect(container.querySelectorAll('blockquote ul > li')).toHaveLength(2);
  });
});

describe('long content', () => {
  const LONG_URL = `https://example.com/${'segment-'.repeat(30)}end`;

  it('lets a long url break inside the word rather than overflow the bubble', () => {
    renderMarkdown(`See ${LONG_URL} for the detail.`);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(LONG_URL);
    expect(link.className).toContain('break-words');
  });

  it('breaks a paragraph with no whitespace at all', () => {
    const container = renderMarkdown('x'.repeat(4000));

    const paragraph = container.querySelector('p');
    expect(paragraph?.className).toContain('break-words');
    expect(paragraph?.textContent).toHaveLength(4000);
  });

  it('breaks a long unbroken token inside a list item and a table cell', () => {
    const token = 'y'.repeat(600);
    const container = renderMarkdown(`- ${token}\n\n| a |\n| --- |\n| ${token} |`);

    expect(container.querySelector('li')?.className).toContain('break-words');
    expect(container.querySelector('td')?.className).toContain('break-words');
  });

  it('keeps an extremely long code line scrollable instead of wrapping it', () => {
    const container = renderMarkdown(`\`\`\`python\nprint("${'z'.repeat(2000)}")\n\`\`\``);

    const pre = container.querySelector('.code-block-body pre');
    expect(pre?.getAttribute('tabindex')).toBe('0');
    expect(pre?.className ?? '').not.toContain('break-words');
  });
});

describe('tables', () => {
  const TABLE = [
    '| Region | Q1 | Q2 | Q3 | Q4 |',
    '| --- | --- | --- | --- | --- |',
    '| North | 1 | 2 | 3 | 4 |',
    '| South | 5 | 6 | 7 | 8 |',
  ].join('\n');

  it('puts a wide table in a scroll region a keyboard can reach', () => {
    renderMarkdown(TABLE);

    const region = screen.getByRole('region', { name: 'Table' });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.className).toContain('overflow-x-auto');
    expect(region.className).toContain('max-w-full');
  });

  it('keeps the table itself at the width of its container, so a narrow one does not stretch', () => {
    const container = renderMarkdown(TABLE);
    expect(container.querySelector('table')?.className).toContain('w-full');
  });

  it('renders the header row as header cells and the body rows as data cells', () => {
    renderMarkdown(TABLE);

    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByRole('cell')).toHaveLength(10);
  });

  it('aligns cells to the top so a wrapped cell does not float its neighbours', () => {
    const container = renderMarkdown(TABLE);
    expect(container.querySelector('td')?.className).toContain('align-top');
    expect(container.querySelector('th')?.className).toContain('align-top');
  });
});

describe('math', () => {
  it('renders inline math inline, inside the sentence that carries it', () => {
    const container = renderMarkdown('The identity $E = mc^2$ still holds.');

    const paragraph = container.querySelector('p');
    expect(paragraph?.querySelector('.katex')).not.toBeNull();
    expect(paragraph?.querySelector('.katex-display')).toBeNull();
    expect(paragraph?.textContent).toContain('still holds');
  });

  it('renders a fenced block as display math', () => {
    const container = renderMarkdown('Before\n\n$$\n\\int_0^1 x^2 dx\n$$\n\nAfter');

    expect(container.querySelector('.katex-display')).not.toBeNull();
  });

  it('renders one-line block math as display math, not as inline math', () => {
    const container = renderMarkdown('Before\n\n$$\\int_0^1 x^2 dx$$\n\nAfter');

    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.textContent).toContain('Before');
    expect(container.textContent).toContain('After');
  });

  it('renders bracket-delimited block math as display math', () => {
    const container = renderMarkdown('Given \\[ a^2 + b^2 = c^2 \\] we are done.');

    expect(container.querySelector('.katex-display')).not.toBeNull();
  });

  it('carries the source expression for assistive technology', () => {
    const container = renderMarkdown('The identity $E = mc^2$ still holds.');

    expect(container.querySelector('annotation')?.textContent).toBe('E = mc^2');
  });

  it('leaves a price alone rather than reading it as math', () => {
    const container = renderMarkdown('It costs $2,499 and ships in $3,000 cases.');

    expect(container.querySelector('.katex')).toBeNull();
    expect(container.textContent).toContain('$2,499');
  });
});

describe('code blocks', () => {
  const LANGUAGES = [
    'python',
    'typescript',
    'tsx',
    'rust',
    'go',
    'java',
    'csharp',
    'sql',
    'bash',
    'json',
    'yaml',
    'html',
    'css',
    'ruby',
    'swift',
    'kotlin',
    'php',
    'diff',
  ];

  it.each(LANGUAGES)('labels a %s block and hands the language to the highlighter', (language) => {
    const container = renderMarkdown(`\`\`\`${language}\nline one\n\`\`\``);

    expect(container.querySelector('.code-block-lang-label')?.textContent).toBe(language);
    expect(screen.getByTestId('highlighted').getAttribute('data-language')).toBe(language);
  });

  it('renders a fence with no language as plain code with no header bar', () => {
    const container = renderMarkdown('```\nline one\n```');

    expect(container.querySelector('.code-block-lang-label')).toBeNull();
    expect(container.textContent).toContain('line one');
  });

  it('keeps an inline span inline rather than opening a block', () => {
    const container = renderMarkdown('Call `useMenuKeyboard` before shipping.');

    expect(container.querySelector('.code-block-container')).toBeNull();
    expect(container.querySelector('p code')?.textContent).toBe('useMenuKeyboard');
  });

  it('names the code block for a screen reader that lands on the scroll region', () => {
    const container = renderMarkdown('```rust\nfn main() {}\n```');

    expect(container.querySelector('.code-block-body pre')?.getAttribute('aria-label')).toBe(
      'rust code block',
    );
  });
});
