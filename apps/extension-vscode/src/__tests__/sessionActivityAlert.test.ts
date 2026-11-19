import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { alertSessionActivity } from '../features/sidebar-webview/sessionActivityAlert';
import type { ExtToWebviewMessage } from '../features/sidebar-webview/ChatStateManager';

function approval(question?: { text: string; options: string[] }): ExtToWebviewMessage {
  return {
    type: 'approvalRequested',
    payload: {
      requestId: 'req-1',
      toolLabel: 'Ask',
      summary: 'Which branch?',
      detail: '',
      sessionApproved: false,
      ...(question === undefined ? {} : { question }),
    },
  };
}

function host() {
  return { reveal: vi.fn(), respond: vi.fn() };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('background session notifications', () => {
  beforeEach(() => {
    (vscode.window.state as { focused: boolean }).focused = false;
    vi.mocked(vscode.window.showWarningMessage).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    (vscode.window.state as { focused: boolean }).focused = true;
  });

  it('offers Allow once and Deny for a permission request', async () => {
    const sessionHost = host();
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Allow once' as never);

    alertSessionActivity(approval(), sessionHost);
    await flush();

    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.slice(1)).toEqual([
      'Allow once',
      'Deny',
      'Open chat',
    ]);
    expect(sessionHost.respond).toHaveBeenCalledWith('req-1', 'once');
  });

  it('never offers a note-less approval for a question, only the chat that can answer it', async () => {
    const sessionHost = host();
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Open chat' as never);

    alertSessionActivity(
      approval({ text: 'Which branch?', options: ['main', 'dev'] }),
      sessionHost,
    );
    await flush();

    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.slice(1)).toEqual([
      'Open chat',
    ]);
    expect(sessionHost.respond).not.toHaveBeenCalled();
    expect(sessionHost.reveal).toHaveBeenCalledOnce();
  });

  it('stays silent while the editor is focused', () => {
    (vscode.window.state as { focused: boolean }).focused = true;

    alertSessionActivity(approval(), host());

    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });
});
