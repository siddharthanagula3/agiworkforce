import * as vscode from 'vscode';
import { type ConversationTreeProvider } from '../trees/conversationTreeProvider';
import { type DiffDecorationProvider } from '../../providers/diffDecorationProvider';
import { normalizeConfiguredModelId } from '../model-picker/modelConstants';
import { Config } from '../../platform/config';
import { ChatStateManager, type ExtToWebviewMessage } from './ChatStateManager';
import { shouldShowOnboarding } from '../onboarding/onboardingState';
import { getWebviewContent, getNonce } from './webviewContent';
import { parseWebviewMessage } from '../../protocol/webviewMessages';
import { type LocalRuntimePool } from '../../integrations/localRuntimePool';
import { resolveTierSync } from '../../integrations/tierResolver';
import { type WorkspaceFileReference } from '../chat-participant/promptReferences';

export { getWebviewContent, getNonce, escapeHtml } from './webviewContent';
export type {
  WebviewToExtMessage,
  ExtToWebviewMessage,
  UsageMeterWebviewPayload,
} from './ChatStateManager';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'agi-workforce.sidebar';

  private _view?: vscode.WebviewView;
  private _messageListener?: vscode.Disposable;
  private _pendingComposerDraft?: Extract<ExtToWebviewMessage, { type: 'composerDraft' }>;
  private readonly _stateManager: ChatStateManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    private readonly _extensionContext: vscode.ExtensionContext,
    conversationTreeProvider?: ConversationTreeProvider,
    workspaceState?: vscode.Memento,
    localRuntimes?: LocalRuntimePool,
    diffDecorationProvider?: DiffDecorationProvider,
  ) {
    this._stateManager = new ChatStateManager(
      secrets,
      this._extensionContext,
      (msg: ExtToWebviewMessage) => this._view?.webview.postMessage(msg),
      conversationTreeProvider,
      workspaceState,
      localRuntimes,
      diffDecorationProvider,
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
    const initialModel = normalizeConfiguredModelId(Config.model());
    const supportsEffort = this._stateManager.modelSupportsEffort(initialModel);
    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      this._extensionUri,
      nonce,
      initialMode,
      initialEffort,
      supportsEffort,
      this._stateManager.meterCollapsed,
      resolveTierSync(this._extensionContext),
      shouldShowOnboarding(this._extensionContext.globalState),
      Config.composerFollowUpBehavior(),
    );

    this._messageListener?.dispose();
    this._messageListener = webviewView.webview.onDidReceiveMessage(async (msg) => {
      const parsed = parseWebviewMessage(msg);
      if (parsed === undefined) {
        console.warn('[AGI Workforce] dropping malformed webview message', msg);
        return;
      }
      await this._stateManager.handleMessage(
        parsed as unknown as Parameters<typeof this._stateManager.handleMessage>[0],
      );
      if (parsed.type === 'ready') await this._deliverComposerDraft();
    });

    webviewView.onDidDispose(() => {
      this._messageListener?.dispose();
      delete this._messageListener;
      this._stateManager.cancelInFlight();
      delete this._view;
    });
  }

  public reveal(): void {
    this._view?.show?.(true);
  }

  public prefillComposer(text: string, references: WorkspaceFileReference[] = []): void {
    this._pendingComposerDraft = { type: 'composerDraft', payload: { text, references } };
    void this._deliverComposerDraft();
  }

  private async _deliverComposerDraft(): Promise<void> {
    const draft = this._pendingComposerDraft;
    const view = this._view;
    if (draft === undefined || view === undefined) return;
    if (await view.webview.postMessage(draft)) delete this._pendingComposerDraft;
  }

  public pushUsageMeter(): void {
    void this._stateManager.pushUsageMeter();
  }

  public syncModelFromConfiguration(): void {
    this._stateManager.syncActiveModelFromConfiguration();
  }

  public pushAccountStatus(): void {
    void this._stateManager.pushAccountStatus();
  }

  public refreshAccountPresentation(): void {
    void this._stateManager.refreshAccountPresentation();
  }

  public showOnboarding(): void {
    this._stateManager.showOnboarding();
  }

  public resumeConversation(threadId: string): Promise<boolean> {
    return this._stateManager.resumeConversation(threadId);
  }

  public pushFollowUpBehavior(): void {
    this._stateManager.pushFollowUpBehavior();
  }

  public refreshRuntimeStatus(): void {
    void this._stateManager.refreshRuntimeStatus();
  }

  public resetConversation(): void {
    this._stateManager.resetConversation();
  }

  public rewindLast(): void {
    this._stateManager.rewindLast();
  }
}
