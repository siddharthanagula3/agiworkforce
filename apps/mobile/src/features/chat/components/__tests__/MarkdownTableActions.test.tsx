import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Alert, StyleSheet } from 'react-native';

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../CodeBlockCopyButton', () => ({ CodeBlockCopyButton: () => null }));

const mockExportSourceFile = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  exportSourceFile: (...args: unknown[]) => mockExportSourceFile(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

import { renderMarkdownContent, sortTableRows } from '../MessageContentRenderer';
import { markdownTableToCsv } from '../../utils/tableCsv';
import { protectEscapes } from '../../utils/markdownInlineSyntax';
import { COPY_CONFIRMATION_MS } from '@/src/shared/hooks/useCopyAction';

const TABLE = [
  '| Name | **Score** |',
  '|---|---|',
  '| [Ada](https://example.com) | 3 |',
  '| Bob \\| Jr | **10** |',
  '| Cy | 9 |',
].join('\n');

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderTable(content = TABLE) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      {renderMarkdownContent(content)}
    </SafeAreaProvider>,
  );
}

function cellTexts(nodes: readonly { props: { children?: unknown } }[]): string[] {
  return nodes.map((node) => [node.props.children].flat().join(''));
}

const setString = Clipboard.setStringAsync as jest.Mock;

beforeEach(() => {
  setString.mockReset();
  setString.mockResolvedValue(undefined);
  mockExportSourceFile.mockReset();
  mockShareFile.mockReset();
});

describe('table copy', () => {
  it('puts the header and rows on the clipboard as plain tab-separated text', async () => {
    const screen = renderTable();
    fireEvent.press(screen.getByLabelText('Copy table'));
    await waitFor(() => expect(setString).toHaveBeenCalledTimes(1));
    expect(setString).toHaveBeenCalledWith('Name\tScore\nAda\t3\nBob | Jr\t10\nCy\t9');
  });

  it('copies the rows in the order the reader sorted them', async () => {
    const screen = renderTable();
    fireEvent.press(screen.getByLabelText('Score'));
    fireEvent.press(screen.getByLabelText('Copy table'));
    await waitFor(() => expect(setString).toHaveBeenCalledTimes(1));
    expect(setString).toHaveBeenCalledWith('Name\tScore\nAda\t3\nCy\t9\nBob | Jr\t10');
  });

  it('confirms the copy for two seconds, then resets', async () => {
    jest.useFakeTimers();
    try {
      const screen = renderTable();
      fireEvent.press(screen.getByLabelText('Copy table'));
      await waitFor(() => expect(screen.getByLabelText('Table copied')).toBeTruthy());
      act(() => {
        jest.advanceTimersByTime(COPY_CONFIRMATION_MS);
      });
      expect(screen.getByLabelText('Copy table')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('says so when the clipboard write fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    setString.mockRejectedValueOnce(new Error('denied'));
    const screen = renderTable();
    fireEvent.press(screen.getByLabelText('Copy table'));
    await waitFor(() => expect(screen.getByLabelText('Could not copy')).toBeTruthy());
    expect(alert).toHaveBeenCalled();
    alert.mockRestore();
    warn.mockRestore();
  });
});

describe('expanded table', () => {
  it('opens full screen with Copy, CSV and Close, and closes again', async () => {
    const screen = renderTable();
    fireEvent.press(screen.getByLabelText('Expand table'));
    const sheet = screen.getByTestId('table-full-screen');
    expect(within(sheet).getByLabelText('Copy table')).toBeTruthy();
    expect(within(sheet).getByLabelText('Download table as CSV')).toBeTruthy();
    expect(within(sheet).getByTestId('table-full-screen-rows').props.horizontal).toBe(true);
    expect(within(sheet).getByText('Cy')).toBeTruthy();

    fireEvent.press(within(sheet).getByLabelText('Close table'));
    expect(screen.queryByTestId('table-full-screen')).toBeNull();
  });

  it('downloads the expanded table as a CSV file', async () => {
    mockExportSourceFile.mockResolvedValue({ uri: 'file:///exports/table.csv' });
    mockShareFile.mockResolvedValue(undefined);
    const screen = renderTable();
    fireEvent.press(screen.getByLabelText('Expand table'));
    fireEvent.press(
      within(screen.getByTestId('table-full-screen')).getByLabelText('Download table as CSV'),
    );
    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith('file:///exports/table.csv'));
    expect(mockExportSourceFile).toHaveBeenCalledWith(
      'Name,Score\nAda,3\nBob | Jr,10\nCy,9',
      'table',
      'csv',
    );
  });
});

describe('table CSV', () => {
  it('writes an escaped pipe as a pipe', () => {
    expect(markdownTableToCsv([['A'], [protectEscapes('a \\| b')]])).toBe('A\na | b');
  });

  it('drops inline markup, tags and entities', () => {
    expect(markdownTableToCsv([['A'], ['*note* &amp; <b>x</b>']])).toBe('A\nnote & x');
  });

  it('keeps a negative number numeric', () => {
    expect(markdownTableToCsv([['A'], ['-5']])).toBe('A\n-5');
  });

  it('guards a formula a semicolon-locale spreadsheet would split out of a cell', () => {
    expect(markdownTableToCsv([['A'], ['a;=1+1']])).toBe(`A\n"a;'=1+1"`);
  });

  it('guards a cell that starts a formula', () => {
    expect(markdownTableToCsv([['A'], ['=SUM(A1)']])).toBe("A\n'=SUM(A1)");
  });
});

describe('table sorting', () => {
  const body = [
    ['a', '2'],
    ['b', ''],
    ['c', '**10**'],
    ['d', '9'],
  ];

  it('sorts on the plain cell text, so a bold number sorts as a number', () => {
    expect(sortTableRows(body, { column: 1, direction: 'asc' }).map((r) => r[0])).toEqual([
      'a',
      'd',
      'c',
      'b',
    ]);
  });

  it('reads numbers by the shared spreadsheet rule, exponents and negatives included', () => {
    const numbers = [
      ['a', '9'],
      ['b', '1e3'],
      ['c', '(50)'],
      ['d', '2'],
    ];
    expect(sortTableRows(numbers, { column: 1, direction: 'asc' }).map((r) => r[0])).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
  });

  it('keeps empty cells last in both directions', () => {
    expect(sortTableRows(body, { column: 1, direction: 'desc' }).map((r) => r[0])).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
  });

  it('restores the original order on the third tap', () => {
    const screen = renderTable();
    fireEvent.press(screen.getByLabelText('Score'));
    fireEvent.press(screen.getByLabelText('Score, sorted ascending'));
    fireEvent.press(screen.getByLabelText('Score, sorted descending'));
    expect(screen.getByLabelText('Score')).toBeTruthy();
    expect(cellTexts(screen.getAllByText(/^(Ada|Cy)$/))).toEqual(['Ada', 'Cy']);
  });

  it('gives sortable headers a 44 point tall target', () => {
    const screen = renderTable();
    expect(screen.getByLabelText('Name')).toHaveStyle({ minHeight: 44 });
  });
});

describe('table parsing', () => {
  it('keeps an escaped pipe inside a code span in its cell', () => {
    const screen = renderTable('| A | B |\n|---|---|\n| `a \\| b` | c |');
    expect(screen.getByText('a | b')).toBeTruthy();
    expect(screen.getByText('c')).toBeTruthy();
  });

  it('is not a table when the delimiter row has a different number of cells', () => {
    const screen = renderTable('| A | B |\n|---|\n| 1 | 2 |');
    expect(screen.queryByTestId('markdown-table')).toBeNull();
  });

  it('renders a table indented under a list item inside that item', () => {
    const screen = renderTable('- Results\n\n  | A | B |\n  |---|---|\n  | 1 | 2 |');
    expect(
      within(screen.getByTestId('markdown-list-item-blocks')).getByTestId('markdown-table'),
    ).toBeTruthy();
  });

  it('starts every cell at the top of its row', () => {
    const screen = renderTable('| A | B |\n|---|---|\n| short | a much longer cell |');
    let node = screen.getByText('short').parent;
    let justify: unknown;
    while (node && justify === undefined) {
      justify = StyleSheet.flatten(node.props.style)?.justifyContent;
      node = node.parent;
    }
    expect(justify).toBe('flex-start');
  });
});
