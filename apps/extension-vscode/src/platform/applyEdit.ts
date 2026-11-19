import { PRODUCT_NAMES } from '@agiworkforce/types';
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
  options: {
    autoApply?: boolean;
    expectedDocument: Pick<vscode.TextDocument, 'uri' | 'version'>;
    cancellationToken?: vscode.CancellationToken;
  },
): Promise<'accepted' | 'dismissed' | undefined> {
  const document = editor.document;
  const expectedDocument = options.expectedDocument;
  const cancelled = (): boolean => options.cancellationToken?.isCancellationRequested === true;
  if (cancelled()) return undefined;

  const lang = document.languageId;
  const codeBlock = extractCodeBlock(llmResponse, lang);

  if (codeBlock === undefined || selection.isEmpty) {
    await showLlmResultInNewTab(llmResponse, commandLabel);
    return undefined;
  }

  const apply = async (): Promise<boolean> => {
    if (
      cancelled() ||
      !vscode.workspace.isTrusted ||
      document.isClosed ||
      document.version !== expectedDocument.version ||
      document.uri.toString() !== expectedDocument.uri.toString()
    ) {
      return false;
    }
    try {
      return await editor.edit((edit) => edit.replace(selection, codeBlock));
    } catch {
      return false;
    }
  };

  if (options.autoApply === true) {
    const applied = await apply();
    if (applied) return 'accepted';
    if (cancelled()) return undefined;
    vscode.window.showWarningMessage(t('applyEdit.autoApplyFailed'));
    await showLlmResultInNewTab(llmResponse, commandLabel);
    return undefined;
  }

  const applyInline = t('applyEdit.applyInline');
  const viewInNewTab = t('applyEdit.viewInNewTab');
  const choice = await vscode.window.showInformationMessage(
    t('applyEdit.prompt', { command: commandLabel }),
    { modal: false },
    applyInline,
    viewInNewTab,
  );
  if (cancelled()) return undefined;

  if (choice === applyInline) {
    const applied = await apply();
    if (applied) return 'accepted';
    if (cancelled()) return undefined;
    vscode.window.showWarningMessage(t('applyEdit.applyFailed'));
    await showLlmResultInNewTab(llmResponse, commandLabel);
    return undefined;
  }
  if (choice === viewInNewTab) await showLlmResultInNewTab(llmResponse, commandLabel);
  return 'dismissed';
}

export async function showLlmResultInNewTab(content: string, label: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content: `# ${PRODUCT_NAMES.code}, ${label}\n\n${content}`,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: true,
  });
}
