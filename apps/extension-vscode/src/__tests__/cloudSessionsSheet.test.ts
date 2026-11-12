import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  ChatStateManager,
  type ExtToWebviewMessage,
} from '../features/sidebar-webview/ChatStateManager';
import type { ConversationTreeProvider } from '../features/trees/conversationTreeProvider';

type ProjectsClientModule = typeof import('../features/projects/projectsClient');
type CloudTasksModule = typeof import('../features/cloud-tasks');
type ContextHandoffModule = typeof import('../features/context-handoff');

const { listConversations, listCodeSessions } = vi.hoisted(() => ({
  listConversations: vi.fn(),
  listCodeSessions: vi.fn(),
}));

vi.mock('../features/projects/projectsClient', async (importOriginal) => ({
  ...(await importOriginal<ProjectsClientModule>()),
  resolveProjectsWorkspace: vi.fn(async () => ({
    status: 'ready',
    workspace: { chat: { listConversations } },
  })),
}));

vi.mock('../features/cloud-tasks', async (importOriginal) => ({
  ...(await importOriginal<CloudTasksModule>()),
  resolveCloudCodeApi: vi.fn(async () => ({ status: 'ready', api: { list: listCodeSessions } })),
}));

vi.mock('../features/context-handoff', async (importOriginal) => ({
  ...(await importOriginal<ContextHandoffModule>()),
  workspaceGitHubRepositories: vi.fn(async () => []),
}));

function makeManager(provider?: Partial<ConversationTreeProvider>) {
  const context = new vscode.ExtensionContext();
  const posted: ExtToWebviewMessage[] = [];
  const manager = new ChatStateManager(
    context.secrets,
    context,
    (message) => posted.push(message),
    provider as ConversationTreeProvider | undefined,
    context.workspaceState,
  );
  return { manager, posted };
}

describe('the Cloud tab of the Sessions sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
  });

  afterEach(() => {
    vscode.workspace.isTrusted = true;
  });

  it('keeps the cloud chats that loaded when the AGI Code listing fails, and says which failed', async () => {
    listConversations.mockResolvedValue({
      conversations: [{ id: 'chat-1', title: 'Pricing', updatedAt: '2026-11-11T00:00:00Z' }],
    });
    listCodeSessions.mockRejectedValue(new Error('plan does not include AGI Code sessions'));
    const { manager, posted } = makeManager();

    await manager.handleMessage({ type: 'requestSessions', payload: { source: 'cloud' } });

    const list = posted.find((message) => message.type === 'sessionsList');
    expect(list).toEqual({
      type: 'sessionsList',
      payload: expect.objectContaining({
        source: 'cloud',
        rows: [expect.objectContaining({ id: 'chat-1' })],
        unavailable: expect.stringContaining('plan does not include AGI Code sessions'),
      }),
    });
  });

  it('names workspace trust, not the CLI, when a cloud chat cannot open in Restricted Mode', async () => {
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    vscode.workspace.isTrusted = false;
    const { manager } = makeManager({ adoptAccountConversation: vi.fn() });

    await manager.handleMessage({
      type: 'openSessionRow',
      payload: { id: 'chat-1', source: 'cloud' },
    });

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('trust this workspace'),
    );
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('this AGI CLI cannot'),
    );
  });
});
