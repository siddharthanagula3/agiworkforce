/**
 * agentModeProvider.ts — Orchestrator for Agent Mode.
 *
 * Wires together AgentLoop (LLM + tool dispatch) and AgentUI (approvals +
 * diff previews + edit application). Owns the WebviewPanel lifecycle.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { WorkspaceIndexer } from '../services/workspaceIndexer';
import { AgentLoop } from './agentMode/agentLoop';
import { AgentUI } from './agentMode/agentUI';
import * as telemetry from '../services/telemetry';

export { parseFileEdits, parseFileReads } from './agentMode/agentLoop';

// ─── Agent Mode Panel ─────────────────────────────────────────────────────────

export class AgentModePanel {
  public static currentPanel: AgentModePanel | undefined;
  private static readonly viewType = 'agiWorkforce.agentMode';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private readonly loop: AgentLoop;
  private readonly ui: AgentUI;

  private readonly _originalContents = new Map<string, string>();
  private readonly _modifiedContents = new Map<string, string>();

  public static createOrShow(
    extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    context: vscode.ExtensionContext,
    planMode = false,
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (AgentModePanel.currentPanel !== undefined) {
      AgentModePanel.currentPanel.panel.reveal(column);
      AgentModePanel.currentPanel.setPlanMode(planMode);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      AgentModePanel.viewType,
      'AGI Agent Mode',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    const instance = new AgentModePanel(panel, extensionUri, secrets, context);
    instance.setPlanMode(planMode);
    AgentModePanel.currentPanel = instance;
  }

  public setPlanMode(enabled: boolean): void {
    this.loop.setPlanMode(enabled);
    this.postMessage({ type: 'planModeChanged', enabled });
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    context: vscode.ExtensionContext,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    const indexer = new WorkspaceIndexer(context);
    const post = this.postMessage.bind(this);

    this.ui = new AgentUI(this._originalContents, this._modifiedContents, post);

    this.loop = new AgentLoop(secrets, indexer, {
      postMessage: post,
      handleEditRequests: (edits) => this.ui.handleEditRequests(edits),
      handlePatchRequests: (patches) => this.ui.handlePatchRequests(patches),
      onIterationLimitReached: async (maxIterations) => {
        const choice = await vscode.window.showWarningMessage(
          `AGI Workforce Agent has reached ${maxIterations} autonomous iterations. ` +
            'Continue running? This may consume significant API credits.',
          { modal: false },
          'Continue',
          'Stop',
        );
        return choice === 'Continue';
      },
    });

    this.loop.initSystemPrompt();

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message: { type: string; text?: string; batchId?: string }) => {
        switch (message.type) {
          case 'sendMessage':
            if (message.text) {
              try {
                await this.loop.runUserMessage(message.text);
              } catch (err) {
                if (err instanceof Error) telemetry.logError(err, { context: 'agentMode' });
              }
            }
            break;
          case 'undoBatch':
            if (message.batchId) {
              await this.ui.undoBatch(message.batchId);
            }
            break;
          case 'undoPatchBatch':
            if (message.batchId) {
              await this.ui.handleUndoPatchBatch(message.batchId);
            }
            break;
          case 'clearHistory':
            this.loop.reset();
            this.ui.reset();
            this.loop.initSystemPrompt();
            this.postMessage({ type: 'cleared' });
            break;
        }
      },
      null,
      this.disposables,
    );

    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider('agi-original', {
        provideTextDocumentContent: (uri) => this._originalContents.get(uri.toString()) ?? '',
      }),
      vscode.workspace.registerTextDocumentContentProvider('agi-modified', {
        provideTextDocumentContent: (uri) => this._modifiedContents.get(uri.toString()) ?? '',
      }),
    );
  }

  private postMessage(message: Record<string, unknown>): void {
    void this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    AgentModePanel.currentPanel = undefined;
    this.panel.dispose();
    this._originalContents.clear();
    this._modifiedContents.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  private getHtml(): string {
    const nonce = getNonce();
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AGI Agent Mode</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, system-ui);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .header {
      padding: 10px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .header h2 { font-size: 14px; font-weight: 600; }
    .header-actions { display: flex; gap: 6px; }
    .header-actions button {
      background: transparent;
      border: 1px solid var(--vscode-button-secondaryBackground);
      color: var(--vscode-foreground);
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    }
    .header-actions button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }
    .message {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .message.user {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
    }
    .message.assistant {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
    }
    .message.system {
      background: var(--vscode-editorInfo-background);
      color: var(--vscode-editorInfo-foreground);
      font-size: 12px;
      font-style: italic;
      border-left: 3px solid var(--vscode-editorInfo-foreground);
    }
    .message.error {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
      border-left: 3px solid var(--vscode-errorForeground);
    }
    .message .label {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--vscode-descriptionForeground);
    }
    .undo-btn {
      display: inline-block;
      margin-top: 6px;
      padding: 2px 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    }
    .undo-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .thinking {
      display: none;
      padding: 8px 16px;
      font-style: italic;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .thinking.active { display: block; }
    .input-area {
      padding: 10px 16px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
    #userInput {
      flex: 1;
      padding: 8px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: inherit;
      font-size: 13px;
      resize: none;
      min-height: 36px;
      max-height: 120px;
    }
    #userInput:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    #sendBtn {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      align-self: flex-end;
    }
    #sendBtn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    #sendBtn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>AGI Agent Mode</h2>
    <div class="header-actions">
      <button id="clearBtn" title="Clear conversation">Clear</button>
    </div>
  </div>
  <div id="messages"></div>
  <div class="thinking" id="thinking">Agent is thinking...</div>
  <div class="input-area">
    <textarea id="userInput" placeholder="Ask the agent to read, analyze, or edit files..." rows="1"></textarea>
    <button id="sendBtn">Send</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const thinkingEl = document.getElementById('thinking');

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function addMessage(type, text, extra) {
      const div = document.createElement('div');
      div.className = 'message ' + type;

      const labelMap = { user: 'You', assistant: 'Agent', system: 'System', error: 'Error' };
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = labelMap[type] || type;
      div.appendChild(label);

      const content = document.createElement('div');
      content.textContent = text;
      div.appendChild(content);

      if (extra && extra.batchId) {
        const undoBtn = document.createElement('button');
        undoBtn.className = 'undo-btn';
        undoBtn.textContent = 'Undo Batch';
        undoBtn.dataset.batchId = extra.batchId;
        undoBtn.addEventListener('click', function() {
          vscode.postMessage({ type: 'undoBatch', batchId: this.dataset.batchId });
        });
        div.appendChild(undoBtn);
      }

      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      inputEl.style.height = 'auto';
      sendBtn.disabled = true;
      vscode.postMessage({ type: 'sendMessage', text });
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    inputEl.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    clearBtn.addEventListener('click', function() {
      messagesEl.innerHTML = '';
      vscode.postMessage({ type: 'clearHistory' });
    });

    window.addEventListener('message', function(event) {
      const msg = event.data;
      switch (msg.type) {
        case 'userMessage':
          addMessage('user', msg.text);
          break;
        case 'assistantMessage':
          addMessage('assistant', msg.text);
          sendBtn.disabled = false;
          break;
        case 'systemMessage':
          addMessage('system', msg.text);
          break;
        case 'error':
          addMessage('error', msg.text);
          sendBtn.disabled = false;
          break;
        case 'thinking':
          thinkingEl.className = msg.active ? 'thinking active' : 'thinking';
          break;
        case 'editsApplied':
          addMessage('system', 'Edits applied to: ' + msg.files.join(', '), { batchId: msg.batchId });
          break;
        case 'batchUndone':
          var btns = document.querySelectorAll('.undo-btn[data-batch-id="' + msg.batchId + '"]');
          btns.forEach(function(btn) { btn.remove(); });
          break;
        case 'cleared':
          messagesEl.innerHTML = '';
          sendBtn.disabled = false;
          break;
        case 'planModeChanged': {
          var headerEl = document.querySelector('.header h2');
          var existingBadge = document.getElementById('planModeBadge');
          if (msg.enabled) {
            if (!existingBadge) {
              var badge = document.createElement('span');
              badge.id = 'planModeBadge';
              badge.title = 'Plan Mode active — agent will propose a plan before editing';
              badge.style.cssText = [
                'display:inline-block',
                'margin-left:8px',
                'padding:1px 7px',
                'background:var(--vscode-badge-background,#0e639c)',
                'color:var(--vscode-badge-foreground,#fff)',
                'border-radius:10px',
                'font-size:11px',
                'font-weight:600',
                'vertical-align:middle',
                'letter-spacing:.03em'
              ].join(';');
              badge.textContent = 'PLAN';
              if (headerEl) { headerEl.appendChild(badge); }
            }
          } else {
            if (existingBadge) { existingBadge.remove(); }
          }
          break;
        }
      }
    });

    // Focus input on load
    inputEl.focus();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}
