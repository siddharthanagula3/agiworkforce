import { parseCsvRecords } from '../services/csvRecords';

describe('parseCsvRecords', () => {
  it('splits plain records and fields', () => {
    expect(parseCsvRecords('a,b,c\n1,2,3')).toEqual({
      records: [
        ['a', 'b', 'c'],
        ['1', '2', '3'],
      ],
      complete: true,
    });
  });

  it('keeps a comma inside a quoted field', () => {
    expect(parseCsvRecords('name,city\n"Smith, John","Paris, TX"').records[1]).toEqual([
      'Smith, John',
      'Paris, TX',
    ]);
  });

  it('decodes a doubled quote to one literal quote', () => {
    expect(parseCsvRecords('id,note\n1,"Say ""hello"""').records[1]).toEqual(['1', 'Say "hello"']);
  });

  it('keeps a newline inside a quoted field as part of one record', () => {
    expect(parseCsvRecords('id,note,amount\n1,"first\nsecond",10')).toEqual({
      records: [
        ['id', 'note', 'amount'],
        ['1', 'first\nsecond', '10'],
      ],
      complete: true,
    });
  });

  it('keeps a CRLF inside a quoted field and splits records on CRLF', () => {
    expect(parseCsvRecords('id,note\r\n1,"a\r\nb"\r\n2,c\r\n').records).toEqual([
      ['id', 'note'],
      ['1', 'a\r\nb'],
      ['2', 'c'],
    ]);
  });

  it('adds no empty record for a trailing newline, LF or CRLF', () => {
    expect(parseCsvRecords('a,b\n1,2\n').records).toHaveLength(2);
    expect(parseCsvRecords('a,b\r\n1,2\r\n').records).toHaveLength(2);
  });

  it('skips blank lines between records', () => {
    expect(parseCsvRecords('a,b\n\n  \n1,2\n').records).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps an empty quoted field and an empty unquoted field', () => {
    expect(parseCsvRecords('a,b,c\n"",,x').records[1]).toEqual(['', '', 'x']);
    expect(parseCsvRecords('a\n""\nb').records).toEqual([['a'], [''], ['b']]);
  });

  it('keeps a trailing empty column', () => {
    expect(parseCsvRecords('a,b\n1,').records[1]).toEqual(['1', '']);
  });

  it('drops a leading byte order mark instead of gluing it to the first header', () => {
    expect(parseCsvRecords('﻿id,note\n1,x').records[0]).toEqual(['id', 'note']);
  });

  it('keeps the whitespace a quoted field spells out and trims an unquoted one', () => {
    expect(parseCsvRecords('a,b\n"  x  ",  y  ').records[1]).toEqual(['  x  ', 'y']);
  });

  it('reads a quoted field that follows a space after the comma', () => {
    expect(parseCsvRecords('a, b\n1, "x, y"').records).toEqual([
      ['a', 'b'],
      ['1', 'x, y'],
    ]);
  });

  it('treats a quote in the middle of an unquoted field as a literal', () => {
    expect(parseCsvRecords('a\n5" pipe').records[1]).toEqual(['5" pipe']);
  });

  it('reports an unterminated quote and keeps the text that followed it', () => {
    const parsed = parseCsvRecords('a,b\n1,"never closed\n2,3');
    expect(parsed.complete).toBe(false);
    expect(parsed.records[1]).toEqual(['1', 'never closed\n2,3']);
  });

  it('returns no records for empty or blank input', () => {
    expect(parseCsvRecords('')).toEqual({ records: [], complete: true });
    expect(parseCsvRecords(' \n\r\n ')).toEqual({ records: [], complete: true });
  });
});
