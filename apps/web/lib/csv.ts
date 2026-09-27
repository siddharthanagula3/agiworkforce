export function csvCell(value: string | number): string {
  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /["\r\n,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}
