/**
 * applyEdit.ts — Utilities for applying LLM-generated code edits
 *
 * Replaces the "open new document" pattern with an inline apply flow:
 * 1. Extract code block from LLM response
 * 2. Offer user: Apply Inline | View in New Tab | Cancel
 * 3. Apply inline via WorkspaceEdit, or fall back to new tab
 */

import * as vscode from 'vscode';

/**
 * Extract the first fenced code block matching the given language from text.
 * Falls back to any fenced code block if no language match found.
 */
export function extractCodeBlock(text: string, lang: string): string | undefined {
  // Try language-specific block first
  const langPattern = new RegExp('```(?:' + lang + ')\\s*\\n([\\s\\S]*?)```', 'i');
  const langMatch = langPattern.exec(text);
  if (langMatch?.[1] !== undefined) {
    return langMatch[1].trimEnd();
  }

  // Fall back to any fenced code block
  const anyPattern = /```(?:\w*)\s*\n([\s\S]*?)```/;
  const anyMatch = anyPattern.exec(text);
  if (anyMatch?.[1] !== undefined) {
    return anyMatch[1].trimEnd();
  }

  return undefined;
}

/**
 * Present the LLM response to the user with options to apply inline or view in new tab.
 * If no code block is found, falls back to opening a new tab directly.
 */
export async function applyLlmEdit(
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  llmResponse: string,
  commandLabel: string,
  options?: {
    autoApply?: boolean;
  },
): Promise<void> {
  const lang = editor.document.languageId;
  const codeBlock = extractCodeBlock(llmResponse, lang);

  if (codeBlock === undefined || selection.isEmpty) {
    // No applicable code block — open new tab
    await openInNewTab(llmResponse, commandLabel);
    return;
  }

  if (options?.autoApply === true) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, selection, codeBlock);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      vscode.window.showWarningMessage(
        'AGI Workforce: Could not auto-apply edit — document may have changed.',
      );
      await openInNewTab(llmResponse, commandLabel);
      return;
    }
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `AGI Workforce: Apply ${commandLabel} result?`,
    { modal: false },
    'Apply Inline',
    'View in New Tab',
  );

  if (choice === 'Apply Inline') {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, selection, codeBlock);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      vscode.window.showWarningMessage(
        'AGI Workforce: Could not apply edit — document may have changed.',
      );
      await openInNewTab(llmResponse, commandLabel);
    }
  } else if (choice === 'View in New Tab') {
    await openInNewTab(llmResponse, commandLabel);
  }
  // 'Cancel' or dismissed — do nothing
}

async function openInNewTab(content: string, label: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content: `# AGI Workforce — ${label}\n\n${content}`,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: true,
  });
}
