import * as vscode from 'vscode';
import { t } from '../l10n';

export function extractCodeBlock(text: string, lang: string): string | undefined {
  const escapedLang = lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const langPattern = new RegExp('```(?:' + escapedLang + ')\\s*\\n([\\s\\S]*?)```', 'i');
  const langMatch = langPattern.exec(text);
  if (langMatch?.[1] !== undefined) {
    return langMatch[1].trimEnd();
  }

  const anyPattern = /```(?:\w*)\s*\n([\s\S]*?)```/;
  const anyMatch = anyPattern.exec(text);
  if (anyMatch?.[1] !== undefined) {
    return anyMatch[1].trimEnd();
  }

  return undefined;
}

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
    await openInNewTab(llmResponse, commandLabel);
    return;
  }

  if (options?.autoApply === true) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, selection, codeBlock);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      vscode.window.showWarningMessage(t('applyEdit.autoApplyFailed'));
      await openInNewTab(llmResponse, commandLabel);
      return;
    }
    return;
  }

  const applyInline = t('applyEdit.applyInline');
  const viewInNewTab = t('applyEdit.viewInNewTab');
  const choice = await vscode.window.showInformationMessage(
    t('applyEdit.prompt', { command: commandLabel }),
    { modal: false },
    applyInline,
    viewInNewTab,
  );

  if (choice === applyInline) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, selection, codeBlock);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      vscode.window.showWarningMessage(t('applyEdit.applyFailed'));
      await openInNewTab(llmResponse, commandLabel);
    }
  } else if (choice === viewInNewTab) {
    await openInNewTab(llmResponse, commandLabel);
  }
}

async function openInNewTab(content: string, label: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content: `# AGI Workforce, ${label}\n\n${content}`,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: true,
  });
}
