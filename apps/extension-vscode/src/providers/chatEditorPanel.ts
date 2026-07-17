/** Main-editor host for the same local developer-session controller as the sidebar. */

import * as vscode from 'vscode';
import { Config } from '../platform/config';
import { normalizeConfiguredModelId } from '../features/model-picker/modelConstants';
import { ChatStateManager, type ExtToWebviewMessage } from '../features/sidebar-webview/ChatStateManager';
import { getNonce, getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { parseWebviewMessage } from '../protocol/webviewMessages';
import { type ConversationTreeProvider } from '../features/trees';
import { type LocalRuntimePool } from '../integrations/localRuntimePool';

export class ChatEditorPanel {
  public static readonly viewType = 'agi-workforce.chatPanel';
  private static instance: ChatEditorPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly stateManager: ChatStateManager;

  static __resetForTests(): void {
    ChatEditorPanel.instance = undefined;
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    context: vscode.ExtensionContext,
    localRuntimes: LocalRuntimePool,
    conversationTreeProvider: ConversationTreeProvider,
  ): ChatEditorPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (ChatEditorPanel.instance !== undefined) {
      ChatEditorPanel.instance.panel.reveal(column);
      return ChatEditorPanel.instance;
    }
    const panel = vscode.window.createWebviewPanel(ChatEditorPanel.viewType, 'AGI Chat', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri],
    });
    ChatEditorPanel.instance = new ChatEditorPanel(
      panel,
      extensionUri,
      secrets,
      context,
      localRuntimes,
      conversationTreeProvider,
    );
    return ChatEditorPanel.instance;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    context: vscode.ExtensionContext,
    localRuntimes: LocalRuntimePool,
    conversationTreeProvider: ConversationTreeProvider,
  ) {
    this.stateManager = new ChatStateManager(
      secrets,
      context,
      (message: ExtToWebviewMessage) => void this.panel.webview.postMessage(message),
      conversationTreeProvider,
      context.workspaceState,
      localRuntimes,
    );
    const model = normalizeConfiguredModelId(Config.model());
    this.panel.webview.options = { enableScripts: true, localResourceRoots: [extensionUri] };
    this.panel.webview.html = getWebviewContent(
      this.panel.webview,
      extensionUri,
      getNonce(),
      Config.agentMode(),
      Config.agentEffort(),
      this.stateManager.modelSupportsEffort(model),
      this.stateManager.meterCollapsed,
    );
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (message) => {
        const parsed = parseWebviewMessage(message);
        if (parsed === undefined) {
          console.warn('[AGI Workforce] dropping malformed editor-chat webview message', message);
          return;
        }
        await this.stateManager.handleMessage(
          parsed as unknown as Parameters<ChatStateManager['handleMessage']>[0],
        );
      }),
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private dispose(): void {
    ChatEditorPanel.instance = undefined;
    this.stateManager.cancelInFlight();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }
}
