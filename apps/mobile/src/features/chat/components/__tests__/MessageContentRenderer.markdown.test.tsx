import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
import { colors as darkColors } from '@/src/ui/theme';

function renderMarkdown(content: string, options?: Parameters<typeof renderMarkdownContent>[2]) {
  return render(<>{renderMarkdownContent(content, undefined, options)}</>);
}

function quoteFrame(node: ReactTestInstance): ReactTestInstance | null {
  let current: ReactTestInstance | null = node;
  while (current) {
    const style = current.props?.style as { borderLeftWidth?: number } | undefined;
    if (style?.borderLeftWidth === 3) return current;
    current = current.parent;
  }
  return null;
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

  it('puts a wide table in a horizontal scroller with bounded column widths', () => {
    const wideTable = [
      '| Feature | Notes | Owner | Status |',
      '| --- | --- | --- | --- |',
      `| ${'a'.repeat(200)} | short | team | done |`,
    ].join('\n');

    const { getByText } = renderMarkdown(wideTable);

    const cell = getByText('a'.repeat(200));
    expect(ancestorWithProp(cell, 'horizontal')).toBe(true);

    const cellWidth = ancestorStyleNumber(cell, 'width');
    expect(cellWidth).toBeGreaterThanOrEqual(120);
    expect(cellWidth).toBeLessThanOrEqual(260);
    expect(ancestorStyleNumber(getByText('short'), 'width')).toBeGreaterThanOrEqual(120);
  });
});

describe('renderMarkdownContent task lists', () => {
  it('draws a read-only checkbox for each task item instead of the bracket syntax', () => {
    const { getAllByTestId, getByText, queryByText } = renderMarkdown(
      ['- [ ] Write the tests', '- [x] Ship the fix', '- Plain item'].join('\n'),
    );

    const boxes = getAllByTestId('markdown-task-checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).not.toBeChecked();
    expect(boxes[0]).toBeDisabled();
    expect(boxes[1]).toBeChecked();
    expect(boxes[1]).toBeDisabled();
    expect(getByText('Write the tests')).toBeTruthy();
    expect(getByText('Ship the fix')).toBeTruthy();
    expect(getByText('Plain item')).toBeTruthy();
    expect(queryByText(/\[ \]|\[x\]/)).toBeNull();
    expect(getByText('•')).toBeTruthy();
  });

  it('accepts task items in ordered lists and an uppercase X', () => {
    const { getAllByTestId, getByText } = renderMarkdown('1. [X] Done step');

    expect(getAllByTestId('markdown-task-checkbox')[0]).toBeChecked();
    expect(getByText('Done step')).toBeTruthy();
  });

  it('renders plus bullets and parenthesised numbers as list items', () => {
    const { getByText, queryByText } = renderMarkdown(
      ['+ Plus bullet', '', '1) First step', '2) Second step'].join('\n'),
    );

    expect(queryByText('+ Plus bullet')).toBeNull();
    expect(getByText('Plus bullet')).toBeTruthy();
    expect(queryByText('1) First step')).toBeNull();
    expect(getByText('1.')).toBeTruthy();
    expect(getByText('Second step')).toBeTruthy();
  });
});

describe('renderMarkdownContent blockquotes', () => {
  it('keeps a quote with a blank quoted line as one quote with two paragraphs', () => {
    const { getByText, queryByText } = renderMarkdown(
      ['> First paragraph', '>', '> Second paragraph'].join('\n'),
    );

    expect(queryByText('>')).toBeNull();
    const first = quoteFrame(getByText('First paragraph'));
    expect(first).not.toBeNull();
    expect(quoteFrame(getByText('Second paragraph'))).toBe(first);
  });

  it('reads a quote marker written without a following space', () => {
    const { getByText, queryByText } = renderMarkdown('>No space after the marker');

    expect(queryByText('>No space after the marker')).toBeNull();
    expect(quoteFrame(getByText('No space after the marker'))).not.toBeNull();
  });

  it('renders markdown inside a quote', () => {
    const { getByText, queryByText } = renderMarkdown(
      ['> - first point', '> - **second** point'].join('\n'),
    );

    expect(queryByText('- first point')).toBeNull();
    expect(quoteFrame(getByText('first point'))).not.toBeNull();
    expect(getByText('second')).toHaveStyle({ fontWeight: '700' });
  });

  it('keeps the quoted voice on quoted paragraphs', () => {
    const { getByText } = renderMarkdown('> Quoted words');

    expect(getByText('Quoted words')).toHaveStyle({
      fontStyle: 'italic',
      color: darkColors.textSecondary,
    });
  });
});

describe('renderMarkdownContent inline emphasis', () => {
  it('renders bold italic text with both weights', () => {
    const { getByText, queryByText } = renderMarkdown('This is ***both*** at once.');

    expect(queryByText('***both***')).toBeNull();
    expect(getByText('both')).toHaveStyle({ fontWeight: '700', fontStyle: 'italic' });
  });

  it('renders code and links inside bold text', () => {
    const { getByText, queryByText } = renderMarkdown(
      '**Run `npm test` and read [the docs](https://docs.example.com)**',
    );

    expect(queryByText(/`npm test`/)).toBeNull();
    expect(getByText('npm test')).toHaveStyle({ fontFamily: 'Menlo' });
    expect(getByText('the docs').props.accessibilityRole).toBe('link');
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

  it('paints added and removed lines with the readable diff pairs', () => {
    const { getAllByTestId, getByText } = renderMarkdown(diff);

    const added = getAllByTestId('markdown-diff-line-added');
    const removed = getAllByTestId('markdown-diff-line-removed');
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(getAllByTestId('markdown-diff-line-context')).toHaveLength(1);
    expect(added[0]).toHaveStyle({ backgroundColor: darkColors.diffAddedFill });
    expect(removed[0]).toHaveStyle({ backgroundColor: darkColors.diffRemovedFill });
    expect(getByText('+return price * quantity;')).toHaveStyle({
      color: darkColors.diffAddedText,
    });
    expect(getByText('-return price + quantity;')).toHaveStyle({
      color: darkColors.diffRemovedText,
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

  it('treats patch fences as diffs', () => {
    const { getAllByTestId } = renderMarkdown('```patch\n+added\n```');

    expect(getAllByTestId('markdown-diff-line-added')).toHaveLength(1);
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
