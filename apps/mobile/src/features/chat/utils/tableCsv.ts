import { toCsv, toTsv, type TabularData } from '@agiworkforce/unified-chat/tabular';
import { inlinePlainText } from '@/src/features/chat/utils/markdownInlineSyntax';

export function tableCellPlainText(value: string): string {
  return inlinePlainText(value).trim();
}

export function markdownTableData(rows: readonly (readonly string[])[]): TabularData {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const cells = rows.map((row) =>
    Array.from({ length: width }, (_, index) => tableCellPlainText(row[index] ?? '')),
  );
  const [columns = [], ...body] = cells;
  return {
    columns,
    rows: body,
    numericColumns: columns.map(() => false),
    source: 'delimited',
  };
}

export function markdownTableToCsv(rows: readonly (readonly string[])[]): string {
  return toCsv(markdownTableData(rows));
}

export function markdownTableToTsv(rows: readonly (readonly string[])[]): string {
  return toTsv(markdownTableData(rows));
}
