import { describe, expect, it } from 'vitest';
import {
  builtInNumberFormat,
  displayCellNumber,
  parseNumberFormat,
} from './workbook-number-formats';

describe('parseNumberFormat', () => {
  it('reads m as minutes next to hours or seconds and as months elsewhere', () => {
    expect(parseNumberFormat('h:mm')).toEqual({
      kind: 'date',
      date: false,
      time: true,
      seconds: false,
    });
    expect(parseNumberFormat('mm:ss')).toEqual({
      kind: 'date',
      date: false,
      time: true,
      seconds: true,
    });
    expect(parseNumberFormat('mm/dd/yyyy')).toEqual({
      kind: 'date',
      date: true,
      time: false,
      seconds: false,
    });
    expect(parseNumberFormat('mmm-yy')).toMatchObject({ date: true, time: false });
  });

  it('treats letters inside quotes and after a backslash as text', () => {
    expect(parseNumberFormat('"mm dd"0')).toMatchObject({ kind: 'number', prefix: 'mm dd' });
    expect(parseNumberFormat('0\\d\\a\\y')).toMatchObject({ kind: 'number', suffix: 'day' });
    expect(parseNumberFormat('"Due "d mmm')).toMatchObject({ kind: 'date', date: true });
  });

  it('refuses what it cannot show faithfully', () => {
    for (const code of [
      '',
      'General',
      '@',
      '"open',
      '0\\',
      '[h]:mm:ss',
      '[Blue]0',
      '0.00E+00',
      '# ?/?',
      '_(0_)',
      '0*-',
      '0;-0',
      'h AM/PM' + 'x',
      'AM/PM',
      'ss.00',
      '0.0#',
      '#,##0,',
      '0%%',
      '0 0',
      `${'0'.repeat(300)}`,
      `0.${'0'.repeat(31)}`,
    ]) {
      expect(parseNumberFormat(code)).toBeNull();
    }
  });

  it('scans a long hostile code in linear time', () => {
    const hostile = `${'"a'.repeat(127)}`;
    const started = Date.now();
    for (let round = 0; round < 2_000; round += 1) parseNumberFormat(hostile);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe('builtInNumberFormat', () => {
  it('knows the date, time, percent and number formats and nothing locale dependent', () => {
    expect(builtInNumberFormat(14)).toMatchObject({ kind: 'date', date: true, time: false });
    expect(builtInNumberFormat(22)).toMatchObject({ kind: 'date', date: true, time: true });
    expect(builtInNumberFormat(10)).toMatchObject({ kind: 'number', percent: true, decimals: 2 });
    expect(builtInNumberFormat(3)).toMatchObject({ kind: 'number', grouped: true, decimals: 0 });
    for (const id of [0, 5, 11, 12, 27, 37, 41, 46, 47, 49, 164]) {
      expect(builtInNumberFormat(id)).toBeNull();
    }
  });
});

describe('displayCellNumber', () => {
  it('shows the stored value without a format or for a value outside the calendar', () => {
    expect(displayCellNumber('45292', null, false)).toBe('45292');
    expect(displayCellNumber('2958466', builtInNumberFormat(14), false)).toBe('2958466');
    expect(displayCellNumber('2958465', builtInNumberFormat(14), false)).toBe('9999-12-31');
    expect(displayCellNumber('2957003', builtInNumberFormat(14), true)).toBe('9999-12-31');
    expect(displayCellNumber('1e400', builtInNumberFormat(1), false)).toBe('1e400');
  });

  it('rounds like the file shows, at fifteen significant digits', () => {
    const fixed = parseNumberFormat('0.00');
    expect(displayCellNumber('0.30000000000000004', fixed, false)).toBe('0.30');
    expect(displayCellNumber('1E+20', parseNumberFormat('0'), false)).toBe('100000000000000000000');
    expect(displayCellNumber('9.995', fixed, false)).toBe('10.00');
    expect(displayCellNumber('0.004', parseNumberFormat('0'), false)).toBe('0');
  });
});
