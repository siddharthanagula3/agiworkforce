import * as vscode from 'vscode';

import { declarationSpan, type DeclarationSpan } from './declarationSpan';

interface CachedLensesEntry {
  version: number;
  lenses: vscode.CodeLens[];
}

export class AgiCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

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
      const lensRange = new vscode.Range(i, 0, i, line.length);
      const span = declarationSpan(lines, i);
      const targetRange = new vscode.Range(span.startLine, 0, span.endLine, span.endCharacter);

      lenses.push(
        new vscode.CodeLens(lensRange, {
          title: '$(hubot) Ask AI',
          tooltip: 'Explain this with AGI Workforce',
          command: 'agi-workforce.explain',
          arguments: [targetRange],
        }),
      );

      lenses.push(
        new vscode.CodeLens(lensRange, {
          title: '$(beaker) Tests',
          tooltip: 'Generate tests with AGI Workforce',
          command: 'agi-workforce.generateTests',
          arguments: [targetRange],
        }),
      );

      lenses.push(
        new vscode.CodeLens(lensRange, {
          title: '$(edit) Refactor',
          tooltip: 'Refactor this with AGI Workforce',
          command: 'agi-workforce.refactor',
          arguments: [targetRange],
        }),
      );

      lenses.push(
        new vscode.CodeLens(lensRange, {
          title: '$(book) Docs',
          tooltip: 'Generate documentation with AGI Workforce',
          command: 'agi-workforce.docs',
          arguments: [targetRange],
        }),
      );
    }
  }

  for (const note of commentNoteLenses(lines)) {
    const anchor = lines[note.anchorLine]!;
    const lensRange = new vscode.Range(note.anchorLine, 0, note.anchorLine, anchor.length);
    const noteRange = new vscode.Range(
      note.target.startLine,
      0,
      note.target.endLine,
      note.target.endCharacter,
    );

    for (const action of noteActions(note.keyword)) {
      lenses.push(
        new vscode.CodeLens(lensRange, {
          title: action.title,
          tooltip: action.tooltip,
          command: action.command,
          arguments: [noteRange],
        }),
      );
    }
  }

  return lenses;
}

const NOTE_KEYWORD = /\b(TODO|FIXME|HACK|BUG|XXX)\b/;

const COMMENT_PREFIXES = ['//', '/*', '*', '#', '--', '<!--'];

export interface CommentNote {
  keyword: string;
  anchorLine: number;
  target: DeclarationSpan;
}

function isCommentLine(line: string | undefined): boolean {
  const trimmed = (line ?? '').trimStart();
  if (trimmed === '') return false;
  return COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function noteActions(keyword: string): ReadonlyArray<{
  title: string;
  tooltip: string;
  command: string;
}> {
  return [
    {
      title: `$(wrench) Resolve ${keyword}`,
      tooltip: `Have AGI Workforce carry out this ${keyword}`,
      command: 'agi-workforce.fix',
    },
    {
      title: '$(hubot) Ask AI',
      tooltip: 'Explain this note and the code it annotates',
      command: 'agi-workforce.explain',
    },
  ];
}

function noteTarget(
  lines: readonly string[],
  blockStart: number,
  blockEnd: number,
): DeclarationSpan {
  const annotated = lines[blockEnd + 1];
  if (annotated !== undefined && annotated.trim() !== '' && !isCommentLine(annotated)) {
    const span = declarationSpan(lines, blockEnd + 1);
    return { startLine: blockStart, endLine: span.endLine, endCharacter: span.endCharacter };
  }
  return { startLine: blockStart, endLine: blockEnd, endCharacter: (lines[blockEnd] ?? '').length };
}

export function commentNoteLenses(lines: readonly string[]): CommentNote[] {
  const notes: CommentNote[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!isCommentLine(lines[i])) continue;

    let blockEnd = i;
    while (isCommentLine(lines[blockEnd + 1])) blockEnd++;

    for (let j = i; j <= blockEnd; j++) {
      const match = NOTE_KEYWORD.exec(lines[j] ?? '');
      if (match === null) continue;
      notes.push({
        keyword: match[1]!,
        anchorLine: j,
        target: noteTarget(lines, i, blockEnd),
      });
      break;
    }

    i = blockEnd;
  }

  return notes;
}

function isFunctionOrClassLine(line: string, languageId: string): boolean {
  const trimmed = line.trimStart();

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
      return (
        /^(export\s+)?(async\s+)?function\s+\w/.test(trimmed) ||
        /^(export\s+)?class\s+\w/.test(trimmed) ||
        /^def\s+\w/.test(trimmed) ||
        /^func\s+/.test(trimmed)
      );
  }
}
