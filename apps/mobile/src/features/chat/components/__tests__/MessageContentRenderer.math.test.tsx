import { render } from '@testing-library/react-native';

jest.mock('../MathBlock', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: MockText } = require('react-native') as typeof import('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  return {
    MathBlock: ({ latex, display }: { latex: string; display: boolean }) =>
      createElement(MockText, null, `math:${display ? 'display' : 'inline'}:${latex}`),
  };
});
jest.mock('../CodeBlockCopyButton', () => ({ CodeBlockCopyButton: () => null }));

import { renderMarkdownContent } from '../MessageContentRenderer';

function renderMarkdown(content: string) {
  return render(<>{renderMarkdownContent(content)}</>);
}

describe('inline math inside emphasised Markdown', () => {
  it.each([
    ['bold', '**$x^2$**'],
    ['italic', '*$x^2$*'],
    ['struck through', '~~$x^2$~~'],
  ])('renders an equation wrapped in %s text as math', (_label, source) => {
    const { getByText, queryByText } = renderMarkdown(source);

    expect(getByText('math:inline:x^2')).toBeTruthy();
    expect(queryByText('$x^2$')).toBeNull();
  });

  it('keeps the words around an equation inside the emphasis', () => {
    const { getByText } = renderMarkdown('**the area is $\\pi r^2$ here**');

    expect(getByText('math:inline:\\pi r^2')).toBeTruthy();
    expect(getByText(/the area is/)).toBeTruthy();
    expect(getByText(/here/)).toBeTruthy();
  });

  it('leaves a dollar amount in emphasised text alone', () => {
    const { getByText, queryByText } = renderMarkdown('**costs $5**');

    expect(getByText('costs $5')).toBeTruthy();
    expect(queryByText(/math:/)).toBeNull();
  });

  it('does not turn dollars inside a code span into math', () => {
    const { getByText, queryByText } = renderMarkdown('**run `echo $x^2$`**');

    expect(getByText(/echo \$x\^2\$/)).toBeTruthy();
    expect(queryByText(/math:/)).toBeNull();
  });

  it('keeps asterisks inside an equation instead of reading them as italics', () => {
    const { getByText, queryByText } = renderMarkdown('so $a*b*c$ holds');

    expect(getByText('math:inline:a*b*c')).toBeTruthy();
    expect(queryByText('b')).toBeNull();
  });

  it('renders an equation with a lone asterisk next to real emphasis in the same paragraph', () => {
    const { getByText } = renderMarkdown('Let $x_1 * y$ be *important* and **final**.');

    expect(getByText('math:inline:x_1 * y')).toBeTruthy();
    expect(getByText('important').props.style).toEqual(
      expect.objectContaining({ fontStyle: 'italic' }),
    );
    expect(getByText('final').props.style).toEqual(expect.objectContaining({ fontWeight: '700' }));
  });

  it('does not pair two dollar amounts around emphasis into an equation', () => {
    const { getByText, queryByText } = renderMarkdown('It costs $5, is *great*, and then $6 more.');

    expect(queryByText(/math:/)).toBeNull();
    expect(getByText('great')).toBeTruthy();
  });

  it('does not read an equation inside a code span as math', () => {
    const { getByText, queryByText } = renderMarkdown('run `$a*b*c$` now');

    expect(getByText(/\$a\*b\*c\$/)).toBeTruthy();
    expect(queryByText(/math:/)).toBeNull();
  });

  it('still renders an equation in ordinary text as math', () => {
    const { getByText } = renderMarkdown('plain $x^2$ text');

    expect(getByText('math:inline:x^2')).toBeTruthy();
  });
});
