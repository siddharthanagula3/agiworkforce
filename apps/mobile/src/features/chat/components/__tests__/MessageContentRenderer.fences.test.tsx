import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

const mockMathCalls: { latex: string; display: boolean }[] = [];

jest.mock('../MathBlock', () => ({
  MathBlock: ({ latex, display }: { latex: string; display: boolean }) => {
    mockMathCalls.push({ latex, display });
    return null;
  },
}));

import { renderMarkdownContent, type MarkdownRenderOptions } from '../MessageContentRenderer';

function renderMarkdown(content: string, options?: MarkdownRenderOptions) {
  return render(<>{renderMarkdownContent(content, undefined, options)}</>);
}

async function copiedCode(content: string, options?: MarkdownRenderOptions): Promise<string[]> {
  const screen = renderMarkdown(content, options);
  const copied: string[] = [];
  for (const button of screen.queryAllByLabelText('Copy code')) {
    (Clipboard.setStringAsync as jest.Mock).mockClear();
    fireEvent.press(button);
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1));
    copied.push((Clipboard.setStringAsync as jest.Mock).mock.calls[0][0] as string);
  }
  return copied;
}

beforeEach(() => {
  mockMathCalls.length = 0;
});

describe('fenced code follows CommonMark', () => {
  it('copies a first line that starts with four spaces with those spaces', async () => {
    expect(await copiedCode('```python\n    return x\n        y\n```')).toEqual([
      '    return x\n        y',
    ]);
  });

  it('keeps blank lines at the end of a fence', async () => {
    expect(await copiedCode('```txt\nline\n\n\n```')).toEqual(['line\n\n']);
  });

  it('renders a four-backtick fence holding a three-backtick fence as one card', async () => {
    const source = '````markdown\n```js\nconsole.log(1)\n```\n````\n\nAfter the block.';
    expect(await copiedCode(source)).toEqual(['```js\nconsole.log(1)\n```']);
    expect(renderMarkdown(source).getByText('After the block.')).toBeTruthy();
  });

  it('keeps a streaming four-backtick block as one card while it is open', async () => {
    const parts = [
      '````markdown\n```js',
      '````markdown\n```js\nconsole.log(1)\n```',
      '````markdown\n```js\nconsole.log(1)\n```\nmore',
    ];
    for (const part of parts) {
      const screen = renderMarkdown(part, { highlightCode: false });
      expect(screen.getAllByText('markdown')).toHaveLength(1);
      expect(screen.queryByText('js')).toBeNull();
    }
  });

  it('renders a tilde fence as a code card, not as Markdown', async () => {
    const source = '~~~python\nprint(1)\n# not a heading\n~~~';
    const screen = renderMarkdown(source);
    expect(screen.getByText('python')).toBeTruthy();
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.getByLabelText('Download code.py')).toBeTruthy();
    expect(await copiedCode(source)).toEqual(['print(1)\n# not a heading']);
  });

  it('leaves three backticks inside a sentence as prose', async () => {
    const source = 'Type ``` to start a fence.\n\n```js\nlet a = 1\n```';
    const screen = renderMarkdown(source);
    expect(screen.queryByText('to')).toBeNull();
    expect(screen.getAllByText('js')).toHaveLength(1);
    expect(await copiedCode(source)).toEqual(['let a = 1']);
  });

  it('renders a fence inside a numbered step under the step, dedented', async () => {
    const source = '1. Step\n   ```bash\n   npm install\n   npm test\n   ```';
    const screen = renderMarkdown(source);
    const item = screen.getByTestId('markdown-list-item-blocks');
    expect(within(item).getByText('Step')).toBeTruthy();
    expect(within(item).getByText('bash')).toBeTruthy();
    expect(await copiedCode(source)).toEqual(['npm install\nnpm test']);
  });

  it('does not treat list markers inside a fenced list step as new items', async () => {
    const source = '- Install\n  ```yaml\n  - name: a\n  - name: b\n  ```\n- Run';
    const screen = renderMarkdown(source);
    expect(screen.getByText('Run')).toBeTruthy();
    expect(await copiedCode(source)).toEqual(['- name: a\n- name: b']);
  });

  it('renders a quoted fence inside the quote bar with no quote markers', async () => {
    const source = '> Note:\n> ```js\n> const a = 1;\n> ```';
    const screen = renderMarkdown(source);
    expect(within(screen.getByTestId('markdown-blockquote')).getByText('js')).toBeTruthy();
    expect(await copiedCode(source)).toEqual(['const a = 1;']);
  });

  it('reads Windows line endings as plain line breaks', async () => {
    expect(await copiedCode('```js\r\nconst a = 1;\r\nconst b = 2;\r\n```')).toEqual([
      'const a = 1;\nconst b = 2;',
    ]);
  });

  it('renders four-space indented lines as a code card', async () => {
    const source = 'Run this:\n\n    const a = 1;\n      nested();\n\nThen stop.';
    expect(await copiedCode(source)).toEqual(['const a = 1;\n  nested();']);
  });

  it('keeps an indented line that continues a paragraph as prose', async () => {
    expect(await copiedCode('A sentence that\n    keeps going.')).toEqual([]);
  });
});

describe('display math blocks', () => {
  it('keeps a fence holding $$ intact next to prose display math', async () => {
    const source = '$$x$$\n\n```bash\necho $$\n```';
    expect(await copiedCode(source)).toEqual(['echo $$']);
    expect(mockMathCalls).toContainEqual({ latex: 'x', display: true });
  });

  it('starts display math only where a line starts', () => {
    const screen = renderMarkdown('so $$x$$ is small');
    expect(mockMathCalls.filter((call) => call.display)).toEqual([]);
    expect(screen.getByText(/is small/)).toBeTruthy();
  });

  it('keeps code spans that mention $$ as code', () => {
    const screen = renderMarkdown('Use `$$` for display and `$$` to close.');
    expect(mockMathCalls).toEqual([]);
    expect(screen.getByText(/for display and/)).toBeTruthy();
  });

  it('renders a math fence as display math', () => {
    renderMarkdown('```math\nE = mc^2\n```');
    expect(mockMathCalls).toEqual([{ latex: 'E = mc^2', display: true }]);
  });

  it('renders a quoted equation inside the quote with no quote markers', () => {
    renderMarkdown('> $$\n> x^2\n> $$');
    expect(mockMathCalls).toEqual([{ latex: 'x^2', display: true }]);
  });

  it('renders an indented equation under its list item and keeps the list going', () => {
    const screen = renderMarkdown('1. Area\n\n   $$\n   \\pi r^2\n   $$\n\n2. Next');
    expect(mockMathCalls).toEqual([{ latex: '\\pi r^2', display: true }]);
    expect(screen.getByTestId('markdown-list-item-blocks')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
  });

  it('shows no LaTeX source while an equation is still streaming', () => {
    const screen = renderMarkdown('Here:\n$$\n\\frac{a}{b}', { highlightCode: false });
    expect(screen.queryByText(/frac/)).toBeNull();
    expect(screen.getByTestId('markdown-math-pending')).toBeTruthy();
    expect(mockMathCalls).toEqual([]);
  });

  it('renders the equation once the stream has finished', () => {
    renderMarkdown('Here:\n$$\n\\frac{a}{b}\n$$');
    expect(mockMathCalls).toEqual([{ latex: '\\frac{a}{b}', display: true }]);
  });
});
