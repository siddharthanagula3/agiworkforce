
export interface DeclarationSpan {
  startLine: number;
  endLine: number;
  endCharacter: number;
}

export function declarationSpan(lines: readonly string[], startLine: number): DeclarationSpan {
  const first = lines[startLine] ?? '';
  const lineLength = (index: number): number => (lines[index] ?? '').length;
  const only: DeclarationSpan = {
    startLine,
    endLine: startLine,
    endCharacter: lineLength(startLine),
  };

  if (first.includes('{')) {
    let depth = 0;
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i] ?? '';
      for (const char of line) {
        if (char === '{') depth++;
        else if (char === '}') depth--;
      }
      if (depth <= 0) {
        return { startLine, endLine: i, endCharacter: lineLength(i) };
      }
    }
    return only;
  }

  const baseIndent = first.length - first.trimStart().length;
  let endLine = startLine;
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= baseIndent) break;
    endLine = i;
  }

  return { startLine, endLine, endCharacter: lineLength(endLine) };
}
