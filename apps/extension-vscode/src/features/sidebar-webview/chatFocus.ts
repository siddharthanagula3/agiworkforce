import * as vscode from 'vscode';

export interface FocusableChat {
  resetConversation(): void;
}

let focused: FocusableChat | undefined;

export function setChatFocus(chat: FocusableChat, hasFocus: boolean): void {
  if (hasFocus) focused = chat;
  else if (focused === chat) focused = undefined;
  void vscode.commands.executeCommand(
    'setContext',
    'agi-workforce.chatFocused',
    focused !== undefined,
  );
}

export function focusedChat(): FocusableChat | undefined {
  return focused;
}
