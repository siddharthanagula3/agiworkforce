import { render } from '@testing-library/react-native';

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../CodeBlockCopyButton', () => ({ CodeBlockCopyButton: () => null }));

const mockInlineCalls: unknown[][] = [];
jest.mock('../MarkdownInline', () => {
  const actual = jest.requireActual('../MarkdownInline');
  return {
    ...actual,
    renderInlineMarkdown: (...args: unknown[]) => {
      mockInlineCalls.push(args);
      return actual.renderInlineMarkdown(...args);
    },
  };
});

import { renderMarkdownContent } from '../MessageContentRenderer';

const citations = [{ url: 'https://news.example/story', title: 'News' }];
const answer = [
  'Prices rose [1] as [the report](https://news.example/story) said.',
  '',
  '- A list item [1]',
  '',
  '| Item | Note |',
  '| --- | --- |',
  '| Rent | Up [1] |',
].join('\n');

describe('numbered citation linking', () => {
  it('gives the citations to every paragraph, list item and table cell', () => {
    mockInlineCalls.length = 0;
    render(<>{renderMarkdownContent(answer, undefined, { citations })}</>);
    expect(mockInlineCalls.length).toBeGreaterThanOrEqual(3);
    expect(mockInlineCalls.every((args) => args[3] === citations)).toBe(true);
  });
});
