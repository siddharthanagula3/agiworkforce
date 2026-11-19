import { describe, expect, it } from 'vitest';
import { nextTabularSort, parseTabular, sortTabularRows, SPREADSHEET_ROW_CAP } from './tabular';

function table(csv: string) {
  const data = parseTabular(csv);
  if (!data) throw new Error('table did not parse');
  return data;
}

describe('nextTabularSort', () => {
  it('cycles one column through ascending, descending and unsorted', () => {
    const asc = nextTabularSort(null, 1);
    expect(asc).toEqual({ column: 1, direction: 'asc' });
    const desc = nextTabularSort(asc, 1);
    expect(desc).toEqual({ column: 1, direction: 'desc' });
    expect(nextTabularSort(desc, 1)).toBeNull();
  });

  it('starts a different column ascending', () => {
    expect(nextTabularSort({ column: 0, direction: 'desc' }, 2)).toEqual({
      column: 2,
      direction: 'asc',
    });
  });
});

describe('sortTabularRows', () => {
  const data = table('Name,Amount\nb,"$1,200"\na,30\nc,\nB10,5\nB9,(7)');

  it('keeps the original order when unsorted', () => {
    expect(sortTabularRows(data, null)).toBe(data.rows);
  });

  it('sorts a numeric column by value with empty cells last', () => {
    expect(sortTabularRows(data, { column: 1, direction: 'asc' }).map((row) => row[0])).toEqual([
      'B9',
      'B10',
      'a',
      'b',
      'c',
    ]);
    expect(sortTabularRows(data, { column: 1, direction: 'desc' }).map((row) => row[0])).toEqual([
      'b',
      'a',
      'B10',
      'B9',
      'c',
    ]);
  });

  it('sorts text naturally and without case', () => {
    expect(sortTabularRows(data, { column: 0, direction: 'asc' }).map((row) => row[0])).toEqual([
      'a',
      'b',
      'B9',
      'B10',
      'c',
    ]);
  });

  it('does not reorder the rows it was given', () => {
    const before = data.rows.map((row) => row[0]);
    sortTabularRows(data, { column: 0, direction: 'desc' });
    expect(data.rows.map((row) => row[0])).toEqual(before);
  });

  it('caps the grid at 500 rows', () => {
    expect(SPREADSHEET_ROW_CAP).toBe(500);
  });
});
