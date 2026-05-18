/**
 * codeLensProvider.ts -- CodeLens provider showing "Ask AI" on functions/classes
 *
 * Adds a clickable "Ask AI" lens above every function and class declaration.
 * Clicking opens the chat with the function/class pre-selected as context.
 */

import * as vscode from 'vscode';

interface CachedLensesEntry {
  version: number;
  lenses: vscode.CodeLens[];
}

export class AgiCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /**
   * Cache lens results per document. VS Code calls `provideCodeLenses` on every
   * editor change; without a cache a 5,000-line file pays ~45,000 regex
   * evaluations per refresh. Invalidated automatically when the document's
   * version increments (any edit) and explicitly by `refresh()`.
   *
   * Map key: document.uri.toString(). Bounded — older entries evicted via
   * editor close (no listener here; relies on natural turnover).
   */
  private readonly _cache = new Map<string, CachedLensesEntry>();

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const cacheKey = document.uri.toString();
    const cached = this._cache.get(cacheKey);
    if (cached !== undefined && cached.version === document.version) {
      return cached.lenses;
    }

    const lenses = computeLenses(document);
    this._cache.set(cacheKey, { version: document.version, lenses });
    return lenses;
  }

  refresh(): void {
    this._cache.clear();
    this._onDidChangeCodeLenses.fire();
  }
}

function computeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
  const lenses: vscode.CodeLens[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isFunctionOrClassLine(line, document.languageId)) {
      const range = new vscode.Range(i, 0, i, line.length);

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(hubot) Ask AI',
          tooltip: 'Explain this with AGI Workforce',
          command: 'agi-workforce.explain',
        }),
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(beaker) Tests',
          tooltip: 'Generate tests with AGI Workforce',
          command: 'agi-workforce.generateTests',
        }),
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(edit) Refactor',
          tooltip: 'Refactor this with AGI Workforce',
          command: 'agi-workforce.refactor',
        }),
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(book) Docs',
          tooltip: 'Generate documentation with AGI Workforce',
          command: 'agi-workforce.docs',
        }),
      );
    }
  }

  return lenses;
}

/**
 * Detects whether a line is a function/class/method declaration
 * for common languages. Uses simple heuristics, not full parsing.
 */
function isFunctionOrClassLine(line: string, languageId: string): boolean {
  const trimmed = line.trimStart();

  // Skip empty lines, comments, imports
  if (
    trimmed === '' ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*')
  ) {
    return false;
  }
  if (
    trimmed.startsWith('import ') ||
    trimmed.startsWith('from ') ||
    trimmed.startsWith('require(')
  ) {
    return false;
  }

  switch (languageId) {
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
      return (
        /^(export\s+)?(default\s+)?(async\s+)?function\s+\w/.test(trimmed) ||
        /^(export\s+)?(default\s+)?class\s+\w/.test(trimmed) ||
        /^(export\s+)?(const|let)\s+\w+\s*=\s*(async\s+)?\(/.test(trimmed) ||
        /^(public|private|protected|static|async)\s+(async\s+)?\w+\s*\(/.test(trimmed)
      );

    case 'python':
      return /^(async\s+)?def\s+\w/.test(trimmed) || /^class\s+\w/.test(trimmed);

    case 'go':
      return /^func\s+/.test(trimmed) || /^type\s+\w+\s+struct\s*\{/.test(trimmed);

    case 'rust':
      return (
        /^(pub\s+)?(async\s+)?fn\s+\w/.test(trimmed) ||
        /^(pub\s+)?struct\s+\w/.test(trimmed) ||
        /^(pub\s+)?enum\s+\w/.test(trimmed) ||
        /^impl\s+/.test(trimmed)
      );

    case 'java':
    case 'kotlin':
      return (
        /^(public|private|protected|static|abstract|final|override)\s+.*\w+\s*\(/.test(trimmed) ||
        /^(public\s+|private\s+|protected\s+)?(abstract\s+|final\s+)?class\s+\w/.test(trimmed) ||
        /^(public\s+|private\s+|protected\s+)?interface\s+\w/.test(trimmed)
      );

    case 'ruby':
      return (
        /^def\s+\w/.test(trimmed) || /^class\s+\w/.test(trimmed) || /^module\s+\w/.test(trimmed)
      );

    case 'php':
      return (
        /^(public|private|protected|static)?\s*(function)\s+\w/.test(trimmed) ||
        /^(abstract\s+|final\s+)?class\s+\w/.test(trimmed)
      );

    case 'c':
    case 'cpp':
    case 'csharp':
      return (
        /^(public|private|protected|static|virtual|override|async)?\s*\w+[\w<>, ]*\s+\w+\s*\(/.test(
          trimmed,
        ) || /^(class|struct|enum)\s+\w/.test(trimmed)
      );

    case 'swift':
      return /^(public\s+|private\s+|internal\s+|open\s+)?(class|struct|enum|func|protocol)\s+\w/.test(
        trimmed,
      );

    default:
      // Generic fallback: function/class/def keywords
      return (
        /^(export\s+)?(async\s+)?function\s+\w/.test(trimmed) ||
        /^(export\s+)?class\s+\w/.test(trimmed) ||
        /^def\s+\w/.test(trimmed) ||
        /^func\s+/.test(trimmed)
      );
  }
}
