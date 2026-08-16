
import * as vscode from 'vscode';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import { applyLlmEdit } from '../platform/applyEdit';
import { logEvent, logError, TelemetryEvents } from '../core/telemetry';
import { showCloudUtilityErrorActions } from '../core/cloudUtilityErrorActions';

const CONTEXT_RADIUS = 15;

export function activateErrorExplainer(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('agi-workforce.explainError', () =>
      explainErrorCommand(context),
    ),
    vscode.commands.registerCommand('agi-workforce.askAboutCode', () =>
      askAboutCodeCommand(context),
    ),
  );
}

async function explainErrorCommand(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    vscode.window.showWarningMessage('AGI Workforce: No active editor. Open a file first.');
    return;
  }

  const document = editor.document;
  const selection = editor.selection;

  const allDiagnostics = vscode.languages.getDiagnostics(document.uri);
  const relevantDiagnostics = allDiagnostics.filter((d) => {
    if (selection.isEmpty) {
      return (
        d.range.start.line <= selection.active.line && d.range.end.line >= selection.active.line
      );
    }
    return d.range.start.line <= selection.end.line && d.range.end.line >= selection.start.line;
  });

  if (relevantDiagnostics.length === 0) {
    vscode.window.showInformationMessage('AGI Workforce: No errors on this line.');
    return;
  }

  const errorSummary = relevantDiagnostics
    .map((d, i) => {
      const severity = diagnosticSeverityLabel(d.severity);
      const source = d.source !== undefined ? ` [${d.source}]` : '';
      const code =
        d.code !== undefined ? ` (${typeof d.code === 'object' ? d.code.value : d.code})` : '';
      return `${i + 1}. ${severity}${source}${code}: ${d.message}`;
    })
    .join('\n');

  const anchorLine = selection.isEmpty ? selection.active.line : selection.start.line;
  const surroundingCode = extractSurroundingCode(document, anchorLine, CONTEXT_RADIUS);
  const lang = document.languageId;
  const filePath = vscode.workspace.asRelativePath(document.uri);

  const messages: LlmChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a coding assistant. Explain this error and suggest a fix. ' +
        'Show the corrected code in a fenced code block.',
    },
    {
      role: 'user',
      content:
        `File: ${filePath} (${lang})\n\n` +
        `### Error(s)\n${errorSummary}\n\n` +
        `### Surrounding code (lines ${surroundingCode.startLine + 1}–${surroundingCode.endLine + 1})\n` +
        `\`\`\`${lang}\n${surroundingCode.text}\n\`\`\`\n\n` +
        'Explain why this error occurs and provide the corrected code.',
    },
  ];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'AGI Workforce: Explaining Error…',
      cancellable: true,
    },
    async (progress, progressToken) => {
      const cancelSource = new vscode.CancellationTokenSource();
      progressToken.onCancellationRequested(() => cancelSource.cancel());

      try {
        progress.report({ increment: 0 });
        logEvent(TelemetryEvents.INLINE_COMMAND_EXECUTED, {
          command: 'explainError',
          language: lang,
          diagnosticCount: String(relevantDiagnostics.length),
        });

        const result = await chatCompletion(context.secrets, messages, cancelSource.token);
        cancelSource.dispose();

        progress.report({ increment: 100 });

        const contextSelection = new vscode.Selection(
          surroundingCode.startLine,
          0,
          surroundingCode.endLine,
          document.lineAt(surroundingCode.endLine).text.length,
        );

        await applyLlmEdit(editor, contextSelection, result, 'Explain Error');
      } catch (err) {
        cancelSource.dispose();
        if (err instanceof Error && err.message.includes('CANCELLED')) return;

        logError(err instanceof Error ? err : String(err), { command: 'explainError' });
        await showCloudUtilityErrorActions(err, {
          title: 'AGI Workforce: Explain Error failed',
          retry: () => explainErrorCommand(context),
        });
      }
    },
  );
}

async function askAboutCodeCommand(context: vscode.ExtensionContext): Promise<void> {
  const question = await vscode.window.showInputBox({
    title: 'AGI Workforce — Ask About Code',
    prompt: 'Ask anything about your code…',
    placeHolder: 'e.g. "Why does this function return undefined?"',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (value.trim() === '') return 'Please enter a question.';
      return undefined;
    },
  });

  if (question === undefined || question.trim() === '') {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const codeContext = buildEditorContext(editor);

  const messages: LlmChatMessage[] = [
    {
      role: 'system',
      content:
        'You are AGI Workforce, a model-agnostic AI coding assistant integrated into VS Code. ' +
        "Answer the user's question using the provided workspace context. " +
        'Be concise, accurate, and produce well-formatted Markdown.',
    },
    {
      role: 'user',
      content: codeContext + `### Question\n${question.trim()}\n`,
    },
  ];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'AGI Workforce: Thinking…',
      cancellable: true,
    },
    async (progress, progressToken) => {
      const cancelSource = new vscode.CancellationTokenSource();
      progressToken.onCancellationRequested(() => cancelSource.cancel());

      try {
        progress.report({ increment: 0 });
        logEvent(TelemetryEvents.INLINE_COMMAND_EXECUTED, {
          command: 'askAboutCode',
          language: editor?.document.languageId ?? 'none',
        });

        const result = await chatCompletion(context.secrets, messages, cancelSource.token);
        cancelSource.dispose();

        progress.report({ increment: 100 });

        const doc = await vscode.workspace.openTextDocument({
          content: `# AGI Workforce — Answer\n\n**Q:** ${question.trim()}\n\n---\n\n${result}`,
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.Beside,
          preview: true,
        });
      } catch (err) {
        cancelSource.dispose();
        if (err instanceof Error && err.message.includes('CANCELLED')) return;

        logError(err instanceof Error ? err : String(err), { command: 'askAboutCode' });
        await showCloudUtilityErrorActions(err, {
          title: 'AGI Workforce: Ask About Code failed',
          retry: () => askAboutCodeCommand(context),
        });
      }
    },
  );
}

interface SurroundingCode {
  text: string;
  startLine: number;
  endLine: number;
}

function extractSurroundingCode(
  document: vscode.TextDocument,
  anchorLine: number,
  radius: number,
): SurroundingCode {
  const startLine = Math.max(0, anchorLine - radius);
  const endLine = Math.min(document.lineCount - 1, anchorLine + radius);
  const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
  return {
    text: document.getText(range),
    startLine,
    endLine,
  };
}

function buildEditorContext(editor: vscode.TextEditor | undefined): string {
  if (editor === undefined) {
    return '(No file is currently open.)\n\n';
  }

  const document = editor.document;
  const lang = document.languageId;
  const filePath = vscode.workspace.asRelativePath(document.uri);
  const selection = editor.selection;

  let codeSnippet: string;
  let contextLabel: string;

  if (!selection.isEmpty) {
    codeSnippet = document.getText(selection);
    contextLabel = `Selected code (lines ${selection.start.line + 1}–${selection.end.line + 1})`;
  } else {
    const visibleRanges = editor.visibleRanges;
    if (visibleRanges.length > 0) {
      const visible = visibleRanges[0]!;
      codeSnippet = document.getText(visible);
      contextLabel = `Visible code (lines ${visible.start.line + 1}–${visible.end.line + 1})`;
    } else {
      const maxLine = Math.min(document.lineCount - 1, 99);
      const range = new vscode.Range(0, 0, maxLine, document.lineAt(maxLine).text.length);
      codeSnippet = document.getText(range);
      contextLabel = `Code (lines 1–${maxLine + 1})`;
    }
  }

  return (
    `### Context\nFile: ${filePath} (${lang})\n` +
    `${contextLabel}:\n\`\`\`${lang}\n${codeSnippet}\n\`\`\`\n\n`
  );
}

function diagnosticSeverityLabel(severity: vscode.DiagnosticSeverity): string {
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
