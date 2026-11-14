import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

let mockViewportWidth = 393;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockViewportWidth, height: 852, scale: 3, fontScale: 1 }),
}));

jest.mock('../src/features/chat/components/MathBlock', () => ({
  MathBlock: () => null,
}));

import {
  markdownTableLayout,
  markdownTableNaturalWidth,
  markdownTableWordWidth,
  renderMarkdownContent,
} from '../src/features/chat/components/MessageContentRenderer';
import { lightColors } from '../src/ui/theme';

const PHONE = { containerWidth: 361, paneWidth: 393 };
const sum = (widths: readonly number[]) => widths.reduce((total, width) => total + width, 0);
const shortWords = (columns: readonly number[]) => columns.map(() => 48);
const layoutOf = (naturalWidths: number[], frame = PHONE) =>
  markdownTableLayout({ naturalWidths, wordWidths: shortWords(naturalWidths), ...frame });

const THREE_COLUMNS = `| Plan | What it includes | Who it is for |
| --- | --- | --- |
| Alpha | Chat, projects and a library of saved work | People trying it for the first time |
| Beta | Shared projects and a workspace for the group | Small teams that work together |`;

const LONG_WORD_COLUMNS = `| Authentication | Authorization | Configuration | Documentation |
| --- | --- | --- | --- |
| Required | Optional | Recommended | Published |`;

const SEVEN_COLUMNS = `| Region | First quarter | Second quarter | Third quarter | Fourth quarter | Whole year | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| North America | 1,200,000 | 1,350,000 | 1,410,000 | 1,600,000 | 5,560,000 | Strong growth |`;

function layoutTo(width: number, markdown: string) {
  const view = render(<View>{renderMarkdownContent(markdown, lightColors)}</View>);
  fireEvent(view.getByTestId('markdown-table-frame'), 'layout', {
    nativeEvent: { layout: { width, height: 200, x: 0, y: 0 } },
  });
  return view;
}

describe('markdownTableLayout', () => {
  it('keeps a table that already fits at its natural widths', () => {
    expect(layoutOf([60, 100, 120])).toEqual({
      mode: 'fit',
      widths: [60, 100, 120],
      overflow: 0,
    });
  });

  it('narrows wide columns to the message width instead of cutting the table off', () => {
    const layout = layoutOf([200, 260, 260]);

    expect(layout.mode).toBe('fit');
    expect(layout.overflow).toBe(0);
    expect(sum(layout.widths)).toBeCloseTo(361);
    layout.widths.forEach((width) => expect(width).toBeGreaterThanOrEqual(72));
    expect(layout.widths[1]).toBeGreaterThan(layout.widths[0] ?? 0);
  });

  it('never widens a short column to narrow a long one', () => {
    const layout = layoutOf([48, 260, 260]);

    expect(layout.mode).toBe('fit');
    expect(layout.widths[0]).toBe(48);
    expect(sum(layout.widths)).toBeCloseTo(361);
  });

  it('scrolls only when the columns cannot all keep a readable width', () => {
    const fits = layoutOf([200, 200, 200, 200, 200]);
    expect(fits.mode).toBe('fit');

    const scrolls = layoutOf([200, 200, 200, 200, 200, 48]);
    expect(scrolls.mode).toBe('scroll');
    scrolls.widths.forEach((width) => expect(width).toBeGreaterThanOrEqual(120));
  });

  it('decides from the pane width until the message has been measured', () => {
    expect(layoutOf([200, 260, 260], { containerWidth: 0, paneWidth: 393 }).mode).toBe('fit');
  });

  it('lets a table on a wide pane take the room beside the reading column', () => {
    expect(
      layoutOf([256, 96, 96, 96, 96, 256], { containerWidth: 720, paneWidth: 1086 }),
    ).toMatchObject({ mode: 'fit', overflow: 176 });
  });

  it('never narrows a column below its longest word', () => {
    const layout = markdownTableLayout({
      naturalWidths: [200, 260, 260],
      wordWidths: [124, 60, 60],
      ...PHONE,
    });

    expect(layout.mode).toBe('fit');
    expect(sum(layout.widths)).toBeCloseTo(361);
    expect(layout.widths[0]).toBeGreaterThanOrEqual(124);
    expect(layout.widths[1]).toBeGreaterThanOrEqual(72);
  });

  it('scrolls rather than split words when the longest words cannot sit side by side', () => {
    const layout = markdownTableLayout({
      naturalWidths: [200, 200, 200],
      wordWidths: [124, 124, 124],
      ...PHONE,
    });

    expect(layout.mode).toBe('scroll');
    layout.widths.forEach((width) => expect(width).toBeGreaterThanOrEqual(124));
  });
});

describe('column widths', () => {
  it('sizes a column for its longest cell, within the limits', () => {
    expect(markdownTableNaturalWidth(['Plan', 'Starter'])).toBe(7 * 8 + 12);
    expect(markdownTableNaturalWidth([''])).toBe(48);
    expect(markdownTableNaturalWidth(['a'.repeat(100)])).toBe(260);
  });

  it('asks for room to keep the longest word on one line', () => {
    expect(markdownTableWordWidth(['Plan', 'A yearly Subscription'])).toBe(12 * 8 + 12);
    expect(markdownTableWordWidth(['a'.repeat(24)])).toBe(24 * 8 + 12);
  });

  it('asks only for a readable width when a token is too long to keep whole', () => {
    expect(markdownTableWordWidth(['a'.repeat(25)])).toBe(144);
    expect(markdownTableWordWidth(['see https://example.com/a/very/long/path/index.html'])).toBe(
      144,
    );
  });

  it('measures the words of a link, not its address', () => {
    expect(
      markdownTableWordWidth(['[Read the guide](https://example.com/a/very/long/path/index.html)']),
    ).toBe('guide]'.length * 8 + 12);
  });
});

describe('a table in a message on a phone', () => {
  beforeEach(() => {
    mockViewportWidth = 393;
  });

  it('shows every column without a sideways scroller', () => {
    const { getByTestId, getByText } = layoutTo(361, THREE_COLUMNS);

    const table = getByTestId('markdown-table');
    expect(table.props.horizontal).toBeUndefined();
    expect(table.props.style.marginHorizontal).toBe(-0);
    expect(getByText('Who it is for')).toBeTruthy();
    expect(getByText('Small teams that work together')).toBeTruthy();
  });

  it('scrolls a table with more columns than the width can hold', () => {
    const { getByTestId } = layoutTo(361, SEVEN_COLUMNS);
    expect(getByTestId('markdown-table').props.horizontal).toBe(true);
  });

  it('scrolls a table whose long words cannot all be kept whole at this width', () => {
    const { getByTestId } = layoutTo(361, LONG_WORD_COLUMNS);
    expect(getByTestId('markdown-table').props.horizontal).toBe(true);
  });

  it('still sorts by a column', () => {
    const view = layoutTo(361, THREE_COLUMNS);
    const firstPlan = () => {
      const tree = JSON.stringify(view.toJSON());
      return tree.indexOf('Alpha') < tree.indexOf('Beta') ? 'Alpha' : 'Beta';
    };

    expect(firstPlan()).toBe('Alpha');
    fireEvent.press(view.getByLabelText('Plan'));
    expect(firstPlan()).toBe('Alpha');
    fireEvent.press(view.getByLabelText('Plan, sorted ascending'));
    expect(view.getByLabelText('Plan, sorted descending')).toBeTruthy();
    expect(firstPlan()).toBe('Beta');
  });
});
