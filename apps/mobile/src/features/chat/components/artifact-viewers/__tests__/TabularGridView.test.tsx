/* eslint-disable @typescript-eslint/no-require-imports */
const mockCopyToClipboard = jest.fn().mockResolvedValue(true);
const mockExportSourceFile = jest.fn();
const mockShareFile = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopyToClipboard(text),
}));
jest.mock('@/services/fileCreation', () => ({
  exportSourceFile: (...args: unknown[]) => mockExportSourceFile(...args),
  shareFile: (uri: string) => mockShareFile(uri),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SPREADSHEET_ROW_CAP } from '@agiworkforce/unified-chat/tabular';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { TabularGridView } from '../TabularGridView';

const CSV = 'Region,Revenue\nNorth,1200\nSouth,=HYPERLINK("x")\n';

function textStyle(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as never) as { textAlign?: string };
}

describe('TabularGridView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExportSourceFile.mockResolvedValue({ uri: 'file:///exports/Sales.csv' });
  });

  it('draws the header, numbered rows, numbers to the right and the counts', () => {
    render(<TabularGridView title="Sales" content={'Region,Revenue\nNorth,1200\nSouth,900'} />);

    expect(screen.getByText('Region')).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(textStyle(screen.getByText('1200')).textAlign).toBe('right');
    expect(textStyle(screen.getByText('North')).textAlign).toBe('left');
    expect(screen.getByTestId('tabular-grid-summary')).toHaveTextContent('2 rows · 2 columns');
  });

  it('shows the header and No rows for a header-only table', () => {
    render(<TabularGridView title="Empty" content={'Region,Revenue'} />);

    expect(screen.getByText('Region')).toBeTruthy();
    expect(screen.getByText('No rows')).toBeTruthy();
    expect(screen.getByTestId('tabular-grid-summary')).toHaveTextContent('0 rows · 2 columns');
  });

  it('says there is nothing to show when the text is not a table', () => {
    render(<TabularGridView title="Blank" content="" />);

    expect(screen.getByTestId('tabular-grid-empty')).toBeTruthy();
  });

  it('selects a tapped cell and copies exactly its value', async () => {
    render(<TabularGridView title="Sales" content={CSV} />);

    expect(screen.queryByTestId('tabular-copy-cell')).toBeNull();
    fireEvent.press(screen.getByTestId('tabular-cell-0-1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('tabular-copy-cell'));
    });

    expect(mockCopyToClipboard).toHaveBeenCalledWith('1200');
    expect(screen.getByText('Copied')).toBeTruthy();
  });

  it('copies a cell on a long press', async () => {
    render(<TabularGridView title="Sales" content={CSV} />);

    await act(async () => {
      fireEvent(screen.getByTestId('tabular-cell-1-0'), 'longPress');
    });

    expect(mockCopyToClipboard).toHaveBeenCalledWith('South');
  });

  it('copies the table as a Markdown pipe table', async () => {
    render(<TabularGridView title="Sales" content={'Region,Revenue\nNorth,1200'} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('tabular-copy-markdown'));
    });

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      '| Region | Revenue |\n| --- | --- |\n| North | 1200 |',
    );
  });

  it('shares a CSV file named after the table with formula cells neutralised', async () => {
    render(<TabularGridView title="Sales" content={CSV} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('tabular-share-csv'));
    });

    expect(mockExportSourceFile).toHaveBeenCalledTimes(1);
    const [body, title, extension] = mockExportSourceFile.mock.calls[0] as [string, string, string];
    expect(title).toBe('Sales');
    expect(extension).toBe('csv');
    expect(body.split('\n')[0]).toBe('Region,Revenue');
    expect(body).toContain('North,1200');
    expect(body).not.toMatch(/(^|\n|,)=HYPERLINK/);
    expect(mockShareFile).toHaveBeenCalledWith('file:///exports/Sales.csv');
  });

  it('sorts by a tapped header, numbers by value, then descending, then back to the original order', async () => {
    render(
      <TabularGridView
        title="Sales"
        content={'Region,Revenue\nNorth,1200\nSouth,900\nEast,\nWest,15000'}
      />,
    );
    const column = (index: number) =>
      [0, 1, 2, 3].map(
        (row) => screen.getByTestId(`tabular-cell-${row}-${index}`).props.accessibilityLabel,
      );

    fireEvent.press(screen.getByTestId('tabular-cell-0-1'));
    expect(screen.getByTestId('tabular-copy-cell')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tabular-header-1'));
    expect(column(1)).toEqual([
      'Revenue: 900',
      'Revenue: 1200',
      'Revenue: 15000',
      'Revenue: empty',
    ]);
    expect(screen.getByLabelText('Revenue, sorted ascending')).toBeTruthy();
    expect(screen.getByTestId('tabular-sort-asc')).toBeTruthy();
    expect(screen.queryByTestId('tabular-copy-cell')).toBeNull();

    fireEvent.press(screen.getByTestId('tabular-header-1'));
    expect(column(1)).toEqual([
      'Revenue: 15000',
      'Revenue: 1200',
      'Revenue: 900',
      'Revenue: empty',
    ]);
    expect(screen.getByLabelText('Revenue, sorted descending')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tabular-cell-0-0'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('tabular-copy-cell'));
    });
    expect(mockCopyToClipboard).toHaveBeenCalledWith('West');

    fireEvent.press(screen.getByTestId('tabular-header-1'));
    expect(column(0)).toEqual(['Region: North', 'Region: South', 'Region: East', 'Region: West']);
    expect(screen.queryByTestId('tabular-sort-asc')).toBeNull();
    expect(screen.queryByTestId('tabular-sort-desc')).toBeNull();

    fireEvent.press(screen.getByTestId('tabular-header-0'));
    expect(column(0)).toEqual(['Region: East', 'Region: North', 'Region: South', 'Region: West']);
  });

  it('renders no text outside a Text element, which a device refuses to draw', () => {
    render(<TabularGridView title="Sales" content={'Region,Revenue\nNorth,1200'} />);

    const looseText: string[] = [];
    const visit = (node: unknown, parentType: string | null) => {
      if (typeof node === 'string') {
        if (parentType !== 'Text') looseText.push(node);
        return;
      }
      if (Array.isArray(node)) return node.forEach((child) => visit(child, parentType));
      if (node && typeof node === 'object' && 'type' in node) {
        const element = node as { type: string; children: unknown[] | null };
        (element.children ?? []).forEach((child) => visit(child, element.type));
      }
    };
    visit(screen.toJSON(), null);
    expect(looseText).toEqual([]);
  });

  it('draws the first rows up to the shared cap after sorting, says so, and shares every row', async () => {
    const total = SPREADSHEET_ROW_CAP + 20;
    const lines = Array.from({ length: total }, (_, index) => `r${index},${index}`);
    render(<TabularGridView title="Big" content={['Name,Value', ...lines].join('\n')} />);

    const rowsOf = () => screen.getByTestId('tabular-grid-rows').props.data as string[][];
    expect(rowsOf()).toHaveLength(SPREADSHEET_ROW_CAP);
    expect(screen.getByTestId('tabular-grid-summary')).toHaveTextContent(
      `${total.toLocaleString()} rows · 2 columns`,
    );
    expect(screen.getByTestId('tabular-grid-truncated')).toHaveTextContent(
      `Showing first ${SPREADSHEET_ROW_CAP} of ${total.toLocaleString()} rows. Share as CSV for the full data.`,
    );

    fireEvent.press(screen.getByTestId('tabular-header-1'));
    fireEvent.press(screen.getByTestId('tabular-header-1'));
    expect(rowsOf()[0]).toEqual([`r${total - 1}`, String(total - 1)]);
    expect(rowsOf()).toHaveLength(SPREADSHEET_ROW_CAP);

    await act(async () => {
      fireEvent.press(screen.getByTestId('tabular-share-csv'));
    });
    const [body, name, extension] = mockExportSourceFile.mock.calls[0];
    expect(name).toBe('Big');
    expect(extension).toBe('csv');
    expect((body as string).trimEnd().split('\n')).toHaveLength(total + 1);
  });

  it('shows no cap note for a table under the cap', () => {
    render(<TabularGridView title="Sales" content={CSV} />);

    expect(screen.queryByTestId('tabular-grid-truncated')).toBeNull();
  });

  describe('workbook sheets', () => {
    const SHEETS = [
      { name: 'Revenue', content: 'Region,Revenue\nNorth,1200\nSouth,900' },
      { name: 'Costs', content: 'Item;type;kind,Cost\n"Rent, office",400\nPower;gas,90' },
      { name: 'Notes', content: '' },
    ];

    it('draws one 44 point tab per sheet with the first selected and underlined', () => {
      render(<TabularGridView title="q3.xlsx" content={SHEETS[0]!.content} sheets={SHEETS} />);

      expect(screen.getByTestId('tabular-sheet-tabs').props.accessibilityRole).toBe('tablist');
      const tabs = SHEETS.map((_, index) => screen.getByTestId(`tabular-sheet-tab-${index}`));
      expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
        'Revenue',
        'Costs',
        'Notes',
      ]);
      expect(tabs.map((tab) => tab.props.accessibilityRole)).toEqual(['tab', 'tab', 'tab']);
      expect(tabs.map((tab) => tab.props.accessibilityState.selected)).toEqual([
        true,
        false,
        false,
      ]);
      const first = StyleSheet.flatten(tabs[0]!.props.style) as {
        minHeight: number;
        minWidth: number;
        borderBottomWidth: number;
        borderBottomColor: string;
      };
      const second = StyleSheet.flatten(tabs[1]!.props.style) as { borderBottomColor: string };
      expect(first.minHeight).toBe(FULL_SCREEN_TOUCH_TARGET);
      expect(first.minWidth).toBe(FULL_SCREEN_TOUCH_TARGET);
      expect(first.borderBottomWidth).toBeGreaterThan(0);
      expect(first.borderBottomColor).not.toBe(second.borderBottomColor);
      expect(screen.getByText('North')).toBeTruthy();
    });

    it('switches the grid to a tapped sheet, reading its cells as CSV, and clears sort and selection', () => {
      render(<TabularGridView title="q3.xlsx" content={SHEETS[0]!.content} sheets={SHEETS} />);

      fireEvent.press(screen.getByTestId('tabular-header-1'));
      fireEvent.press(screen.getByTestId('tabular-cell-0-0'));
      expect(screen.getByTestId('tabular-sort-asc')).toBeTruthy();
      expect(screen.getByTestId('tabular-copy-cell')).toBeTruthy();

      fireEvent.press(screen.getByTestId('tabular-sheet-tab-1'));

      expect(screen.getByTestId('tabular-sheet-tab-1').props.accessibilityState.selected).toBe(
        true,
      );
      expect(screen.queryByText('North')).toBeNull();
      expect(screen.getByText('Item;type;kind')).toBeTruthy();
      expect(screen.getByText('Rent, office')).toBeTruthy();
      expect(screen.getByText('Power;gas')).toBeTruthy();
      expect(screen.getByTestId('tabular-grid-summary')).toHaveTextContent('2 rows · 2 columns');
      expect(screen.queryByTestId('tabular-sort-asc')).toBeNull();
      expect(screen.queryByTestId('tabular-copy-cell')).toBeNull();
    });

    it('keeps the tabs on an empty sheet so another one can be picked', () => {
      render(<TabularGridView title="q3.xlsx" content={SHEETS[0]!.content} sheets={SHEETS} />);

      fireEvent.press(screen.getByTestId('tabular-sheet-tab-2'));
      expect(screen.getByText('This sheet is empty.')).toBeTruthy();

      fireEvent.press(screen.getByTestId('tabular-sheet-tab-0'));
      expect(screen.getByText('North')).toBeTruthy();
    });

    it('shares the shown sheet under the workbook and sheet names', async () => {
      render(<TabularGridView title="q3" content={SHEETS[0]!.content} sheets={SHEETS} />);

      fireEvent.press(screen.getByTestId('tabular-sheet-tab-1'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('tabular-share-csv'));
      });

      const [body, name] = mockExportSourceFile.mock.calls[0] as [string, string];
      expect(name).toBe('q3 Costs');
      expect(body.split('\n')[0]).toBe('"Item;type;kind",Cost');
    });

    it('draws a single sheet without tabs', () => {
      render(
        <TabularGridView title="one.xlsx" content={SHEETS[1]!.content} sheets={[SHEETS[1]!]} />,
      );

      expect(screen.queryByTestId('tabular-sheet-tabs')).toBeNull();
      expect(screen.getByText('Power;gas')).toBeTruthy();
    });
  });
});
