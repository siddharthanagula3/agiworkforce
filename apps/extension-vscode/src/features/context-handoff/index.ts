import * as vscode from 'vscode';
import {
  parseLocalContextHandoffQuery,
  VSCODE_CONTEXT_HANDOFF_PATH,
  type LocalContextHandoff,
} from '@agiworkforce/types';

export interface ContextHandoffTarget {
  prefillComposer: (text: string) => void;
  reveal: () => Promise<void>;
}

export function buildContextHandoffDraft(handoff: LocalContextHandoff): string {
  return `Selected in the browser, from ${handoff.sourceUrl}\n\n${handoff.selectedText}\n\n`;
}

export function readContextHandoffUri(uri: vscode.Uri): LocalContextHandoff | null {
  if (uri.path !== VSCODE_CONTEXT_HANDOFF_PATH) return null;
  return parseLocalContextHandoffQuery(uri.query);
}

export async function handleContextHandoffUri(
  uri: vscode.Uri,
  target: ContextHandoffTarget | undefined,
): Promise<boolean> {
  if (uri.path !== VSCODE_CONTEXT_HANDOFF_PATH) {
    void vscode.window.showWarningMessage(
      `AGI Workforce: this link asks for "${uri.path}", which this extension does not handle.`,
    );
    return false;
  }
  const handoff = parseLocalContextHandoffQuery(uri.query);
  if (handoff === null) {
    void vscode.window.showWarningMessage(
      'AGI Workforce: that browser handoff link is expired or malformed. Select the text again in Chrome.',
    );
    return false;
  }
  if (target === undefined) {
    void vscode.window.showWarningMessage(
      'AGI Workforce: the chat view is not available, so the browser selection was not placed. Reload the window and send it again.',
    );
    return false;
  }
  target.prefillComposer(buildContextHandoffDraft(handoff));
  await target.reveal();
  return true;
}

export function registerContextHandoffUriHandler(
  resolveTarget: () => ContextHandoffTarget | undefined,
): vscode.Disposable {
  return vscode.window.registerUriHandler({
    handleUri: (uri) => {
      void handleContextHandoffUri(uri, resolveTarget());
    },
  });
}
