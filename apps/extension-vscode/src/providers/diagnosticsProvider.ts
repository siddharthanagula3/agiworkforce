/**
 * diagnosticsProvider.ts -- AI-powered diagnostics from code review
 *
 * When the user runs "Code Review", the AI analyzes the selection
 * and creates VS Code diagnostic entries (warnings/info) for issues it finds.
 */

import * as vscode from 'vscode';
import { chatCompletion, type ChatMessage } from '../utils/api';

const DIAGNOSTIC_SOURCE = 'AGI Workforce';

export class AgiDiagnosticsProvider implements vscode.Disposable {
  private readonly _diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this._diagnosticCollection = vscode.languages.createDiagnosticCollection('agiWorkforce');
  }

  get collection(): vscode.DiagnosticCollection {
    return this._diagnosticCollection;
  }

  /**
   * Run an AI code review on the given editor selection and produce diagnostics.
   */
  async reviewCode(
    editor: vscode.TextEditor,
    secrets: vscode.SecretStorage,
    cancellationToken: vscode.CancellationToken,
  ): Promise<ReviewResult> {
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection.isEmpty ? undefined : selection);

    if (selectedText.trim() === '') {
      return { diagnosticCount: 0, summary: 'No code to review.' };
    }

    const lang = editor.document.languageId;
    const startLine = selection.isEmpty ? 0 : selection.start.line;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a senior code reviewer. Analyze the given code and report issues.\n' +
          'For each issue, output EXACTLY this format on its own line:\n' +
          'ISSUE|<line_offset>|<severity>|<message>\n\n' +
          'Where:\n' +
          '- line_offset is the 0-based line number relative to the start of the code snippet\n' +
          '- severity is one of: error, warning, info, hint\n' +
          '- message is a concise description of the issue\n\n' +
          'After all ISSUE lines, write a brief summary paragraph.\n' +
          'If the code looks good, output no ISSUE lines and just the summary.',
      },
      {
        role: 'user',
        content:
          `Review this ${lang} code for bugs, security issues, performance problems, and style issues:\n\n` +
          `\`\`\`${lang}\n${selectedText}\n\`\`\``,
      },
    ];

    const response = await chatCompletion(secrets, messages, cancellationToken);

    const { diagnostics, summary } = parseReviewResponse(response, editor.document.uri, startLine);

    // Clear old diagnostics for this document, then set new ones
    this._diagnosticCollection.delete(editor.document.uri);
    if (diagnostics.length > 0) {
      this._diagnosticCollection.set(editor.document.uri, diagnostics);
    }

    return { diagnosticCount: diagnostics.length, summary };
  }

  /**
   * Clear diagnostics for a specific document or all documents.
   */
  clear(uri?: vscode.Uri): void {
    if (uri !== undefined) {
      this._diagnosticCollection.delete(uri);
    } else {
      this._diagnosticCollection.clear();
    }
  }

  dispose(): void {
    this._diagnosticCollection.dispose();
  }
}

export interface ReviewResult {
  diagnosticCount: number;
  summary: string;
}

interface ParsedIssue {
  lineOffset: number;
  severity: vscode.DiagnosticSeverity;
  message: string;
}

function parseReviewResponse(
  response: string,
  uri: vscode.Uri,
  baseLineOffset: number,
): { diagnostics: vscode.Diagnostic[]; summary: string } {
  const lines = response.split('\n');
  const issues: ParsedIssue[] = [];
  const summaryLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('ISSUE|')) {
      const parts = trimmed.split('|');
      if (parts.length >= 4) {
        const lineOffset = parseInt(parts[1] ?? '0', 10);
        const severityStr = (parts[2] ?? 'warning').toLowerCase();
        const message = parts.slice(3).join('|').trim();

        if (!isNaN(lineOffset) && message !== '') {
          issues.push({
            lineOffset: isNaN(lineOffset) ? 0 : lineOffset,
            severity: parseSeverity(severityStr),
            message,
          });
        }
      }
    } else if (trimmed !== '') {
      summaryLines.push(trimmed);
    }
  }

  const diagnostics: vscode.Diagnostic[] = issues.map((issue) => {
    const line = Math.max(0, baseLineOffset + issue.lineOffset);
    const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
    const diagnostic = new vscode.Diagnostic(range, issue.message, issue.severity);
    diagnostic.source = DIAGNOSTIC_SOURCE;
    return diagnostic;
  });

  return {
    diagnostics,
    summary: summaryLines.join('\n'),
  };
}

function parseSeverity(s: string): vscode.DiagnosticSeverity {
  switch (s) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'hint':
      return vscode.DiagnosticSeverity.Hint;
    case 'info':
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}
