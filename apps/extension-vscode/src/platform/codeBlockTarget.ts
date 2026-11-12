import { PRODUCT_NAMES } from '@agiworkforce/types';
import { isContainedIn } from '@agiworkforce/utils/path-containment';
import * as vscode from 'vscode';
import { languageIdForExtension } from '../data/contextBuilder';

const FENCE_ALIASES: Readonly<Record<string, string>> = {
  'c++': 'cpp',
  golang: 'go',
  python3: 'python',
  py3: 'python',
  shell: 'shellscript',
  ps1: 'powershell',
  text: 'plaintext',
  txt: 'plaintext',
};

const ACCEPTS: Readonly<Record<string, readonly string[]>> = {
  typescript: ['javascript'],
  typescriptreact: ['typescript', 'javascript', 'javascriptreact'],
  javascriptreact: ['javascript'],
  jsonc: ['json'],
};

function codeBlockLanguageId(fence: string): string {
  const tag = fence.trim().toLowerCase();
  return FENCE_ALIASES[tag] ?? languageIdForExtension(tag) ?? tag;
}

function fitsLanguage(fence: string, documentLanguageId: string): boolean {
  if (fence.trim() === '') return true;
  const blockLanguage = codeBlockLanguageId(fence);
  return (
    blockLanguage === documentLanguageId ||
    (ACCEPTS[documentLanguageId] ?? []).includes(blockLanguage)
  );
}

export function codeBlockTargetRefusal(
  document: Pick<vscode.TextDocument, 'uri' | 'languageId' | 'isUntitled'>,
  fence: string,
  conversationCwd: string | undefined,
): string | undefined {
  const relativePath = vscode.workspace.asRelativePath(document.uri);
  if (!fitsLanguage(fence, document.languageId)) {
    return `${PRODUCT_NAMES.code}: this ${fence} code does not belong in ${relativePath}, which is ${document.languageId}, so nothing was proposed. Open the file it is for and choose Apply again.`;
  }
  if (
    conversationCwd !== undefined &&
    !document.isUntitled &&
    (document.uri.scheme !== 'file' || !isContainedIn(conversationCwd, document.uri.fsPath))
  ) {
    return `${PRODUCT_NAMES.code}: ${relativePath} is outside ${conversationCwd}, the folder this conversation works in, so nothing was proposed. Open a file in that folder and choose Apply again.`;
  }
  return undefined;
}
