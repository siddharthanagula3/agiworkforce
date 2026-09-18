import * as vscode from 'vscode';
import { type WorkspaceFileReference } from '../chat-participant/promptReferences';

export const RETRY_LAST_MESSAGE_COMMAND = 'agi-workforce.retryLastMessage';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  references?: readonly WorkspaceFileReference[];
}

export interface ChatRetrySource {
  transcript(): readonly ChatTurn[];
  isStreaming(): boolean;
  resend(text: string, references: readonly WorkspaceFileReference[]): void;
}

export type RetryRefusal = 'no_turn' | 'streaming';

export interface RetryTarget {
  text: string;
  references: readonly WorkspaceFileReference[];
}

export type RetryDecision =
  { ok: true; target: RetryTarget } | { ok: false; refusal: RetryRefusal; message: string };

const REFUSAL_MESSAGES: Readonly<Record<RetryRefusal, string>> = {
  no_turn: 'There is no message to retry yet.',
  streaming: 'Wait for the current answer to finish, or stop it, then retry.',
};

/**
 * Retry resends the last thing the person asked, not the last thing in the
 * transcript: an assistant turn that failed mid-stream is still the tail, and
 * resending it would send the model its own words back.
 */
export function resolveRetryTarget(source: {
  transcript: readonly ChatTurn[];
  streaming: boolean;
}): RetryDecision {
  if (source.streaming) {
    return { ok: false, refusal: 'streaming', message: REFUSAL_MESSAGES.streaming };
  }
  for (let index = source.transcript.length - 1; index >= 0; index--) {
    const turn = source.transcript[index];
    if (turn?.role !== 'user') continue;
    const text = turn.text.trim();
    if (!text) continue;
    return { ok: true, target: { text, references: turn.references ?? [] } };
  }
  return { ok: false, refusal: 'no_turn', message: REFUSAL_MESSAGES.no_turn };
}

export function registerChatRetryCommand(
  context: vscode.ExtensionContext,
  source: ChatRetrySource,
): vscode.Disposable {
  const disposable = vscode.commands.registerCommand(RETRY_LAST_MESSAGE_COMMAND, () => {
    const decision = resolveRetryTarget({
      transcript: source.transcript(),
      streaming: source.isStreaming(),
    });
    if (!decision.ok) {
      void vscode.window.showInformationMessage(decision.message);
      return;
    }
    source.resend(decision.target.text, decision.target.references);
  });
  context.subscriptions.push(disposable);
  return disposable;
}
