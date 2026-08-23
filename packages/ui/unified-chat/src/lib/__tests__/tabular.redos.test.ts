import { describe, expect, it } from 'vitest';
import { spreadsheetExportDelimiter } from '../tabular';

describe('spreadsheetExportDelimiter after the ReDoS fix', () => {
  it('keeps the behaviour the regex had', () => {
    expect(spreadsheetExportDelimiter('csv')).toBe(',');
    expect(spreadsheetExportDelimiter('CSV')).toBe(',');
    expect(spreadsheetExportDelimiter('csv.')).toBe(',');
    expect(spreadsheetExportDelimiter('csv...   ')).toBe(',');
    expect(spreadsheetExportDelimiter('foo.csv')).toBe(',');
    expect(spreadsheetExportDelimiter('tsv')).toBe('\t');
    expect(spreadsheetExportDelimiter('png')).toBeNull();
    expect(spreadsheetExportDelimiter('')).toBeNull();
    expect(spreadsheetExportDelimiter(null)).toBeNull();
    expect(spreadsheetExportDelimiter(undefined)).toBeNull();
  });

  it('does not degrade on a long adversarial run', () => {
    // The shape the regex backtracked on: a long run of the repeated class
    // that does not ultimately match.
    const hostile = `${'. '.repeat(50_000)}x`;
    const started = performance.now();
    expect(spreadsheetExportDelimiter(hostile)).toBeNull();
    expect(performance.now() - started).toBeLessThan(250);
  });
});
