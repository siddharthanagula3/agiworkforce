import { lineNumberLabels, splitTokensIntoLines } from '../sourceLines';

describe('splitTokensIntoLines', () => {
  it('splits tokens at line breaks and keeps each piece in its colour', () => {
    expect(
      splitTokensIntoLines([
        { type: 'keyword', text: 'def' },
        { type: 'plain', text: ' f():\n    ' },
        { type: 'comment', text: '"""one\ntwo"""' },
        { type: 'plain', text: '\n' },
      ]),
    ).toEqual([
      [
        { type: 'keyword', text: 'def' },
        { type: 'plain', text: ' f():' },
      ],
      [
        { type: 'plain', text: '    ' },
        { type: 'comment', text: '"""one' },
      ],
      [{ type: 'comment', text: 'two"""' }],
      [],
    ]);
  });

  it('gives empty source one empty line', () => {
    expect(splitTokensIntoLines([])).toEqual([[]]);
  });
});

describe('lineNumberLabels', () => {
  it('pads the numbers to the width of the largest', () => {
    const labels = lineNumberLabels(10);
    expect(labels[0]).toBe(' 1');
    expect(labels[9]).toBe('10');
    expect(labels).toHaveLength(10);
  });
});
