import { render } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));
jest.mock('../CodeBlockCopyButton', () => ({ CodeBlockCopyButton: () => null }));

import { renderMarkdownContent } from '../MessageContentRenderer';

function renderMarkdown(content: string) {
  return render(<>{renderMarkdownContent(content)}</>);
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
