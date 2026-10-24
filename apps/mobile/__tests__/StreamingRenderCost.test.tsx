import { render } from '@testing-library/react-native';

jest.mock('../src/features/chat/components/MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../src/features/chat/components/CodeBlockCopyButton', () => ({
  CodeBlockCopyButton: () => null,
}));

jest.mock('../src/features/chat/utils/syntaxHighlight', () => {
  const actual = jest.requireActual('../src/features/chat/utils/syntaxHighlight');
  return { ...actual, tokenizeCode: jest.fn(actual.tokenizeCode) };
});

import { renderMarkdownContent } from '../src/features/chat/components/MessageContentRenderer';
import { tokenizeCode } from '../src/features/chat/utils/syntaxHighlight';

const mockTokenizeCode = tokenizeCode as jest.Mock;

const FENCE = ['Here is the code:', '', '```ts', 'const answer = 42;', '```'].join('\n');

function renderMarkdown(content: string, highlightCode?: boolean) {
  return render(
    <>
      {renderMarkdownContent(
        content,
        undefined,
        highlightCode === undefined ? {} : { highlightCode },
      )}
    </>,
  );
}

beforeEach(() => {
  mockTokenizeCode.mockClear();
});

describe('what a streamed token costs to render', () => {
  it('re-tokenises a growing fence once per delta when highlighting is on', () => {
    const partial = '```ts\nconst answer =';
    for (const step of [partial, `${partial} 4`, `${partial} 42;\n\`\`\``]) {
      renderMarkdown(step);
    }
    expect(mockTokenizeCode.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('does no tokenising at all while the message is still streaming', () => {
    renderMarkdown(FENCE, false);
    expect(mockTokenizeCode).not.toHaveBeenCalled();
  });

  it('still shows the code while it streams, unhighlighted', () => {
    const { getByText } = renderMarkdown(FENCE, false);
    expect(getByText('const answer = 42;')).toBeTruthy();
    expect(getByText('ts')).toBeTruthy();
  });

  it('highlights once the turn settles', () => {
    renderMarkdown(FENCE, true);
    expect(mockTokenizeCode).toHaveBeenCalledTimes(1);
    expect(mockTokenizeCode).toHaveBeenCalledWith('const answer = 42;', 'ts');
  });
});
