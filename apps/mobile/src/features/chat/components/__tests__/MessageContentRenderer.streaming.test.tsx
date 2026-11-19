import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../CodeBlockCopyButton', () => ({ CodeBlockCopyButton: () => null }));

import { renderMarkdownContent } from '../MessageContentRenderer';
import { inlineCodeStyle } from '../MarkdownInline';
import { colors as defaultColors } from '@/src/ui/theme';

const STREAMING = { highlightCode: false } as const;

function renderStreaming(content: string) {
  return render(<>{renderMarkdownContent(content, undefined, STREAMING)}</>);
}

describe('markup that is still arriving', () => {
  it('renders an open bold span bold, with no asterisks', () => {
    const screen = renderStreaming('The answer is **forty');
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(screen.getByText('forty')).toHaveStyle({ fontWeight: '700' });
  });

  it('drops a bare pair of asterisks at the end of the line', () => {
    const screen = renderStreaming('The answer is **');
    expect(screen.queryByText(/\*/)).toBeNull();
  });

  it('renders inline code in the code face from its first character', () => {
    const screen = renderStreaming('Run `npm ins');
    expect(screen.queryByText(/`/)).toBeNull();
    expect(screen.getByText('npm ins')).toHaveStyle({
      fontFamily: inlineCodeStyle(defaultColors).fontFamily,
    });
  });

  it('shows only the label of a link whose address is still arriving', () => {
    const screen = renderStreaming('See [the docs](https://docs.exa');
    expect(screen.getByText('See the docs')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/https/)).toBeNull();
    expect(screen.queryByText(/\]\(/)).toBeNull();
  });

  it('shows only the label of a link cut off when the answer stopped', () => {
    const stopped = render(<>{renderMarkdownContent('See [the docs](https://docs.exa')}</>);
    expect(stopped.getByText('See the docs')).toBeTruthy();
    expect(stopped.queryByRole('link')).toBeNull();
    expect(stopped.queryByText(/https/)).toBeNull();
    stopped.unmount();

    const finished = render(
      <>{renderMarkdownContent('See [the docs](https://docs.example.com).')}</>,
    );
    expect(finished.getByRole('link', { name: 'the docs' })).toBeTruthy();
  });

  it('closes the bold and the link of an answer the person stopped', () => {
    const stopped = render(
      <>
        {renderMarkdownContent('Stopping mid-**bold and [the docs](https://docs.exa', undefined, {
          stopped: true,
        })}
      </>,
    );
    expect(stopped.queryByText(/\*\*/)).toBeNull();
    expect(stopped.queryByText(/https/)).toBeNull();
    expect(stopped.queryByRole('link')).toBeNull();
    expect(stopped.getByText(/Stopping mid-/)).toBeTruthy();
    expect(stopped.getByText(/bold and the docs/)).toBeTruthy();
  });

  it('keeps the asterisks of a finished answer as written', () => {
    const screen = render(<>{renderMarkdownContent('2 ** 3 is eight')}</>);
    expect(screen.getByText('2 ** 3 is eight')).toBeTruthy();
  });

  it('shows no table and no pipes until the header and separator are complete', () => {
    for (const partial of [
      '| Name | Score |',
      '| Name | Score |\n|---',
      '| Name | Score |\n|---|',
    ]) {
      const screen = renderStreaming(`Results:\n\n${partial}`);
      expect(screen.queryByTestId('markdown-table')).toBeNull();
      expect(screen.queryByText(/\|/)).toBeNull();
    }
  });

  it('grows a streaming table by whole rows', () => {
    const screen = renderStreaming('| Name | Score |\n|---|---|\n| Ada | 3 |\n| Bob | 1');
    expect(screen.getByTestId('markdown-table')).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.queryByText('Bob')).toBeNull();
    expect(screen.queryByText(/\|/)).toBeNull();
  });

  it('keeps the sort order of a table while more rows stream in', () => {
    const header = '| Name | Score |\n|---|---|\n| Ada | 3 |\n| Bob | 1 |\n';
    const screen = render(<>{renderMarkdownContent(`${header}| Cy`, undefined, STREAMING)}</>);
    fireEvent.press(screen.getByLabelText('Score'));
    expect(screen.getByLabelText('Score, sorted ascending')).toBeTruthy();

    screen.rerender(
      <>{renderMarkdownContent(`${header}| Cy | 2 |\n| Dee`, undefined, STREAMING)}</>,
    );
    expect(screen.getByLabelText('Score, sorted ascending')).toBeTruthy();
    expect(
      screen.getAllByText(/^(Ada|Bob|Cy)$/).map((node) => [node.props.children].flat().join('')),
    ).toEqual(['Bob', 'Cy', 'Ada']);
  });
});
