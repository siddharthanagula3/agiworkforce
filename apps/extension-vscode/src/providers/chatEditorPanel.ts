import * as vscode from 'vscode';
import { Config } from '../platform/config';
import { normalizeConfiguredModelId } from '../features/model-picker/modelConstants';
import {
  ChatStateManager,
  type ExtToWebviewMessage,
} from '../features/sidebar-webview/ChatStateManager';
import { getNonce, getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { parseBoundWebviewMessage } from '../protocol/webviewMessages';
import { type ConversationTreeProvider } from '../features/trees';
import { type LocalRuntimePool } from '../integrations/localRuntimePool';
import { resolveTierSync } from '../integrations/tierResolver';
import { type DiffDecorationProvider } from './diffDecorationProvider';

function panelNumberFromTitle(title: string): number {
  const match = /^AGI Chat(?: (\d+))?$/u.exec(title.trim());
  if (match === null) return 0;
  return match[1] === undefined ? 1 : Number(match[1]);
}

export class ChatEditorPanel {
  public static readonly viewType = 'agi-workforce.chatPanel';
  private static readonly instances = new Set<ChatEditorPanel>();
  private static mostRecent: ChatEditorPanel | undefined;
  private static nextPanelNumber = 1;
  private static nextOriginNumber = 1;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly stateManager: ChatStateManager;
  private readonly origin = `chatPanel-${ChatEditorPanel.nextOriginNumber++}`;

  static __resetForTests(): void {
    ChatEditorPanel.instances.clear();
    ChatEditorPanel.mostRecent = undefined;
    ChatEditorPanel.nextPanelNumber = 1;
    ChatEditorPanel.nextOriginNumber = 1;
  }

  static createNew(
    extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    context: vscode.ExtensionContext,
    localRuntimes: LocalRuntimePool,
    conversationTreeProvider: ConversationTreeProvider,
    diffDecorationProvider: DiffDecorationProvider,
  ): ChatEditorPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    const panelNumber = ChatEditorPanel.nextPanelNumber++;
    const title = panelNumber === 1 ? 'AGI Chat' : `AGI Chat ${panelNumber}`;
    const panel = vscode.window.createWebviewPanel(ChatEditorPanel.viewType, title, column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri],
    });
    const instance = new ChatEditorPanel(
      panel,
      extensionUri,
      secrets,
      context,
      localRuntimes,
      conversationTreeProvider,
      diffDecorationProvider,
    );
    ChatEditorPanel.instances.add(instance);
    ChatEditorPanel.mostRecent = instance;
    return instance;
  }

  static registerSerializer(
    extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    context: vscode.ExtensionContext,
    localRuntimes: LocalRuntimePool,
    conversationTreeProvider: ConversationTreeProvider,
    diffDecorationProvider: DiffDecorationProvider,
    onRestored?: () => void,
  ): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(ChatEditorPanel.viewType, {
      deserializeWebviewPanel: (panel: vscode.WebviewPanel): Promise<void> => {
        onRestored?.();
        const restored = new ChatEditorPanel(
          panel,
          extensionUri,
          secrets,
          context,
          localRuntimes,
          conversationTreeProvider,
          diffDecorationProvider,
        );
        ChatEditorPanel.instances.add(restored);
        ChatEditorPanel.mostRecent = restored;
        ChatEditorPanel.nextPanelNumber = Math.max(
          ChatEditorPanel.nextPanelNumber,
          panelNumberFromTitle(panel.title) + 1,
        );
        return Promise.resolve();
      },
    });
  }

  static revealMostRecentOrCreate(
    extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    context: vscode.ExtensionContext,
    localRuntimes: LocalRuntimePool,
    conversationTreeProvider: ConversationTreeProvider,
    diffDecorationProvider: DiffDecorationProvider,
  ): ChatEditorPanel {
    if (ChatEditorPanel.mostRecent !== undefined) {
      const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
      ChatEditorPanel.mostRecent.panel.reveal(column);
      return ChatEditorPanel.mostRecent;
    }
    return ChatEditorPanel.createNew(
      extensionUri,
      secrets,
      context,
      localRuntimes,
      conversationTreeProvider,
      diffDecorationProvider,
    );
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    context: vscode.ExtensionContext,
    localRuntimes: LocalRuntimePool,
    conversationTreeProvider: ConversationTreeProvider,
    diffDecorationProvider: DiffDecorationProvider,
  ) {
    this.stateManager = new ChatStateManager(
      secrets,
      context,
      (message: ExtToWebviewMessage) => void this.panel.webview.postMessage(message),
      conversationTreeProvider,
      context.workspaceState,
      localRuntimes,
      diffDecorationProvider,
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
      resolveTierSync(context),
      false,
      Config.composerFollowUpBehavior(),
      { origin: this.origin, epoch: this.stateManager.conversationEpoch() },
    );
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (message) => {
        const parsed = parseBoundWebviewMessage(message, {
          origin: this.origin,
          epoch: this.stateManager.conversationEpoch(),
        });
        if (parsed === undefined) {
          console.warn(
            '[AGI Workforce] dropping an editor-chat webview message that is malformed or belongs to a replaced conversation',
            message,
          );
          return;
        }
        await this.stateManager.handleMessage(
          parsed as unknown as Parameters<ChatStateManager['handleMessage']>[0],
        );
      }),
      this.panel.onDidChangeViewState((event) => {
        if (event.webviewPanel.active) ChatEditorPanel.mostRecent = this;
      }),
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private dispose(): void {
    ChatEditorPanel.instances.delete(this);
    if (ChatEditorPanel.instances.size === 0) {
      ChatEditorPanel.mostRecent = undefined;
      ChatEditorPanel.nextPanelNumber = 1;
    } else if (ChatEditorPanel.mostRecent === this) {
      ChatEditorPanel.mostRecent = Array.from(ChatEditorPanel.instances).at(-1);
    }
    this.stateManager.cancelInFlight();
    this.stateManager.dispose();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }

  static pushFollowUpBehavior(): void {
    for (const instance of ChatEditorPanel.instances) {
      instance.stateManager.pushFollowUpBehavior();
    }
  }

  static refreshRuntimeStatus(): void {
    for (const instance of ChatEditorPanel.instances) {
      void instance.stateManager.refreshRuntimeStatus();
    }
  }

  static refreshAccountPresentation(): void {
    for (const instance of ChatEditorPanel.instances) {
      void instance.stateManager.refreshAccountPresentation();
    }
  }
}
