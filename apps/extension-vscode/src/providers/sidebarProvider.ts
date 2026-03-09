/**
 * sidebarProvider.ts — WebviewViewProvider for the AGI Workforce sidebar panel
 *
 * Renders a self-contained chat UI inside the VS Code activity-bar sidebar.
 * Communicates with the extension host via postMessage / onDidReceiveMessage:
 *
 *   Webview → Extension:  { type: 'sendMessage', payload: { text, model } }
 *                         { type: 'setApiKey',   payload: { key } }
 *                         { type: 'clearApiKey'  }
 *                         { type: 'ready'        }
 *
 *   Extension → Webview:  { type: 'token',       payload: { text } }
 *                         { type: 'done'          }
 *                         { type: 'error',        payload: { message } }
 *                         { type: 'apiKeyStatus', payload: { hasKey: boolean } }
 *                         { type: 'model',        payload: { model: string } }
 */

import * as vscode from 'vscode';
import {
  streamChatCompletion,
  setApiKey,
  clearApiKey,
  getApiKey,
  AgiWorkforceApiError,
  type ChatMessage,
} from '../utils/api';
import { type ConversationStore } from '../storage/conversationStore';
import { type ConversationTreeProvider } from './conversationTreeProvider';

// ─── Message types (shared protocol) ─────────────────────────────────────────

type WebviewToExtMessage =
  | { type: 'sendMessage'; payload: { text: string; model?: string } }
  | { type: 'setApiKey'; payload: { key: string } }
  | { type: 'clearApiKey' }
  | { type: 'ready' }
  | { type: 'getModel' }
  | { type: 'openSettings' }
  | { type: 'cancel' };

type ExtToWebviewMessage =
  | { type: 'token'; payload: { text: string } }
  | { type: 'done' }
  | { type: 'error'; payload: { message: string } }
  | { type: 'apiKeyStatus'; payload: { hasKey: boolean } }
  | { type: 'model'; payload: { model: string } };

// ─── HTML template ────────────────────────────────────────────────────────────

/**
 * Generates the webview HTML. Uses a nonce for CSP.
 * Tailored to match AGI Workforce design tokens:
 *   - Background: #0f0f0f / #1a1a1a
 *   - Accent: #21808d (teal)
 *   - Send button: #da7756 (terra cotta)
 */
function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
): string {
  // Build CSP-safe URIs for any local assets we might need
  const cspSource = webview.cspSource;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'nonce-${nonce}';
             script-src 'nonce-${nonce}';
             img-src ${cspSource} https: data:;
             font-src ${cspSource};" />
  <title>AGI Workforce</title>
  <style nonce="${nonce}">
    :root {
      --bg-base: #0f0f0f;
      --bg-elevated: #1a1a1a;
      --bg-overlay: #242424;
      --accent-teal: #21808d;
      --accent-terra: #da7756;
      --text-primary: rgba(255, 255, 255, 0.92);
      --text-secondary: rgba(255, 255, 255, 0.55);
      --border: rgba(255, 255, 255, 0.07);
      --radius-md: 8px;
      --radius-lg: 12px;
      --transition: cubic-bezier(0.16, 1, 0.3, 1);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg-base);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-elevated);
      flex-shrink: 0;
    }

    .header-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--accent-teal);
      letter-spacing: 0.3px;
    }

    .header-actions {
      display: flex;
      gap: 6px;
    }

    .icon-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 14px;
      transition: color 0.15s var(--transition),
                  background 0.15s var(--transition);
    }
    .icon-btn:hover {
      color: var(--text-primary);
      background: var(--bg-overlay);
    }

    /* ── Messages ── */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }

    #messages::-webkit-scrollbar { width: 4px; }
    #messages::-webkit-scrollbar-track { background: transparent; }
    #messages::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 2px;
    }

    .message {
      max-width: 100%;
      padding: 9px 12px;
      border-radius: var(--radius-md);
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message.user {
      background: var(--bg-overlay);
      align-self: flex-end;
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .message.assistant {
      background: transparent;
      align-self: flex-start;
      color: var(--text-primary);
      border-left: 2px solid var(--accent-teal);
      padding-left: 10px;
      border-radius: 0 var(--radius-md) var(--radius-md) 0;
    }

    .message.error {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      align-self: stretch;
    }

    .message.system {
      text-align: center;
      color: var(--text-secondary);
      font-size: 11px;
      background: none;
      padding: 4px 0;
    }

    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 6px 0;
    }

    .typing-dot {
      width: 6px;
      height: 6px;
      background: var(--accent-teal);
      border-radius: 50%;
      animation: typing 1.2s ease-in-out infinite;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
      0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }

    /* ── API key prompt ── */
    .api-key-banner {
      background: rgba(33, 128, 141, 0.12);
      border: 1px solid rgba(33, 128, 141, 0.3);
      border-radius: var(--radius-md);
      padding: 12px;
      text-align: center;
      margin: 12px;
      flex-shrink: 0;
    }

    .api-key-banner p {
      color: var(--text-secondary);
      margin-bottom: 10px;
      font-size: 12px;
      line-height: 1.5;
    }

    .api-key-input-row {
      display: flex;
      gap: 6px;
    }

    .api-key-input {
      flex: 1;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 12px;
      padding: 6px 10px;
      outline: none;
      transition: border-color 0.15s;
    }
    .api-key-input:focus { border-color: var(--accent-teal); }

    .save-key-btn {
      background: var(--accent-teal);
      border: none;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      transition: opacity 0.15s;
    }
    .save-key-btn:hover { opacity: 0.85; }

    /* ── Input area ── */
    .input-area {
      border-top: 1px solid var(--border);
      background: var(--bg-elevated);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }

    .model-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .model-label {
      font-size: 11px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .model-select {
      background: var(--bg-overlay);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 11px;
      padding: 3px 8px;
      outline: none;
      cursor: pointer;
      flex: 1;
      max-width: 180px;
    }
    .model-select:focus { border-color: var(--accent-teal); }

    .input-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    #userInput {
      flex: 1;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: inherit;
      font-size: 13px;
      line-height: 1.5;
      min-height: 38px;
      max-height: 140px;
      outline: none;
      padding: 9px 12px;
      resize: none;
      transition: border-color 0.15s var(--transition);
    }
    #userInput:focus { border-color: var(--accent-teal); }
    #userInput::placeholder { color: var(--text-secondary); }

    #sendBtn {
      background: var(--accent-terra);
      border: none;
      border-radius: var(--radius-md);
      color: #fff;
      cursor: pointer;
      font-size: 16px;
      height: 38px;
      width: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s var(--transition),
                  transform 0.1s var(--transition);
    }
    #sendBtn:hover:not(:disabled) { opacity: 0.88; transform: scale(1.05); }
    #sendBtn:disabled { opacity: 0.4; cursor: not-allowed; }
    #sendBtn.streaming { background: var(--bg-overlay); border: 1px solid var(--border); }

    /* Stop square icon when streaming */
    #sendBtn.streaming::before {
      content: '■';
      font-size: 12px;
    }
    /* Arrow icon when idle */
    #sendBtn:not(.streaming)::before {
      content: '↑';
      font-size: 18px;
      font-weight: 700;
    }

    /* ── Code blocks ── */
    pre { background: #0d0d0d; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 12px; overflow-x: auto; margin: 8px 0; }
    code { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 12px; }
    pre code { color: #e6edf3; }
    :not(pre) > code { background: rgba(255,255,255,0.08); padding: 2px 5px; border-radius: 3px; color: #79c0ff; }
    strong { font-weight: 600; }
  </style>
</head>
<body>

  <!-- ── Header ── -->
  <div class="header">
    <span class="header-title">AGI Workforce</span>
    <div class="header-actions">
      <button class="icon-btn" id="clearBtn" title="Clear conversation">✕</button>
      <button class="icon-btn" id="settingsBtn" title="Settings">⚙</button>
    </div>
  </div>

  <!-- ── API key banner (hidden when key is present) ── -->
  <div class="api-key-banner" id="apiKeyBanner" style="display:none">
    <p>Enter your AGI Workforce API key to start chatting.<br/>
       Get one at <strong>agiworkforce.com</strong></p>
    <div class="api-key-input-row">
      <input type="password" class="api-key-input" id="apiKeyInput"
             placeholder="sk-agi-…" autocomplete="off" spellcheck="false" />
      <button class="save-key-btn" id="saveKeyBtn">Save</button>
    </div>
  </div>

  <!-- ── Messages ── -->
  <div id="messages">
    <div class="message system">Ask anything about your code. Use @agi in VS Code Chat for richer context.</div>
  </div>

  <!-- ── Input ── -->
  <div class="input-area">
    <div class="model-row">
      <span class="model-label">Model:</span>
      <select class="model-select" id="modelSelect">
        <option value="auto-balanced">Auto (balanced)</option>
        <option value="auto-economy">Auto (economy)</option>
        <option value="auto-premium">Auto (premium)</option>
        <option value="claude-opus-4.6">Claude Opus 4.6</option>
        <option value="claude-sonnet-4.6">Claude Sonnet 4.6</option>
        <option value="claude-haiku-4.5">Claude Haiku 4.5</option>
        <option value="gpt-5-pro">GPT-5 Pro</option>
        <option value="gpt-5.2">GPT-5.2</option>
        <option value="gpt-5-nano">GPT-5 Nano</option>
        <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
        <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
        <option value="deepseek-r1">DeepSeek R1</option>
        <option value="deepseek-chat">DeepSeek Chat</option>
        <option value="sonar-pro">Sonar Pro</option>
        <option value="grok-4">Grok 4</option>
      </select>
    </div>
    <div class="input-row">
      <textarea
        id="userInput"
        placeholder="Ask about your code…"
        rows="1"
        spellcheck="true"
      ></textarea>
      <button id="sendBtn" title="Send (Enter)"></button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ── DOM refs ──────────────────────────────────────────────────────────────
    const messagesEl = document.getElementById('messages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const modelSelect = document.getElementById('modelSelect');
    const apiKeyBanner = document.getElementById('apiKeyBanner');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveKeyBtn = document.getElementById('saveKeyBtn');

    // ── State ─────────────────────────────────────────────────────────────────
    let streaming = false;
    let currentAssistantEl = null;
    let accumulatedContent = '';

    // ── Helpers ───────────────────────────────────────────────────────────────
    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function showTyping() {
      const div = document.createElement('div');
      div.className = 'typing-indicator';
      div.id = 'typingIndicator';
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        div.appendChild(dot);
      }
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTyping() {
      const el = document.getElementById('typingIndicator');
      if (el) el.remove();
    }

    function setStreaming(value) {
      streaming = value;
      sendBtn.disabled = false;
      sendBtn.classList.toggle('streaming', value);
      userInput.disabled = value;
    }

    function autoResize() {
      userInput.style.height = 'auto';
      userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
    }

    // ── Markdown rendering ────────────────────────────────────────────────
    function renderMarkdown(text) {
      var bt = String.fromCharCode(96); // backtick char
      var bt3 = bt + bt + bt;
      // Escape HTML entities first (DOMPurify-lite approach)
      var html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      // Fenced code blocks
      var codeBlockRe = new RegExp(bt3 + '(\\\\w*)?\\\\n([\\\\s\\\\S]*?)' + bt3, 'g');
      html = html.replace(codeBlockRe, function(m, lang, code) {
        return '<pre><code>' + code.replace(/\\n$/, '') + '</code></pre>';
      });

      // Inline code
      var inlineCodeRe = new RegExp(bt + '([^' + bt + ']+?)' + bt, 'g');
      html = html.replace(inlineCodeRe, '<code>$1</code>');

      // Bold: **...**
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');

      // Newlines to <br> (but not inside <pre> blocks)
      var parts = html.split(/(<pre[\\s\\S]*?<\\/pre>)/g);
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i].startsWith('<pre')) {
          parts[i] = parts[i].replace(/\\n/g, '<br>');
        }
      }
      html = parts.join('');

      return html;
    }

    // ── Send ──────────────────────────────────────────────────────────────────
    function sendMessage() {
      if (streaming) {
        // Stop button — signal cancellation
        vscode.postMessage({ type: 'cancel' });
        return;
      }

      const text = userInput.value.trim();
      if (!text) return;

      addMessage('user', text);
      userInput.value = '';
      userInput.style.height = 'auto';

      showTyping();
      setStreaming(true);
      currentAssistantEl = null;
      accumulatedContent = '';

      vscode.postMessage({
        type: 'sendMessage',
        payload: { text, model: modelSelect.value }
      });
    }

    // ── Event listeners ───────────────────────────────────────────────────────
    sendBtn.addEventListener('click', sendMessage);

    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    userInput.addEventListener('input', autoResize);

    clearBtn.addEventListener('click', () => {
      messagesEl.innerHTML =
        '<div class="message system">Conversation cleared. Ask anything about your code.</div>';
      streaming = false;
      currentAssistantEl = null;
      setStreaming(false);
    });

    settingsBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    saveKeyBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (!key) return;
      vscode.postMessage({ type: 'setApiKey', payload: { key } });
      apiKeyInput.value = '';
    });

    apiKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveKeyBtn.click();
    });

    // ── Messages from extension ───────────────────────────────────────────────
    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'token') {
        removeTyping();
        if (!currentAssistantEl) {
          currentAssistantEl = addMessage('assistant', '');
          accumulatedContent = '';
        }
        accumulatedContent += msg.payload.text;
        currentAssistantEl.textContent = accumulatedContent;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      else if (msg.type === 'done') {
        removeTyping();
        if (currentAssistantEl && accumulatedContent) {
          currentAssistantEl.innerHTML = renderMarkdown(accumulatedContent);
        }
        setStreaming(false);
        currentAssistantEl = null;
        accumulatedContent = '';
      }

      else if (msg.type === 'error') {
        removeTyping();
        addMessage('error', msg.payload.message);
        setStreaming(false);
        currentAssistantEl = null;
      }

      else if (msg.type === 'apiKeyStatus') {
        apiKeyBanner.style.display = msg.payload.hasKey ? 'none' : 'flex';
        apiKeyBanner.style.flexDirection = 'column';
      }

      else if (msg.type === 'model') {
        const opt = modelSelect.querySelector('option[value="' + msg.payload.model + '"]');
        if (opt) modelSelect.value = msg.payload.model;
      }
    });

    // ── Signal ready ──────────────────────────────────────────────────────────
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

// ─── Nonce generator ──────────────────────────────────────────────────────────

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'agi-workforce.sidebar';

  private _view?: vscode.WebviewView;
  private _currentCancelSource?: vscode.CancellationTokenSource;
  private _conversationHistory: ChatMessage[] = [];
  private _messageListener?: vscode.Disposable;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _secrets: vscode.SecretStorage,
    private readonly _conversationStore?: ConversationStore,
    private readonly _conversationTreeProvider?: ConversationTreeProvider,
  ) {}

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
    webviewView.webview.html = getWebviewContent(webviewView.webview, this._extensionUri, nonce);

    // Handle messages from the webview — track the listener for cleanup
    this._messageListener?.dispose();
    this._messageListener = webviewView.webview.onDidReceiveMessage(
      async (msg: WebviewToExtMessage) => {
        await this._handleWebviewMessage(msg);
      },
    );

    // Clean up resources when the webview view is disposed (sidebar closed)
    webviewView.onDidDispose(() => {
      this._messageListener?.dispose();
      delete this._messageListener;
      this._currentCancelSource?.cancel();
      this._currentCancelSource?.dispose();
      delete this._currentCancelSource;
      delete this._view;
    });
  }

  private async _handleWebviewMessage(msg: WebviewToExtMessage): Promise<void> {
    switch (msg.type) {
      case 'ready': {
        // Tell the webview whether an API key is stored
        const hasKey = (await getApiKey(this._secrets)) !== undefined;
        this._post({ type: 'apiKeyStatus', payload: { hasKey } });

        // Send current model setting
        const model =
          vscode.workspace.getConfiguration('agiWorkforce').get<string>('model') ?? 'auto';
        this._post({ type: 'model', payload: { model } });
        break;
      }

      case 'setApiKey': {
        await setApiKey(this._secrets, msg.payload.key);
        this._post({ type: 'apiKeyStatus', payload: { hasKey: true } });
        vscode.window.showInformationMessage('AGI Workforce API key saved.');
        break;
      }

      case 'clearApiKey': {
        await clearApiKey(this._secrets);
        this._post({ type: 'apiKeyStatus', payload: { hasKey: false } });
        break;
      }

      case 'openSettings': {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'agiWorkforce');
        break;
      }

      case 'getModel': {
        const model =
          vscode.workspace.getConfiguration('agiWorkforce').get<string>('model') ?? 'auto';
        this._post({ type: 'model', payload: { model } });
        break;
      }

      case 'sendMessage': {
        await this._handleSendMessage(msg.payload.text, msg.payload.model);
        break;
      }

      case 'cancel': {
        this._currentCancelSource?.cancel();
        break;
      }
    }
  }

  private async _handleSendMessage(text: string, model?: string): Promise<void> {
    // Cancel any in-flight request
    this._currentCancelSource?.cancel();
    this._currentCancelSource = new vscode.CancellationTokenSource();
    const token = this._currentCancelSource.token;

    // Append user turn to history
    this._conversationHistory.push({ role: 'user', content: text });

    const systemPrompt =
      'You are AGI Workforce, a model-agnostic AI coding assistant. ' +
      'Be concise, helpful, and format code in Markdown fenced blocks.';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this._conversationHistory,
    ];

    const assistantTokens: string[] = [];

    try {
      await streamChatCompletion(
        this._secrets,
        messages,
        {
          onToken: (t) => {
            assistantTokens.push(t);
            this._post({ type: 'token', payload: { text: t } });
          },
          onDone: () => {
            const full = assistantTokens.join('');
            this._conversationHistory.push({
              role: 'assistant',
              content: full,
            });
            this._post({ type: 'done' });

            // Persist conversation to store
            if (
              this._conversationStore !== undefined &&
              this._conversationTreeProvider !== undefined
            ) {
              const userText = text;
              const conv = this._conversationStore.create(
                userText.slice(0, 60).replace(/\n/g, ' '),
                model ??
                  vscode.workspace.getConfiguration('agiWorkforce').get<string>('model') ??
                  'auto-balanced',
              );
              // Replace the auto-created empty messages with the full history (excluding system)
              const now = Date.now();
              conv.messages = this._conversationHistory
                .filter((m) => m.role !== 'system')
                .map((m) => ({ ...m, timestamp: now }));
              this._conversationStore.save(conv);
              this._conversationTreeProvider.refresh();
            }
          },
          onError: (err) => {
            this._post({
              type: 'error',
              payload: { message: err.message },
            });
          },
        },
        token,
        model,
      );
    } catch (err) {
      if (err instanceof AgiWorkforceApiError && err.code === 'CANCELLED') {
        this._post({ type: 'done' });
        return;
      }

      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';

      this._post({ type: 'error', payload: { message } });
    }
  }

  private _post(msg: ExtToWebviewMessage): void {
    this._view?.webview.postMessage(msg);
  }

  /** Programmatically reveal the sidebar panel. */
  public reveal(): void {
    this._view?.show?.(true);
  }
}
