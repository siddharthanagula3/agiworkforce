import { render } from '@testing-library/react-native';

import { renderMarkdownContent } from '../MessageContentRenderer';

const mockMathCalls: { latex: string; display: boolean }[] = [];
const mockCodeCalls: string[] = [];

jest.mock('../MathBlock', () => ({
  MathBlock: ({ latex, display }: { latex: string; display: boolean }) => {
    mockMathCalls.push({ latex, display });
    return null;
  },
}));

jest.mock('../CodeBlockCopyButton', () => ({
  CodeBlockCopyButton: ({ code }: { code: string }) => {
    mockCodeCalls.push(code);
    return null;
  },
}));

function renderMarkdown(content: string) {
  return render(<>{renderMarkdownContent(content)}</>);
}

beforeEach(() => {
  mockMathCalls.length = 0;
  mockCodeCalls.length = 0;
});

describe('mobile markdown parity with the web renderer', () => {
  it('renders a still-streaming unterminated code fence as a code block', () => {
    const { queryByText } = renderMarkdown('```js\nconst answer = 1;');

    expect(queryByText('```js')).toBeNull();
    expect(mockCodeCalls).toEqual(['const answer = 1;']);
  });

  it('keeps the fence info string out of the code body', () => {
    const { getByText } = renderMarkdown('```ts title=example.ts\nconst answer = 1;\n```');

    expect(mockCodeCalls).toEqual(['const answer = 1;']);
    expect(getByText('ts')).toBeTruthy();
  });

  it('renders LaTeX written with escaped-paren delimiters as inline math', () => {
    const { queryByText } = renderMarkdown('Euler wrote \\(e^{i\\pi}+1=0\\) once.');

    expect(mockMathCalls).toEqual([{ latex: 'e^{i\\pi}+1=0', display: false }]);
    expect(queryByText('\\(e^{i\\pi}+1=0\\)')).toBeNull();
  });

  it('renders LaTeX written with escaped-bracket delimiters as display math', () => {
    renderMarkdown('Result:\n\\[a^2 + b^2 = c^2\\]');

    expect(mockMathCalls).toEqual([{ latex: 'a^2 + b^2 = c^2', display: true }]);
  });

  it('leaves escaped-paren delimiters inside a code fence untouched', () => {
    renderMarkdown('```tex\n\\(x\\)\n```');

    expect(mockCodeCalls).toEqual(['\\(x\\)']);
    expect(mockMathCalls).toEqual([]);
  });
});
