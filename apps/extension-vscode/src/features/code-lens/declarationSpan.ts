/**
 * declarationSpan.ts — how much code a CodeLens action should send.
 *
 * Kept free of `vscode` imports so it can be tested directly. The provider
 * wraps the result in a `vscode.Range`.
 *
 * This exists because the lens range used to be computed and then discarded:
 * the lens commands took no arguments, so `runInlineCommand` fell back to
 * `editor.selection`, and an empty selection makes `getText(undefined)` return
 * the whole document. Clicking "Ask AI" above one function sent the entire file.
 */

export interface DeclarationSpan {
  startLine: number;
  endLine: number;
  /** Column at the end of `endLine`, so the span covers that line completely. */
  endCharacter: number;
}

/**
 * Span of the declaration beginning at `startLine`.
 *
 * Brace-counting for brace languages, indentation for the rest. A heuristic in
 * the same spirit as the declaration detection itself: when it cannot tell
 * where the block ends (unbalanced braces mid-edit, a trailing declaration with
 * no body) it returns the declaration line alone rather than swallowing the
 * remainder of the file — the failure mode this whole module exists to prevent.
 */
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
