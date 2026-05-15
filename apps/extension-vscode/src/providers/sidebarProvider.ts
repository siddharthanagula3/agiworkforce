/**
 * sidebarProvider.ts — WebviewViewProvider for the AGI Workforce sidebar panel.
 *
 * Thin orchestrator: wires webview lifecycle (resolveWebviewView) to ChatStateManager.
 * HTML generation lives in sidebar/webviewContent.ts.
 * Message routing and streaming state live in sidebar/ChatStateManager.ts.
 */

import * as vscode from 'vscode';
import { type ConversationStore } from '../storage/conversationStore';
import { type ConversationTreeProvider } from './conversationTreeProvider';
import { normalizeConfiguredModelId } from '../services/modelConstants';
import { Config } from '../utils/config';
import { ChatStateManager } from './sidebar/ChatStateManager';
import { getWebviewContent, getNonce } from './sidebar/webviewContent';

// Re-export for chatEditorPanel.ts (imported from ./sidebarProvider)
export { getWebviewContent, getNonce, escapeHtml } from './sidebar/webviewContent';
export type {
  WebviewToExtMessage,
  ExtToWebviewMessage,
  UsageMeterWebviewPayload,
} from './sidebar/ChatStateManager';

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'agi-workforce.sidebar';

  private _view?: vscode.WebviewView;
  private _messageListener?: vscode.Disposable;
  private readonly _stateManager: ChatStateManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    context: vscode.ExtensionContext,
    conversationStore?: ConversationStore,
    conversationTreeProvider?: ConversationTreeProvider,
    workspaceState?: vscode.Memento,
  ) {
    this._stateManager = new ChatStateManager(
      secrets,
      context,
      (msg) => this._view?.webview.postMessage(msg),
      conversationStore,
      conversationTreeProvider,
      workspaceState,
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    const nonce = getNonce();
    const initialMode = this._stateManager.mode ?? Config.agentMode();
    const initialEffort = this._stateManager.effort ?? Config.agentEffort();
    const initialModel = normalizeConfiguredModelId(
      vscode.workspace.getConfiguration('agiWorkforce').get<string>('model'),
    );
    const supportsEffort = this._stateManager.modelSupportsEffort(initialModel);
    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      this._extensionUri,
      nonce,
      initialMode,
      initialEffort,
      supportsEffort,
      this._stateManager.meterCollapsed,
    );

    this._messageListener?.dispose();
    this._messageListener = webviewView.webview.onDidReceiveMessage(async (msg) => {
      await this._stateManager.handleMessage(msg);
    });

    webviewView.onDidDispose(() => {
      this._messageListener?.dispose();
      delete this._messageListener;
      this._stateManager.cancelInFlight();
      delete this._view;
    });
  }

  /** Programmatically reveal the sidebar panel. */
  public reveal(): void {
    this._view?.show?.(true);
  }

  /** Public entry-point so extension.ts can push a fresh usage meter on config change. */
  public pushUsageMeter(): void {
    void this._stateManager.pushUsageMeter();
  }

  /** Clear conversation history and notify the webview. */
  public resetConversation(): void {
    this._stateManager.resetConversation();
  }
}
