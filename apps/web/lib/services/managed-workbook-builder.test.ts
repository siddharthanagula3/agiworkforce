import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { buildWorkbook, exactCellNumber, isNumericCellText } from './managed-workbook-builder';

async function firstSheet(rows: (string | number)[][]): Promise<string> {
  const zip = await JSZip.loadAsync(await buildWorkbook([{ name: 'Data', rows }]));
  return zip.file('xl/worksheets/sheet1.xml')!.async('string');
}

describe('workbook cells written from strings', () => {
  it('writes a string holding a decimal number as a numeric cell', async () => {
    const xml = await firstSheet([['42', '-3.5', '0.25', ' 18 ']]);

    expect(xml).toContain('<c r="A1"><v>42</v></c>');
    expect(xml).toContain('<c r="B1"><v>-3.5</v></c>');
    expect(xml).toContain('<c r="C1"><v>0.25</v></c>');
    expect(xml).toContain('<c r="D1"><v>18</v></c>');
  });

  it('keeps a code with leading zeros as text', async () => {
    const xml = await firstSheet([['007', '00123']]);

    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">007</t></is></c>');
    expect(xml).toContain('<c r="B1" t="inlineStr"><is><t xml:space="preserve">00123</t></is></c>');
  });

  it('keeps dates and other number-like text as text', async () => {
    const xml = await firstSheet([['2026-11-15', '1e5', '1,200', '+4', '12.']]);

    for (const column of ['A', 'B', 'C', 'D', 'E']) {
      expect(xml).toMatch(new RegExp(`<c r="${column}1" t="inlineStr">`));
    }
  });

  it('keeps a long digit string as text so no digit is lost', async () => {
    const xml = await firstSheet([['12345678901234567890', '9007199254740993']]);

    expect(xml).toContain(
      '<c r="A1" t="inlineStr"><is><t xml:space="preserve">12345678901234567890</t></is></c>',
    );
    expect(xml).toContain(
      '<c r="B1" t="inlineStr"><is><t xml:space="preserve">9007199254740993</t></is></c>',
    );
  });

  it('keeps a digit string of twelve or more digits as text so it does not open in scientific notation', async () => {
    const xml = await firstSheet([['4006381333931', '123456789012', '12345678901']]);

    expect(xml).toContain(
      '<c r="A1" t="inlineStr"><is><t xml:space="preserve">4006381333931</t></is></c>',
    );
    expect(xml).toContain(
      '<c r="B1" t="inlineStr"><is><t xml:space="preserve">123456789012</t></is></c>',
    );
    expect(xml).toContain('<c r="C1"><v>12345678901</v></c>');
  });

  it('keeps a decimal with trailing zeros as text so it shows as written', async () => {
    const xml = await firstSheet([['3.10', '12.50', '-0']]);

    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">3.10</t></is></c>');
    expect(xml).toContain('<c r="B1" t="inlineStr"><is><t xml:space="preserve">12.50</t></is></c>');
    expect(xml).toContain('<c r="C1" t="inlineStr"><is><t xml:space="preserve">-0</t></is></c>');
  });

  it('still writes numbers as numbers and formulas as formulas', async () => {
    const xml = await firstSheet([[3, '=A1*2']]);

    expect(xml).toContain('<c r="A1"><v>3</v></c>');
    expect(xml).toContain('<c r="B1"><f>A1*2</f></c>');
  });
});

describe('isNumericCellText', () => {
  it('accepts canonical decimals of up to eleven digits that read back as written', () => {
    expect(isNumericCellText('12345678901')).toBe(true);
    expect(isNumericCellText('123456789012')).toBe(false);
    expect(isNumericCellText('123456789012345')).toBe(false);
    expect(isNumericCellText('0.000123')).toBe(true);
    expect(isNumericCellText('1234567890123456')).toBe(false);
    expect(isNumericCellText('-0.5')).toBe(true);
    expect(isNumericCellText('3.10')).toBe(false);
    expect(isNumericCellText('0012')).toBe(false);
  });
});

describe('exactCellNumber', () => {
  it('reads canonical decimals up to fifteen significant digits', () => {
    expect(exactCellNumber('123456789012345')).toBe(123456789012345);
    expect(exactCellNumber('3.10')).toBe(3.1);
    expect(exactCellNumber('1234567890123456')).toBeUndefined();
    expect(exactCellNumber('0012')).toBeUndefined();
  });
});
