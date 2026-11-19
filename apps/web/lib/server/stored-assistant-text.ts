import { stripCitationMarkup } from '@agiworkforce/provider-protocol';

export function withoutStoredCitationMarkupRow<T extends { role?: unknown; content?: unknown }>(
  row: T,
): T {
  if (row.role !== 'assistant' || typeof row.content !== 'string') return row;
  const content = stripCitationMarkup(row.content);
  return content === row.content ? row : { ...row, content };
}

export function withoutStoredCitationMarkup<T extends { role?: unknown; content?: unknown }>(
  rows: T[],
): T[] {
  return rows.map(withoutStoredCitationMarkupRow);
}
