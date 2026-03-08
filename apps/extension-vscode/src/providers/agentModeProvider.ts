/**
 * agentModeProvider.ts — Agent mode with multi-file edit capability
 *
 * Opens a webview panel where the user can chat with the AI agent.
 * The agent can read multiple files, suggest edits across files,
 * and apply them with diff preview and batch undo support.
 */

import * as vscode from 'vscode';
import { chatCompletion, type ChatMessage } from '../utils/api';
import { WorkspaceIndexer } from '../services/workspaceIndexer';
import * as telemetry from '../services/telemetry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileEdit {
  filePath: string;
  uri: vscode.Uri;
  originalContent: string;
  newContent: string;
  language: string;
}

interface EditBatch {
  id: string;
  timestamp: number;
  edits: FileEdit[];
  description: string;
}

// ─── Edit parser ──────────────────────────────────────────────────────────────

/**
 * Parse LLM response for file edit blocks.
 * Expects format:
 * ```edit:path/to/file.ts
 * <new content>
 * ```
 */
export function parseFileEdits(response: string): Array<{ filePath: string; content: string }> {
  const edits: Array<{ filePath: string; content: string }> = [];
  const editPattern = /```edit:([^\n]+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = editPattern.exec(response)) !== null) {
    const filePath = match[1]?.trim();
    const content = match[2]?.trimEnd();
    if (filePath && content) {
      edits.push({ filePath, content });
    }
  }

  return edits;
}

/**
 * Parse LLM response for file read requests.
 * Expects format: @read path/to/file.ts
 */
export function parseFileReads(response: string): string[] {
  const reads: string[] = [];
  const readPattern = /@read\s+([^\n]+)/g;
  let match: RegExpExecArray | null;

  while ((match = readPattern.exec(response)) !== null) {
    const filePath = match[1]?.trim();
    if (filePath) {
      reads.push(filePath);
    }
  }

  return reads;
}

// ─── Agent Mode Panel ─────────────────────────────────────────────────────────

export class AgentModePanel {
  public static currentPanel: AgentModePanel | undefined;
  private static readonly viewType = 'agiWorkforce.agentMode';

  private readonly panel: vscode.WebviewPanel;
  private readonly secrets: vscode.SecretStorage;
  private readonly extensionUri: vscode.Uri;
  private readonly indexer: WorkspaceIndexer;
  private disposables: vscode.Disposable[] = [];

  private messages: ChatMessage[] = [];
  private editHistory: EditBatch[] = [];
  private isProcessing = false;
  private diffProviderDisposables: vscode.Disposable[] = [];
  private _planMode = false;
  private _originalContents = new Map<string, string>();
  private _modifiedContents = new Map<string, string>();

  /** Counts autonomous continuation iterations for the current agent session. */
  private _iterationCount = 0;
  /** Default max iterations — overridden by agiWorkforce.agent.maxIterations setting. */
  private static readonly DEFAULT_MAX_ITERATIONS = 25;

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
    this._planMode = enabled;
    // Rebuild system prompt now that _planMode is set correctly
    if (this.messages.length > 0 && this.messages[0]?.role === 'system') {
      this.messages[0] = { role: 'system', content: this.buildSystemPrompt() };
    } else {
      this.messages.unshift({ role: 'system', content: this.buildSystemPrompt() });
    }
    // Notify webview so it can update UI if desired
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
    this.secrets = secrets;
    this.indexer = new WorkspaceIndexer(context);

    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message: { type: string; text?: string; batchId?: string }) => {
        switch (message.type) {
          case 'sendMessage':
            if (message.text) {
              await this.handleUserMessage(message.text);
            }
            break;
          case 'undoBatch':
            if (message.batchId) {
              await this.undoBatch(message.batchId);
            }
            break;
          case 'clearHistory':
            this.messages = [];
            this.editHistory = [];
            this._iterationCount = 0;
            this.postMessage({ type: 'cleared' });
            break;
        }
      },
      null,
      this.disposables,
    );

    // Register diff content providers once — keyed by URI string
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider('agi-original', {
        provideTextDocumentContent: (uri) => this._originalContents.get(uri.toString()) ?? '',
      }),
      vscode.workspace.registerTextDocumentContentProvider('agi-modified', {
        provideTextDocumentContent: (uri) => this._modifiedContents.get(uri.toString()) ?? '',
      }),
    );

    // Initialize system prompt
    this.messages.push({
      role: 'system',
      content: this.buildSystemPrompt(),
    });
  }

  private buildSystemPrompt(): string {
    const lines = [
      'You are AGI Workforce Agent, an AI coding assistant with multi-file editing capabilities.',
      '',
      'You can read and edit files in the workspace. Use these formats:',
      '',
      'To request reading a file:',
      '@read path/to/file.ts',
      '',
      'To suggest an edit to a file (provide the COMPLETE new file content):',
      '```edit:path/to/file.ts',
      '<complete new file content here>',
      '```',
      '',
      'You can include multiple @read and ```edit blocks in a single response.',
      'Always read files before editing them to understand the current content.',
      'When editing, provide the complete file content, not just the changed parts.',
      'Explain your changes clearly before providing edit blocks.',
    ];

    if (this._planMode) {
      lines.push(
        '',
        'PLAN MODE is active: Before making any edits, first output a numbered plan describing',
        'all changes you intend to make. Wait for the user to confirm before applying any edits.',
      );
    }

    return lines.join('\n');
  }

  private async handleUserMessage(text: string): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Reset iteration counter on each new user message (new agent session).
    this._iterationCount = 0;

    this.postMessage({ type: 'userMessage', text });
    this.postMessage({ type: 'thinking', active: true });

    this.messages.push({ role: 'user', content: text });

    try {
      // Gather workspace context
      if (this.indexer.isStale()) {
        await this.indexer.index();
      }
      const wsContext = this.indexer.getRelevantContext(text);

      // Include open editor context
      const editorContext = this.getOpenEditorsContext();

      // Build augmented message
      const augmentedMessages = [...this.messages];
      if (wsContext || editorContext) {
        const contextMsg = [wsContext, editorContext].filter(Boolean).join('\n\n');
        augmentedMessages.splice(1, 0, {
          role: 'system',
          content: `Current workspace context:\n${contextMsg}`,
        });
      }

      // Get LLM response
      const cancelSource = new vscode.CancellationTokenSource();
      const response = await chatCompletion(this.secrets, augmentedMessages, cancelSource.token);
      cancelSource.dispose();

      this.messages.push({ role: 'assistant', content: response });

      // Check for file read requests
      const readRequests = parseFileReads(response);
      if (readRequests.length > 0) {
        const fileContents = await this.readFiles(readRequests);
        // Show the response first, then auto-feed file contents back
        this.postMessage({ type: 'assistantMessage', text: response });
        this.postMessage({ type: 'thinking', active: false });

        if (fileContents.length > 0) {
          const contentMsg = fileContents
            .map((f) => `--- ${f.path} ---\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
            .join('\n\n');

          this.messages.push({
            role: 'user',
            content: `Here are the requested file contents:\n\n${contentMsg}\n\nPlease proceed with your analysis or edits.`,
          });

          this.postMessage({
            type: 'systemMessage',
            text: `Read ${fileContents.length} file(s): ${fileContents.map((f) => f.path).join(', ')}`,
          });

          // Auto-continue the conversation
          this.isProcessing = false;
          await this.handleAgentContinue();
          return;
        }
      }

      // Check for file edits
      const editRequests = parseFileEdits(response);
      if (editRequests.length > 0) {
        this.postMessage({ type: 'assistantMessage', text: response });
        this.postMessage({ type: 'thinking', active: false });
        await this.handleEditRequests(editRequests);
      } else {
        this.postMessage({ type: 'assistantMessage', text: response });
        this.postMessage({ type: 'thinking', active: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', text: message });
      this.postMessage({ type: 'thinking', active: false });

      if (err instanceof Error) {
        telemetry.logError(err, { context: 'agentMode' });
      }
    }

    this.isProcessing = false;
  }

  private async handleAgentContinue(): Promise<void> {
    if (this.isProcessing) return;

    // Enforce per-session iteration cap to prevent runaway autonomous loops.
    this._iterationCount += 1;
    const maxIterations =
      vscode.workspace
        .getConfiguration('agiWorkforce')
        .get<number>('agent.maxIterations') ?? AgentModePanel.DEFAULT_MAX_ITERATIONS;

    if (this._iterationCount > maxIterations) {
      const choice = await vscode.window.showWarningMessage(
        `AGI Workforce Agent has reached ${maxIterations} autonomous iterations. ` +
          'Continue running? This may consume significant API credits.',
        { modal: false },
        'Continue',
        'Stop',
      );
      if (choice !== 'Continue') {
        this.postMessage({
          type: 'systemMessage',
          text: `Agent stopped after ${maxIterations} iterations. Send a new message to continue.`,
        });
        this.isProcessing = false;
        return;
      }
      // User approved — reset counter so they get another N iterations before
      // the next warning rather than being prompted on every subsequent call.
      this._iterationCount = 1;
    }

    this.isProcessing = true;

    this.postMessage({ type: 'thinking', active: true });

    try {
      const cancelSource = new vscode.CancellationTokenSource();
      const response = await chatCompletion(this.secrets, this.messages, cancelSource.token);
      cancelSource.dispose();

      this.messages.push({ role: 'assistant', content: response });

      const editRequests = parseFileEdits(response);
      this.postMessage({ type: 'assistantMessage', text: response });
      this.postMessage({ type: 'thinking', active: false });

      if (editRequests.length > 0) {
        await this.handleEditRequests(editRequests);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', text: message });
      this.postMessage({ type: 'thinking', active: false });
    }

    this.isProcessing = false;
  }

  private async handleEditRequests(
    editRequests: Array<{ filePath: string; content: string }>,
  ): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length === 0) {
      this.postMessage({ type: 'error', text: 'No workspace folder open.' });
      return;
    }

    const rootUri = workspaceFolders[0]!.uri;
    const edits: FileEdit[] = [];

    for (const req of editRequests) {
      const fileUri = vscode.Uri.joinPath(rootUri, req.filePath);
      let originalContent = '';
      let language = 'plaintext';

      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        originalContent = doc.getText();
        language = doc.languageId;
      } catch {
        // New file
        originalContent = '';
        const ext = req.filePath.split('.').pop() ?? '';
        language = this.inferLanguage(ext);
      }

      edits.push({
        filePath: req.filePath,
        uri: fileUri,
        originalContent,
        newContent: req.content,
        language,
      });
    }

    // Show diff preview for each file
    const batchId = `batch-${Date.now()}`;
    const descriptions: string[] = [];

    for (const edit of edits) {
      descriptions.push(edit.filePath);

      // Create a virtual document showing the diff
      const originalUri = edit.uri.with({ scheme: 'agi-original', query: batchId });
      const modifiedUri = edit.uri.with({ scheme: 'agi-modified', query: batchId });

      // Populate the shared content maps (providers registered once in constructor)
      this._originalContents.set(originalUri.toString(), edit.originalContent);
      this._modifiedContents.set(modifiedUri.toString(), edit.newContent);

      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        modifiedUri,
        `AGI Agent: ${edit.filePath} (Preview)`,
        { preview: true },
      );
    }

    // Ask user to apply or reject
    const fileList = edits.map((e) => e.filePath).join(', ');
    const choice = await vscode.window.showInformationMessage(
      `AGI Agent proposes edits to ${edits.length} file(s): ${fileList}`,
      { modal: true },
      'Apply All',
      'Cancel',
    );

    if (choice === 'Apply All') {
      const batch: EditBatch = {
        id: batchId,
        timestamp: Date.now(),
        edits,
        description: `Edited ${edits.length} file(s): ${descriptions.join(', ')}`,
      };

      const wsEdit = new vscode.WorkspaceEdit();

      for (const edit of edits) {
        if (edit.originalContent === '') {
          // New file — create it
          wsEdit.createFile(edit.uri, { overwrite: true });
          wsEdit.insert(edit.uri, new vscode.Position(0, 0), edit.newContent);
        } else {
          // Existing file — replace entire content
          const doc = await vscode.workspace.openTextDocument(edit.uri);
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length),
          );
          wsEdit.replace(edit.uri, fullRange, edit.newContent);
        }
      }

      const applied = await vscode.workspace.applyEdit(wsEdit);
      if (applied) {
        this.editHistory.push(batch);
        this.postMessage({
          type: 'editsApplied',
          batchId,
          files: edits.map((e) => e.filePath),
        });
        this.postMessage({
          type: 'systemMessage',
          text: `Applied edits to ${edits.length} file(s). Use "Undo Batch" to revert.`,
        });
      } else {
        this.postMessage({ type: 'error', text: 'Failed to apply edits.' });
      }
    } else {
      this.postMessage({ type: 'systemMessage', text: 'Edits cancelled.' });
    }
  }

  private async undoBatch(batchId: string): Promise<void> {
    const batchIndex = this.editHistory.findIndex((b) => b.id === batchId);
    if (batchIndex === -1) {
      this.postMessage({ type: 'error', text: 'Batch not found in history.' });
      return;
    }

    const batch = this.editHistory[batchIndex]!;
    const wsEdit = new vscode.WorkspaceEdit();

    for (const edit of batch.edits) {
      if (edit.originalContent === '') {
        // File was created — delete it
        wsEdit.deleteFile(edit.uri);
      } else {
        // Restore original content
        try {
          const doc = await vscode.workspace.openTextDocument(edit.uri);
          const fullRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(doc.getText().length),
          );
          wsEdit.replace(edit.uri, fullRange, edit.originalContent);
        } catch {
          this.postMessage({
            type: 'error',
            text: `Could not restore ${edit.filePath} — file may have been moved.`,
          });
        }
      }
    }

    const applied = await vscode.workspace.applyEdit(wsEdit);
    if (applied) {
      this.editHistory.splice(batchIndex, 1);
      this.postMessage({
        type: 'systemMessage',
        text: `Reverted batch: ${batch!.description}`,
      });
      this.postMessage({ type: 'batchUndone', batchId });
    } else {
      this.postMessage({ type: 'error', text: 'Failed to undo edits.' });
    }
  }

  private async readFiles(
    paths: string[],
  ): Promise<Array<{ path: string; content: string; language: string }>> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length === 0) return [];

    const rootUri = workspaceFolders[0]!.uri;
    const results: Array<{ path: string; content: string; language: string }> = [];

    for (const filePath of paths) {
      try {
        const fileUri = vscode.Uri.joinPath(rootUri, filePath);
        const doc = await vscode.workspace.openTextDocument(fileUri);
        // Cap file content at 10k chars to avoid token overflow
        const content = doc.getText().slice(0, 10000);
        results.push({
          path: filePath,
          content,
          language: doc.languageId,
        });
      } catch {
        results.push({
          path: filePath,
          content: `(file not found: ${filePath})`,
          language: 'plaintext',
        });
      }
    }

    return results;
  }

  private getOpenEditorsContext(): string {
    const editors = vscode.window.visibleTextEditors;
    if (editors.length === 0) return '';

    const lines: string[] = ['Open files:'];
    for (const editor of editors.slice(0, 5)) {
      const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
      lines.push(`- ${relativePath} (${editor.document.languageId})`);
    }
    return lines.join('\n');
  }

  private inferLanguage(ext: string): string {
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      css: 'css',
      html: 'html',
      json: 'json',
      md: 'markdown',
    };
    return map[ext] ?? 'plaintext';
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
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
