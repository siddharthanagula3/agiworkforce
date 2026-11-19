import { drawnInlineMath, readTable, splitTableRow, tableCellHasLink } from '../markdownTableRows';

describe('markdown table rows', () => {
  it('splits a row with or without outer pipes and unescapes a pipe inside a cell', () => {
    expect(splitTableRow('| a | b \\| c |')).toEqual(['a', 'b | c']);
    expect(splitTableRow('a | b')).toEqual(['a', 'b']);
  });

  it('reads a table that starts at a header with a matching delimiter row', () => {
    const lines = ['x | y', '--|--', '1 | 2', '3 | 4', '', 'after'];

    expect(readTable(lines, 0)).toEqual({
      rows: [
        ['x', 'y'],
        ['1', '2'],
        ['3', '4'],
      ],
      next: 4,
    });
  });

  it('refuses a header whose delimiter has another number of columns or a quote', () => {
    expect(readTable(['x | y', '---', 'a | b'], 0)).toBeNull();
    expect(readTable(['> x | y', '--|--'], 0)).toBeNull();
    expect(readTable(['x | y'], 0)).toBeNull();
  });

  it('drops the cells a body row has beyond the header and pads a short row with empty cells', () => {
    const lines = ['| A | B |', '| --- | --- |', '| 1 | 2 | 3 |', '| 4 |', '| 5 | 6 |'];

    expect(readTable(lines, 0)).toEqual({
      rows: [
        ['A', 'B'],
        ['1', '2'],
        ['4', ''],
        ['5', '6'],
      ],
      next: 5,
    });
  });

  it('continues the table with a pipe line right after it, as GFM does', () => {
    const lines = ['| A | B |', '| --- | --- |', '| 1 | 2 |', 'note | here', '', 'after | text'];

    expect(readTable(lines, 0)).toEqual({
      rows: [
        ['A', 'B'],
        ['1', '2'],
        ['note', 'here'],
      ],
      next: 4,
    });
  });
});

describe('math drawn in a table cell', () => {
  it('takes the wider of numerator and denominator for a fraction', () => {
    expect(drawnInlineMath('$\\frac{a+b}{c}$')).toBe('a+b');
    expect(drawnInlineMath('$\\frac{x}{yz+1}$')).toBe('yz+1');
    expect(drawnInlineMath('$\\frac12$')).toBe('1');
  });

  it('drops braces, superscripts, subscripts and spacing', () => {
    expect(drawnInlineMath('$x^{2}_{i} + y$')).toBe('x2i+y');
    expect(drawnInlineMath('$\\left( a \\, b \\right)$')).toBe('(ab)');
  });

  it('strips command names but keeps what they draw', () => {
    expect(drawnInlineMath('$\\text{rate} = \\alpha$')).toBe('rate=x');
    expect(drawnInlineMath('$\\sin \\theta$')).toBe('sinx');
  });

  it('reads both inline forms and leaves the rest of the cell alone', () => {
    expect(drawnInlineMath('rate \\(\\frac{a}{b}\\) and $$n^2$$ done')).toBe('rate a and n2 done');
    expect(drawnInlineMath('costs \\$5 and \\$6')).toBe('costs \\$5 and \\$6');
  });
});

describe('links in a table cell', () => {
  it('finds a link, also inside emphasis', () => {
    expect(tableCellHasLink('[Docs](https://example.com)')).toBe(true);
    expect(tableCellHasLink('**[Docs](https://example.com)**')).toBe(true);
    expect(
      tableCellHasLink('[Docs][ref]', { linkDefinitions: { ref: 'https://example.com' } }),
    ).toBe(true);
  });

  it('finds none in plain or styled text', () => {
    expect(tableCellHasLink('Plan')).toBe(false);
    expect(tableCellHasLink('**Plan** and `code`')).toBe(false);
    expect(tableCellHasLink('[Docs]')).toBe(false);
  });
});
