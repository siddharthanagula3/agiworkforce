import { describe, expect, it } from 'vitest';
import { parseCsvTable, parseTabular } from './tabular';

const ROW_COUNT = 200_000;

function oneColumnCsv(): string {
  return ['Value', ...Array.from({ length: ROW_COUNT }, (_, index) => String(index % 10))].join(
    '\n',
  );
}

describe('tables with more rows than a call can take as arguments', () => {
  it('reads every row of a one-column sheet', () => {
    const table = parseCsvTable(oneColumnCsv());

    expect(table?.columns).toEqual(['Value']);
    expect(table?.rows).toHaveLength(ROW_COUNT);
  });

  it('reads every row of a sniffed delimited table', () => {
    const table = parseTabular(`Name,Value\n${'a,1\n'.repeat(ROW_COUNT)}`);

    expect(table?.columns).toEqual(['Name', 'Value']);
    expect(table?.rows.length).toBeGreaterThanOrEqual(ROW_COUNT);
  });
});
