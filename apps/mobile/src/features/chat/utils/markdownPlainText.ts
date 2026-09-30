const FENCE = /^\s*(```|~~~)/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function plainLine(line: string): string {
  const row = line.trim();
  if (row.startsWith('|') && row.endsWith('|')) {
    return row
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim())
      .join('\t');
  }
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/^(\s*)[-*+]\s+(?:\[[ xX]\]\s+)?/, '$1• ')
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(?<![*\w])\*(?=\S)(.+?)(?<=\S)\*(?![*\w])/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .split('\n')
    .filter((line) => !FENCE.test(line) && !TABLE_SEPARATOR.test(line))
    .map(plainLine)
    .join('\n');
}
