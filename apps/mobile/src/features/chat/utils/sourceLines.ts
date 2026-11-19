import type { SyntaxToken } from './syntaxHighlight';

export function splitTokensIntoLines(tokens: readonly SyntaxToken[]): SyntaxToken[][] {
  const lines: SyntaxToken[][] = [[]];
  for (const token of tokens) {
    const pieces = token.text.split('\n');
    pieces.forEach((piece, index) => {
      if (index > 0) lines.push([]);
      if (piece.length > 0) lines[lines.length - 1]!.push({ text: piece, type: token.type });
    });
  }
  return lines;
}

export function lineNumberLabels(lineCount: number): string[] {
  const width = String(lineCount).length;
  return Array.from({ length: lineCount }, (_, index) => String(index + 1).padStart(width, ' '));
}
