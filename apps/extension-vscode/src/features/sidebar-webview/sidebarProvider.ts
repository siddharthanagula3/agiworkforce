import * as vscode from 'vscode';
import { type ConversationTreeProvider } from '../trees/conversationTreeProvider';
import { type DiffDecorationProvider } from '../../providers/diffDecorationProvider';
import { normalizeConfiguredModelId, type ModelRoute } from '../model-picker/modelConstants';
import { Config } from '../../platform/config';
import { ChatStateManager, type ExtToWebviewMessage } from './ChatStateManager';
import { shouldShowOnboarding } from '../onboarding/onboardingState';
import { getWebviewContent, getNonce } from './webviewContent';
import { parseBoundWebviewMessage } from '../../protocol/webviewMessages';
import { type LocalRuntimePool } from '../../integrations/localRuntimePool';
import { resolveTierSync } from '../../integrations/tierResolver';
import { type WorkspaceFileReference } from '../chat-participant/promptReferences';
import { type ChatTurn } from '../chat/retry';
import { AttentionState } from './attentionBadge';
import { markInUse } from '../../core/startupWork';

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
  private _conversationTreeListener?: vscode.Disposable;
  private _pendingComposerDraft?: Extract<ExtToWebviewMessage, { type: 'composerDraft' }>;
  private _visibilityListener?: vscode.Disposable;
  private readonly _attention = new AttentionState();
  private readonly _stateManager: ChatStateManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    private readonly _extensionContext: vscode.ExtensionContext,
    private readonly _conversationTreeProvider?: ConversationTreeProvider,
    workspaceState?: vscode.Memento,
    localRuntimes?: LocalRuntimePool,
    diffDecorationProvider?: DiffDecorationProvider,
  ) {
    this._stateManager = new ChatStateManager(
      secrets,
      this._extensionContext,
      (msg: ExtToWebviewMessage) => this._postToWebview(msg),
      this._conversationTreeProvider,
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
    markInUse('chat-view');
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
      {
        origin: SidebarProvider.viewId.replace(/\./gu, '-'),
        epoch: this._stateManager.conversationEpoch(),
      },
    );

    this._messageListener?.dispose();
    this._messageListener = webviewView.webview.onDidReceiveMessage(async (msg) => {
      const parsed = parseBoundWebviewMessage(msg, {
        origin: SidebarProvider.viewId.replace(/\./gu, '-'),
        epoch: this._stateManager.conversationEpoch(),
      });
      if (parsed === undefined) {
        console.warn(
          '[AGI Workforce] dropping a webview message that is malformed or belongs to a replaced conversation',
          msg,
        );
        return;
      }
      await this._stateManager.handleMessage(
        parsed as unknown as Parameters<typeof this._stateManager.handleMessage>[0],
      );
      if (parsed.type === 'ready') await this._deliverComposerDraft();
    });

    this._conversationTreeListener?.dispose();
    this._conversationTreeListener = this._conversationTreeProvider?.onDidChangeTreeData(() => {
      void this._stateManager.pushRecentConversations();
    });

    this._visibilityListener?.dispose();
    // Optional-called for the same reason `show` is below: a Code-OSS fork can
    // ship a narrower WebviewView, and an attention badge is not worth failing
    // to open the panel over.
    this._visibilityListener = webviewView.onDidChangeVisibility?.(() => this._refreshBadge());

    webviewView.onDidDispose(() => {
      this._messageListener?.dispose();
      delete this._messageListener;
      this._conversationTreeListener?.dispose();
      delete this._conversationTreeListener;
      this._visibilityListener?.dispose();
      delete this._visibilityListener;
      this._attention.record('seen');
      this._stateManager.cancelInFlight();
      delete this._view;
    });
  }

  /**
   * Mark the view when a turn wants something and nobody is looking at it.
   *
   * A turn keeps running while its panel is hidden, so an approval prompt or a
   * finished reply could sit there indefinitely with nothing on screen saying
   * so. The Activity Bar badge is the only surface VS Code gives a hidden view,
   * and it is what the user's other extensions use for the same thing.
   */
  private _postToWebview(message: ExtToWebviewMessage): Thenable<boolean> | undefined {
    if (message.type === 'approvalRequested') this._attention.record('approval-requested');
    else if (message.type === 'approvalResolved') this._attention.record('approval-resolved');
    else if (message.type === 'done' || message.type === 'error') {
      this._attention.record('turn-finished');
    }
    this._refreshBadge();
    return this._view?.webview.postMessage(message);
  }

  private _refreshBadge(): void {
    const view = this._view;
    if (view === undefined) return;
    if (view.visible === true) this._attention.record('seen');
    try {
      view.badge = this._attention.badge();
    } catch {
      // A host that does not implement the badge is not a reason to drop the
      // message this was riding along with.
    }
  }

  public reveal(): void {
    this._view?.show?.(true);
  }

  public prefillComposer(text: string, references: WorkspaceFileReference[] = []): void {
    this._pendingComposerDraft = { type: 'composerDraft', payload: { text, references } };
    void this._deliverComposerDraft();
  }

  public askInChat(text: string, references: WorkspaceFileReference[] = []): void {
    this._pendingComposerDraft = {
      type: 'composerDraft',
      payload: { text, references, submit: true },
    };
    void this._deliverComposerDraft();
  }

  public activeThreadId(): string | undefined {
    return this._stateManager.activeThreadId();
  }

  public chatTranscript(): readonly ChatTurn[] {
    return this._stateManager.chatTranscript();
  }

  public chatTurnInFlight(): boolean {
    return this._stateManager.turnInFlight();
  }

  /**
   * Resending through the composer is what makes the retried turn carry the
   * model, mode and browse setting the composer holds now.
   */
  public resendInChat(text: string, references: readonly WorkspaceFileReference[]): void {
    this.reveal();
    this.askInChat(text, [...references]);
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

  public pushActiveProject(): void {
    this._stateManager.pushActiveProject();
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

  public pushEditorContext(): void {
    this._stateManager.pushEditorContext();
  }

  public activeRoute(): ModelRoute | undefined {
    return this._stateManager.activeRoute();
  }

  public refreshRuntimeStatus(): void {
    void this._stateManager.refreshRuntimeStatus();
  }

  public resetConversation(): void {
    this._stateManager.resetConversation();
  }
}
