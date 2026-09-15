import * as vscode from 'vscode';

const CONTEXT_RADIUS = 15;

export type EditorUtility = 'explain' | 'explainError' | 'askAboutCode' | 'explainTerminal';

interface Refusal {
  ok: false;
  message: string;
}

interface Prompt {
  ok: true;
  prompt: string;
}

export type EditorUtilityPrompt = Prompt | Refusal;

let askChat: ((prompt: string) => void | PromiseLike<void>) | undefined;

export function setEditorUtilityChat(sink?: (prompt: string) => void | PromiseLike<void>): void {
  askChat = sink;
}

export async function runEditorUtility(built: EditorUtilityPrompt): Promise<void> {
  if (!built.ok) {
    vscode.window.showWarningMessage(`AGI Workforce: ${built.message}`);
    return;
  }
  if (askChat === undefined) {
    vscode.window.showWarningMessage(
      'AGI Workforce: The chat view is not available in this window. Reload the window and try again.',
    );
    return;
  }
  await askChat(built.prompt);
}

function fence(language: string, body: string): string {
  return `\`\`\`${language}\n${body}\n\`\`\``;
}

export function buildExplainSelectionPrompt(targetRange?: vscode.Range): EditorUtilityPrompt {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) return { ok: false, message: 'No active editor. Open a file first.' };

  const range = targetRange ?? (editor.selection.isEmpty ? undefined : editor.selection);
  if (range === undefined) return { ok: false, message: 'Select some code first.' };

  const selected = editor.document.getText(range);
  if (selected.trim() === '') return { ok: false, message: 'Select some code first.' };

  const language = editor.document.languageId;
  const path = vscode.workspace.asRelativePath(editor.document.uri);
  return {
    ok: true,
    prompt:
      `Explain this ${language} code from ${path}, lines ${range.start.line + 1}-${range.end.line + 1}. ` +
      `Be concise.\n\n${fence(language, selected)}`,
  };
}

export function buildExplainErrorPrompt(): EditorUtilityPrompt {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) return { ok: false, message: 'No active editor. Open a file first.' };

  const { document, selection } = editor;
  const relevant = vscode.languages
    .getDiagnostics(document.uri)
    .filter((diagnostic) =>
      selection.isEmpty
        ? diagnostic.range.start.line <= selection.active.line &&
          diagnostic.range.end.line >= selection.active.line
        : diagnostic.range.start.line <= selection.end.line &&
          diagnostic.range.end.line >= selection.start.line,
    );
  if (relevant.length === 0) return { ok: false, message: 'No errors on this line.' };

  const summary = relevant
    .map((diagnostic, index) => {
      const source = diagnostic.source === undefined ? '' : ` [${diagnostic.source}]`;
      const code =
        diagnostic.code === undefined
          ? ''
          : ` (${typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code})`;
      return `${index + 1}. ${severityLabel(diagnostic.severity)}${source}${code}: ${diagnostic.message}`;
    })
    .join('\n');

  const anchor = selection.isEmpty ? selection.active.line : selection.start.line;
  const startLine = Math.max(0, anchor - CONTEXT_RADIUS);
  const endLine = Math.min(document.lineCount - 1, anchor + CONTEXT_RADIUS);
  const body = document.getText(
    new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length),
  );
  const language = document.languageId;

  return {
    ok: true,
    prompt:
      `Explain why these problems are reported in ${vscode.workspace.asRelativePath(document.uri)} ` +
      `and give me the corrected code.\n\n### Problems\n${summary}\n\n` +
      `### Lines ${startLine + 1}-${endLine + 1}\n${fence(language, body)}`,
  };
}

export function buildAskAboutCodePrompt(question: string): EditorUtilityPrompt {
  const trimmed = question.trim();
  if (trimmed === '') return { ok: false, message: 'Ask a question first.' };

  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) return { ok: true, prompt: trimmed };

  const { document } = editor;
  const language = document.languageId;
  const path = vscode.workspace.asRelativePath(document.uri);
  const visible = editor.visibleRanges[0];
  const range = editor.selection.isEmpty ? visible : editor.selection;
  if (range === undefined) return { ok: true, prompt: `${trimmed}\n\nFile in view: ${path}` };

  const label = editor.selection.isEmpty ? 'Visible code' : 'Selected code';
  return {
    ok: true,
    prompt:
      `${trimmed}\n\n### Context\n${path} (${language}), ` +
      `${label} lines ${range.start.line + 1}-${range.end.line + 1}:\n` +
      fence(language, document.getText(range)),
  };
}

export function buildExplainTerminalPrompt(output: string): EditorUtilityPrompt {
  if (output.trim() === '') return { ok: false, message: 'No terminal output to explain.' };
  return {
    ok: true,
    prompt:
      'Explain this terminal output. If it failed, say what went wrong and how to fix it.\n\n' +
      fence('', output),
  };
}

function severityLabel(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'Error';
    case vscode.DiagnosticSeverity.Warning:
      return 'Warning';
    case vscode.DiagnosticSeverity.Information:
      return 'Info';
    case vscode.DiagnosticSeverity.Hint:
      return 'Hint';
    default:
      return 'Diagnostic';
  }
}
