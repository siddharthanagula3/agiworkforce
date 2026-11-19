import { describe, expect, it } from 'vitest';
import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import { CellFormatTable, MAX_CELL_FORMATS, styleIndex } from './workbook-cell-formats';
import { builtInNumberFormat } from './workbook-number-formats';

describe('styleIndex', () => {
  it('reads a non-negative decimal index and rejects anything else', () => {
    expect(styleIndex('0')).toBe(0);
    expect(styleIndex('164')).toBe(164);
    expect(styleIndex(undefined)).toBe(-1);
    expect(styleIndex('')).toBe(-1);
    expect(styleIndex('-1')).toBe(-1);
    expect(styleIndex('1e3')).toBe(-1);
    expect(styleIndex('1234567890')).toBe(-1);
  });
});

describe('CellFormatTable', () => {
  it('resolves each cell format to its custom format, else the built-in one, else none', () => {
    const table = new CellFormatTable();
    expect(table.addCustomFormat('164', '0.00%')).toBe(true);
    expect(table.addCustomFormat('14', 'yyyy')).toBe(true);
    expect(table.addCustomFormat('x', '0')).toBe(true);
    for (const id of ['164', '14', '9', undefined, '7', 'x', '164']) {
      expect(table.addCellFormat(id)).toBe(true);
    }

    const formats = table.formats();

    expect(formats).toHaveLength(7);
    expect(formats[0]).toMatchObject({ kind: 'number', percent: true, decimals: 2 });
    expect(formats[1]).toEqual({ kind: 'date', date: true, time: false, seconds: false });
    expect(formats[2]).toBe(builtInNumberFormat(9));
    expect(formats[3]).toBeNull();
    expect(formats[4]).toBeNull();
    expect(formats[5]).toBeNull();
    expect(formats[6]).toBe(formats[0]);
  });

  it('accepts exactly the bound of cell formats and refuses the next one', () => {
    const table = new CellFormatTable();
    for (let index = 0; index < MAX_CELL_FORMATS; index += 1) {
      expect(table.addCellFormat('14')).toBe(true);
    }
    expect(table.addCellFormat('14')).toBe(false);
  });

  it('accepts exactly the bound of custom formats and refuses the next one', () => {
    const table = new CellFormatTable();
    for (let index = 0; index < MAX_CELL_FORMATS; index += 1) {
      expect(table.addCustomFormat(String(164 + index), '')).toBe(true);
    }
    expect(table.addCustomFormat(String(164 + MAX_CELL_FORMATS), '')).toBe(false);
  });

  it('refuses custom format codes whose total length passes the file text bound', () => {
    const table = new CellFormatTable();
    expect(table.addCustomFormat('164', 'y'.repeat(MAX_FILE_TEXT_CHARS))).toBe(true);
    expect(table.addCustomFormat('165', '0')).toBe(false);
  });
});
