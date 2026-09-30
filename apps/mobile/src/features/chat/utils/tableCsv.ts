const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function plainCell(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\\\|/g, '|')
    .trim();
}

function csvCell(value: string): string {
  const plain = plainCell(value);
  const guarded = FORMULA_PREFIX.test(plain) ? `'${plain}` : plain;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function markdownTableToCsv(rows: readonly (readonly string[])[]): string {
  const width = Math.max(0, ...rows.map((row) => row.length));
  return rows
    .map((row) => Array.from({ length: width }, (_, index) => csvCell(row[index] ?? '')).join(','))
    .join('\r\n');
}
