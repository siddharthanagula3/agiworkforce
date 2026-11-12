import { PRODUCT_BRAND, PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';
import {
  MAX_CONTEXT_LINES,
  MAX_LINE_CHARS,
  MAX_PREFIX_CHARS,
  MAX_SUFFIX_LINES,
} from './inlineCompletionProvider';

export const INLINE_COMPLETIONS_NOTICE_KEY = 'inlineCompletions.firstRunNoticeShown';

export function inlineCompletionsDisclosed(globalState: vscode.Memento): boolean {
  return globalState.get<boolean>(INLINE_COMPLETIONS_NOTICE_KEY) === true;
}

export async function discloseInlineCompletions(globalState: vscode.Memento): Promise<void> {
  if (inlineCompletionsDisclosed(globalState)) return;
  const lines = MAX_CONTEXT_LINES + MAX_SUFFIX_LINES;
  await vscode.window.showInformationMessage(
    `${PRODUCT_NAMES.code} inline completions start once you close this notice. When you pause ` +
      `typing in a workspace file, up to ${lines} lines of surrounding code are sent to the ` +
      `${PRODUCT_BRAND} API for a suggestion (${MAX_CONTEXT_LINES} before the cursor and ` +
      `${MAX_SUFFIX_LINES} after, about ${MAX_PREFIX_CHARS.toLocaleString('en-US')} characters at ` +
      `most). Files in the sensitive-file denylist (.env, .pem, .ssh/, credentials, ` +
      'secrets.json, etc.), files withheld by your git ignore rules or the files.exclude and ' +
      `search.exclude settings, and lines over ${MAX_LINE_CHARS.toLocaleString('en-US')} ` +
      `characters are not sent. Manage in Settings → ${PRODUCT_NAMES.code}.`,
    'Got it',
  );
  await globalState.update(INLINE_COMPLETIONS_NOTICE_KEY, true);
}
