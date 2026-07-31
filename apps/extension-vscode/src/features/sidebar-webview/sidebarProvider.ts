/**
 * sidebarProvider.ts — WebviewViewProvider for the AGI Workforce sidebar panel.
 *
 * Thin orchestrator: wires webview lifecycle (resolveWebviewView) to ChatStateManager.
 * HTML generation lives in sidebar/webviewContent.ts.
 * Message routing and streaming state live in sidebar/ChatStateManager.ts.
 */

// AUDIT-FIX: vscode-reorg
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

// Re-export for chatEditorPanel.ts (imported from ./sidebarProvider)
export { getWebviewContent, getNonce, escapeHtml } from './webviewContent';
export type {
  WebviewToExtMessage,
  ExtToWebviewMessage,
  UsageMeterWebviewPayload,
} from './ChatStateManager';

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'agi-workforce.sidebar';

  private _view?: vscode.WebviewView;
  private _messageListener?: vscode.Disposable;
  private _pendingComposerDraft?: Extract<ExtToWebviewMessage, { type: 'composerDraft' }>;
  private readonly _stateManager: ChatStateManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    // Named `_extensionContext` (not `_context`) because `resolveWebviewView`
    // takes an unrelated `_context: WebviewViewResolveContext` parameter.
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
      // VSCODE-PICKER-TIER-01: gate the <select> roster on the resolved tier.
      resolveTierSync(this._extensionContext),
      shouldShowOnboarding(this._extensionContext.globalState),
    );

    this._messageListener?.dispose();
    this._messageListener = webviewView.webview.onDidReceiveMessage(async (msg) => {
      // PR-3C (F-11): runtime-validate every webview → extension message.
      // A compromised webview cannot spoof e.g. {type:'setMode',
      // payload:{mode:'bypass'}} to silently downgrade agent mode.
      const parsed = parseWebviewMessage(msg);
      if (parsed === undefined) {
        console.warn('[AGI Workforce] dropping malformed webview message', msg);
        return;
      }
      // The Zod-inferred type is structurally a superset of the existing
      // WebviewToExtMessage union (optional fields include `| undefined`).
      // Cast through unknown to bridge the exactOptionalPropertyTypes gap.
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

  /** Programmatically reveal the sidebar panel. */
  public reveal(): void {
    this._view?.show?.(true);
  }

  /** Prefill the first-party sidebar when the host has no native Chat participant API. */
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

  /** Public entry-point so extension.ts can push a fresh usage meter on config change. */
  public pushUsageMeter(): void {
    void this._stateManager.pushUsageMeter();
  }

  /** Push the current browser/device-auth state into the visible account control. */
  public pushAccountStatus(): void {
    void this._stateManager.pushAccountStatus();
  }

  /** Replay the persisted first-run experience in an already-open sidebar. */
  public showOnboarding(): void {
    this._stateManager.showOnboarding();
  }

  /** Clear conversation history and notify the webview. */
  public resetConversation(): void {
    this._stateManager.resetConversation();
  }

  /** Remove the last user+assistant pair and notify the webview. */
  public rewindLast(): void {
    this._stateManager.rewindLast();
  }
}
