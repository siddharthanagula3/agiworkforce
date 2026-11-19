import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 393, height: 852, scale: 3, fontScale: mockFontScale }),
}));

jest.mock('../MathBlock', () => ({
  MathBlock: () => null,
}));

import { prepareMarkdownSource } from '../markdownBlockSyntax';
import { chatTypography } from '@/src/ui/theme/tokens';
import {
  markdownTableLayout,
  markdownTableNaturalWidth,
  markdownTableWordWidth,
  renderMarkdownContent,
  scaleColumnWidth,
  scaleWordWidth,
} from '../MessageContentRenderer';

const PHONE = { containerWidth: 361, paneWidth: 393 };

function renderMarkdown(markdown: string, options?: Parameters<typeof renderMarkdownContent>[2]) {
  return render(<View>{renderMarkdownContent(markdown, undefined, options)}</View>);
}

beforeEach(() => {
  mockFontScale = 1;
});

describe('tables with ragged rows', () => {
  it('draws the table, drops the extra cells and pads the short rows', () => {
    renderMarkdown(
      ['| Name | Role |', '| --- | --- |', '| Ada | Lead | extra |', '| Grace |'].join('\n'),
    );

    expect(screen.getByTestId('markdown-table')).toBeTruthy();
    expect(screen.queryByLabelText('markdown code block')).toBeNull();
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('Lead')).toBeTruthy();
    expect(screen.getByText('Grace')).toBeTruthy();
    expect(screen.queryByText('extra')).toBeNull();
  });

  it('keeps a pipe line right after the table as one more row', () => {
    renderMarkdown(['| A | B |', '| --- | --- |', '| 1 | 2 |', 'note | here'].join('\n'));

    expect(screen.getByText('note')).toBeTruthy();
    expect(screen.getByText('here')).toBeTruthy();
  });
});

describe('a header with a link', () => {
  const table = [
    '| [Docs](https://example.com/docs) | Plan |',
    '| --- | --- |',
    '| a | 1 |',
    '| b | 2 |',
  ].join('\n');

  it('is not a sort button, while its link stays a link', () => {
    renderMarkdown(table);

    expect(screen.queryByLabelText('Docs')).toBeNull();
    expect(screen.getByRole('link', { name: 'Docs' })).toBeTruthy();
  });

  it('leaves the other headers sortable', () => {
    renderMarkdown(table);

    fireEvent.press(screen.getByLabelText('Plan'));
    expect(screen.getByLabelText('Plan, sorted ascending')).toBeTruthy();
  });
});

describe('column widths of cells with math', () => {
  it('sizes a cell by the text its math draws, not by its source', () => {
    const fraction = '$\\frac{a+b+c+d}{e}$';

    expect(markdownTableNaturalWidth([fraction])).toBe('a+b+c+d'.length * 8 + 12);
    expect(markdownTableWordWidth([`rate ${fraction}`])).toBe('a+b+c+d'.length * 8 + 12);
    expect(markdownTableNaturalWidth(['\\(x^2\\)'])).toBe(48);
  });

  it('keeps a long fraction in a column as narrow as the text it draws', () => {
    const fraction = '$\\frac{a+b+c+d}{e}$';
    const naturalWidths = [
      markdownTableNaturalWidth([fraction]),
      markdownTableNaturalWidth(['Rate']),
    ];
    const layout = markdownTableLayout({
      naturalWidths,
      wordWidths: [markdownTableWordWidth([fraction]), markdownTableWordWidth(['Rate'])],
      ...PHONE,
    });

    expect(layout.mode).toBe('fit');
    expect(layout.widths[0]).toBe('a+b+c+d'.length * 8 + 12);
    expect(layout.widths[0]).toBeLessThan(fraction.length * 8 + 12);
  });

  it('reads a cell written with parentheses delimiters as math before the table is measured', () => {
    const prepared = prepareMarkdownSource('| A |\n| --- |\n| \\(x^2\\) |', false);

    expect(prepared).toContain('$x^2$');
    expect(prepared).not.toContain('\\(');
  });
});

describe('tables at the largest text size', () => {
  const sixteen = 'a'.repeat(16);
  const wordWidth = markdownTableWordWidth([sixteen]);

  it('scrolls, with the whole word in its column, when the words cannot sit side by side', () => {
    const layout = markdownTableLayout({
      naturalWidths: [markdownTableNaturalWidth([sixteen]), 60, 60],
      wordWidths: [wordWidth, 60, 60],
      fontScale: 2.35,
      ...PHONE,
    });

    expect(layout.mode).toBe('scroll');
    expect(layout.widths[0]).toBeGreaterThanOrEqual(wordWidth * 2.35);
  });

  it('fits the same table at the default size', () => {
    const layout = markdownTableLayout({
      naturalWidths: [markdownTableNaturalWidth([sixteen]), 60, 60],
      wordWidths: [wordWidth, 60, 60],
      ...PHONE,
    });

    expect(layout.mode).toBe('fit');
  });

  it('lets a whole cell grow with the text size and a word grow up to the room on the pane', () => {
    expect(scaleColumnWidth(260, 2)).toBe(520);
    expect(scaleColumnWidth(260, 0.8)).toBe(260);
    expect(scaleWordWidth(100, 2, 393)).toBe(200);
    expect(scaleWordWidth(200, 2.35, 393)).toBe(393 - 48);
    expect(scaleWordWidth(100, 1, 393)).toBe(100);
  });

  it('scrolls a single column rather than splitting a whole word', () => {
    const word = 'Configuration';
    const layout = markdownTableLayout({
      naturalWidths: [markdownTableNaturalWidth([word])],
      wordWidths: [markdownTableWordWidth([word])],
      fontScale: 3.12,
      ...PHONE,
    });

    expect(layout.mode).toBe('scroll');
    expect(layout.widths[0]).toBeGreaterThanOrEqual(markdownTableWordWidth([word]) * 3.12);
  });

  it('keeps a single column fitted when its word has room', () => {
    const word = 'Configuration';
    const layout = markdownTableLayout({
      naturalWidths: [markdownTableNaturalWidth([word])],
      wordWidths: [markdownTableWordWidth([word])],
      fontScale: 1.5,
      ...PHONE,
    });

    expect(layout.mode).toBe('fit');
  });

  it('draws the table in a sideways scroller', () => {
    mockFontScale = 2.35;
    renderMarkdown(
      [
        '| Topic | Ability | Notes |',
        '| --- | --- | --- |',
        '| Internationalism | Configuration | Documentation |',
      ].join('\n'),
    );

    expect(screen.getByTestId('markdown-table').props.horizontal).toBe(true);
  });
});

describe('list markers at the largest text size', () => {
  const taskList = ['- [ ] Pack', '- [x] Book'].join('\n');

  it('scales the checkbox frame and keeps the tap area at least 44 points', () => {
    mockFontScale = 1;
    const onTaskToggle = jest.fn();
    const { unmount } = renderMarkdown(taskList, { onTaskToggle });
    const small = screen.getAllByRole('checkbox')[0]!;
    expect(small.props.style).toMatchObject({ height: chatTypography.body.lineHeight });
    expect(small.props.hitSlop.left).toBe(14);
    expect(small.props.hitSlop.top).toBe(Math.ceil((44 - chatTypography.body.lineHeight) / 2));
    unmount();

    mockFontScale = 3;
    renderMarkdown(taskList, { onTaskToggle });
    const large = screen.getAllByRole('checkbox')[0]!;
    expect(large.props.style).toMatchObject({ height: chatTypography.body.lineHeight * 3 });
    expect(large.props.hitSlop).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it('still toggles a task when it is tapped', () => {
    mockFontScale = 3;
    const onTaskToggle = jest.fn();
    renderMarkdown(taskList, { onTaskToggle });

    fireEvent.press(screen.getAllByRole('checkbox')[0]!);
    expect(onTaskToggle).toHaveBeenCalledWith(0);
  });

  it('widens the number column with the text size', () => {
    mockFontScale = 3;
    renderMarkdown('1. First\n2. Second');

    expect(screen.getByText('1.').props.style).toMatchObject({ minWidth: 18 * 3 });
  });

  it('widens the bullet column with the text size', () => {
    mockFontScale = 3;
    renderMarkdown('- First\n- Second');

    expect(screen.getAllByText('•')[0]!.props.style).toMatchObject({ width: 12 * 3 });
  });
});
