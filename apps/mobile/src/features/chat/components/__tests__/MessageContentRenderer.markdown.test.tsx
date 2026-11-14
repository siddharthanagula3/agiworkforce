import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../CodeBlockCopyButton', () => ({ CodeBlockCopyButton: () => null }));

const mockExportSourceFile = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  exportSourceFile: (...args: unknown[]) => mockExportSourceFile(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

import { renderMarkdownContent } from '../MessageContentRenderer';
import { useCodePreferences } from '@/src/features/settings/code/store';
import { colors as defaultColors } from '@/src/ui/theme';

function renderMarkdown(content: string, options?: Parameters<typeof renderMarkdownContent>[2]) {
  return render(<>{renderMarkdownContent(content, undefined, options)}</>);
}

function rowPaddingLeft(node: ReactTestInstance): number | undefined {
  let current: ReactTestInstance | null = node;
  while (current) {
    const style = current.props?.style as { paddingLeft?: number } | undefined;
    if (style && typeof style.paddingLeft === 'number') return style.paddingLeft;
    current = current.parent;
  }
  return undefined;
}

function ancestorWithProp(node: ReactTestInstance, prop: string): unknown {
  let current: ReactTestInstance | null = node;
  while (current) {
    const value = (current.props as Record<string, unknown> | undefined)?.[prop];
    if (value !== undefined) return value;
    current = current.parent;
  }
  return undefined;
}

function ancestorStyleNumber(node: ReactTestInstance, key: string): number | undefined {
  let current: ReactTestInstance | null = node;
  while (current) {
    const style = current.props?.style as Record<string, unknown> | undefined;
    const value = style?.[key];
    if (typeof value === 'number') return value;
    current = current.parent;
  }
  return undefined;
}

describe('renderMarkdownContent nested lists', () => {
  it('keeps indented bullets as list items instead of plain paragraphs', () => {
    const { getByText, queryByText } = renderMarkdown(
      ['- Top item', '  - Sub item', '    - Deep item', '- Second top'].join('\n'),
    );

    expect(queryByText('  - Sub item')).toBeNull();
    expect(queryByText('    - Deep item')).toBeNull();

    const top = getByText('Top item');
    const sub = getByText('Sub item');
    const deep = getByText('Deep item');
    const secondTop = getByText('Second top');

    const topPadding = rowPaddingLeft(top);
    expect(typeof topPadding).toBe('number');
    expect(rowPaddingLeft(sub)!).toBeGreaterThan(topPadding!);
    expect(rowPaddingLeft(deep)!).toBeGreaterThan(rowPaddingLeft(sub)!);
    expect(rowPaddingLeft(secondTop)).toBe(topPadding);
  });

  it('renders indented ordered sub-items with their numbers', () => {
    const { getByText, queryByText } = renderMarkdown(
      ['1. First', '   1. Nested step', '2. Second'].join('\n'),
    );

    expect(queryByText('   1. Nested step')).toBeNull();

    const nested = getByText('Nested step');
    expect(rowPaddingLeft(nested)!).toBeGreaterThan(rowPaddingLeft(getByText('First'))!);
    expect(getByText('Second')).toBeTruthy();
  });

  it('renders inline markdown inside indented sub-items', () => {
    const { getByText, queryByText } = renderMarkdown(['- Top', '  - **Bold sub**'].join('\n'));

    expect(queryByText('  - **Bold sub**')).toBeNull();
    expect(getByText('Bold sub')).toBeTruthy();
    expect(rowPaddingLeft(getByText('Bold sub'))!).toBeGreaterThan(
      rowPaddingLeft(getByText('Top'))!,
    );
  });

  it('gives each nesting level its own bullet glyph', () => {
    const { getByText } = renderMarkdown(['- Top item', '  - Sub item'].join('\n'));

    const topBullet = getByText('•');
    const subBullet = getByText('◦');

    expect(rowPaddingLeft(subBullet)!).toBeGreaterThan(rowPaddingLeft(topBullet)!);
  });
});

describe('renderMarkdownContent table cells', () => {
  const table = [
    '| Feature | Notes |',
    '| --- | --- |',
    '| **Bold cell** | `code cell` |',
    '| [Docs](https://example.com/docs) | plain |',
  ].join('\n');

  it('renders bold, code and links inside table cells instead of literal syntax', () => {
    const { getByText, queryByText } = renderMarkdown(table);

    expect(queryByText('**Bold cell**')).toBeNull();
    expect(queryByText('`code cell`')).toBeNull();
    expect(queryByText('[Docs](https://example.com/docs)')).toBeNull();

    expect(getByText('Bold cell')).toBeTruthy();
    expect(getByText('code cell')).toBeTruthy();
    expect(getByText('Docs')).toBeTruthy();
  });

  it('keeps plain cells and headers readable', () => {
    const { getByText } = renderMarkdown(table);

    expect(getByText('Feature')).toBeTruthy();
    expect(getByText('plain')).toBeTruthy();
  });

  it('wraps a long cell inside the message instead of pushing the table off the screen', () => {
    const wideTable = [
      '| Feature | Notes | Owner | Status |',
      '| --- | --- | --- | --- |',
      `| ${'a'.repeat(200)} | short | team | done |`,
    ].join('\n');

    const { getByText } = renderMarkdown(wideTable);

    const cell = getByText('a'.repeat(200));
    expect(ancestorWithProp(cell, 'horizontal')).toBeUndefined();
    expect(ancestorStyleNumber(cell, 'width')).toBeUndefined();
    expect(ancestorStyleNumber(cell, 'flexGrow')).toBeGreaterThan(
      ancestorStyleNumber(getByText('short'), 'flexGrow') ?? Infinity,
    );
  });

  it('puts a table with too many columns in a horizontal scroller with bounded column widths', () => {
    const columns = Array.from({ length: 12 }, (_, index) => `Column number ${index + 1}`);
    const manyColumns = [
      `| ${columns.join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      `| ${'a'.repeat(200)} | short | ${columns.slice(2).join(' | ')} |`,
    ].join('\n');

    const { getByText } = renderMarkdown(manyColumns);

    const cell = getByText('a'.repeat(200));
    expect(ancestorWithProp(cell, 'horizontal')).toBe(true);

    const cellWidth = ancestorStyleNumber(cell, 'width');
    expect(cellWidth).toBeGreaterThanOrEqual(120);
    expect(cellWidth).toBeLessThanOrEqual(260);
    expect(ancestorStyleNumber(getByText('short'), 'width')).toBeGreaterThanOrEqual(120);
  });
});

describe('renderMarkdownContent diff fences', () => {
  const diff = [
    '```diff',
    '-return price + quantity;',
    '+return price * quantity;',
    ' context',
    '```',
  ].join('\n');

  afterEach(() => {
    act(() => useCodePreferences.setState({ wrapLongLines: false }));
  });

  it('paints added and removed lines with the readable diff pairs', () => {
    const { getAllByTestId, getByText } = renderMarkdown(diff);

    const added = getAllByTestId('markdown-diff-line-added');
    const removed = getAllByTestId('markdown-diff-line-removed');
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(getAllByTestId('markdown-diff-line-context')).toHaveLength(1);
    expect(added[0]).toHaveStyle({ backgroundColor: defaultColors.diffAddedFill });
    expect(removed[0]).toHaveStyle({ backgroundColor: defaultColors.diffRemovedFill });
    expect(getByText('+return price * quantity;')).toHaveStyle({
      color: defaultColors.diffAddedText,
    });
    expect(getByText('-return price + quantity;')).toHaveStyle({
      color: defaultColors.diffRemovedText,
    });
  });

  it('names each changed line for a screen reader', () => {
    const { getAllByTestId } = renderMarkdown(diff);

    expect(getAllByTestId('markdown-diff-line-added')[0]?.props.accessibilityLabel).toBe(
      'Added line: +return price * quantity;',
    );
    expect(getAllByTestId('markdown-diff-line-removed')[0]?.props.accessibilityLabel).toBe(
      'Removed line: -return price + quantity;',
    );
  });

  it('treats patch and udiff fences as diffs', () => {
    const { getAllByTestId } = renderMarkdown('```patch\n+added\n```\n\n```udiff\n-gone\n```');

    expect(getAllByTestId('markdown-diff-line-added')).toHaveLength(1);
    expect(getAllByTestId('markdown-diff-line-removed')).toHaveLength(1);
  });

  it('scrolls long diff lines sideways until the wrap setting is on', () => {
    const { getByTestId, rerender } = renderMarkdown(diff);
    expect(getByTestId('markdown-diff').props.horizontal).toBe(true);

    act(() => useCodePreferences.setState({ wrapLongLines: true }));
    rerender(<>{renderMarkdownContent(diff)}</>);

    expect(getByTestId('markdown-diff').props.horizontal).toBeUndefined();
  });
});

describe('renderMarkdownContent code download', () => {
  beforeEach(() => {
    mockExportSourceFile.mockReset();
    mockShareFile.mockReset();
  });

  it('saves a finished code block as a source file with its language extension', async () => {
    mockExportSourceFile.mockResolvedValue({ uri: 'file:///exports/code.py' });
    mockShareFile.mockResolvedValue(undefined);
    const { getByLabelText } = renderMarkdown('```python\nprint("hi")\n```');

    fireEvent.press(getByLabelText('Download code'));

    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith('file:///exports/code.py'));
    expect(mockExportSourceFile).toHaveBeenCalledWith('print("hi")', 'code', 'py');
  });

  it('names a diff download with the diff extension', async () => {
    mockExportSourceFile.mockResolvedValue({ uri: 'file:///exports/code.diff' });
    mockShareFile.mockResolvedValue(undefined);
    const { getByLabelText } = renderMarkdown('```diff\n+added\n```');

    fireEvent.press(getByLabelText('Download code'));

    await waitFor(() =>
      expect(mockExportSourceFile).toHaveBeenCalledWith('+added', 'code', 'diff'),
    );
  });

  it('offers no download while the code block is still streaming', () => {
    const { queryByLabelText } = renderMarkdown('```python\nprint("hi")\n```', {
      highlightCode: false,
    });

    expect(queryByLabelText('Download code')).toBeNull();
  });
});
