import { tableRows } from '@/services/docxExport';

describe('docx table rows', () => {
  it('drops only the delimiter row after the header', () => {
    expect(tableRows(['| Status | Count |', '| --- | :---: |', '| Ready | 4 |'])).toEqual([
      ['Status', 'Count'],
      ['Ready', '4'],
    ]);
  });

  it('keeps a body row whose first cell starts with hyphens', () => {
    expect(
      tableRows([
        '| Status | Count |',
        '| --- | --- |',
        '| --- pending | 17 |',
        '| Ready | 4 |',
        '| --- | 9 |',
      ]),
    ).toEqual([
      ['Status', 'Count'],
      ['--- pending', '17'],
      ['Ready', '4'],
      ['---', '9'],
    ]);
  });

  it('keeps every row of a table that has no delimiter row', () => {
    expect(tableRows(['| A | B |', '| 1 | 2 |'])).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
  });
});
