/**
 * agentModeProvider.ts — Agent mode with multi-file edit capability
 *
 * Opens a webview panel where the user can chat with the AI agent.
 * The agent can read multiple files, suggest edits across files,
 * and apply them with diff preview and batch undo support.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { chatCompletion, type LlmChatMessage } from '../utils/api';
import { WorkspaceIndexer } from '../services/workspaceIndexer';
import { getContextBuilder } from '../services/contextBuilder';
import * as telemetry from '../services/telemetry';
import {
  parsePatchBlocks,
  applyPatchBatch,
  storeBatchForUndo,
  undoPatchBatch as undoPatchBatchEngine,
  applyPatchAggressive,
  showOriginalContext,
  getPatchOutputChannel,
  type PatchBlock,
  type BatchResult,
} from '../services/patchEngine';
import { getContextPanelProvider } from './contextPanelProvider';
import { getContextBudget } from '../services/contextBudget';
import { getCheckpointManager } from '../services/checkpointManager';

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

  private messages: LlmChatMessage[] = [];
  private editHistory: EditBatch[] = [];
  private patchBatchHistory: BatchResult[] = [];
  private isProcessing = false;
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
          case 'undoPatchBatch':
            if (message.batchId) {
              await this.handleUndoPatchBatch(message.batchId);
            }
            break;
          case 'clearHistory':
            this.messages = [];
            this.editHistory = [];
            this.patchBatchHistory = [];
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
      'To edit a file, use search-and-replace patches (PREFERRED):',
      '```patch:path/to/file.ts',
      '<<<<<<< SEARCH',
      'exact existing code to find',
      '=======',
      'replacement code',
      '>>>>>>> REPLACE',
      '```',
      '',
      'Rules for patches:',
      '- The SEARCH block must match exactly in the file.',
      '- You can include multiple SEARCH/REPLACE blocks per file.',
      '- Always read a file before editing it.',
      '- Only include the code that changes, not the entire file.',
      '- An empty SEARCH block means insert at beginning of file.',
      '- An empty REPLACE block means delete the matched text.',
      '',
      'Legacy format (for full file replacement):',
      '```edit:path/to/file.ts',
      '<complete new file content here>',
      '```',
      '',
      'You can include multiple @read, ```patch, and ```edit blocks in a single response.',
      'Prefer ```patch over ```edit — it is more efficient and less error-prone.',
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

    try {
      this.isProcessing = true;

      // Reset iteration counter on each new user message (new agent session).
      this._iterationCount = 0;

      this.postMessage({ type: 'userMessage', text });
      this.postMessage({ type: 'thinking', active: true });

      this.messages.push({ role: 'user', content: text });

      try {
        // Gather workspace context with model-aware budget
        if (this.indexer.isStale()) {
          await this.indexer.index();
        }
        const budget = getContextBudget('agent');
        const wsContext = this.indexer.getRelevantContext(text, budget.indexerChars);

        // Include open editor context
        const editorContext = this.getOpenEditorsContext();

        // Include rich context (diagnostics, git, workspace structure)
        const richContext = await getContextBuilder().buildFullContext({ includeOpenFiles: false });

        // Include pinned files from ContextPanel (wired into actual prompt)
        const pinnedContext = this.getPinnedFilesContext();

        // Build augmented message
        const augmentedMessages = [...this.messages];
        if (wsContext || editorContext || richContext || pinnedContext) {
          const contextMsg = [pinnedContext, wsContext, editorContext, richContext]
            .filter(Boolean)
            .join('\n\n');
          augmentedMessages.splice(1, 0, {
            role: 'system',
            content: `Current workspace context:\n${contextMsg}`,
          });
        }

        // Get LLM response (dispose token source even if chatCompletion throws)
        const cancelSource = new vscode.CancellationTokenSource();
        let response: string;
        try {
          response = await chatCompletion(this.secrets, augmentedMessages, cancelSource.token);
        } finally {
          cancelSource.dispose();
        }

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

        // Check for patch blocks (new format) first, then legacy edit blocks
        const patchRequests = parsePatchBlocks(response);
        const editRequests = parseFileEdits(response);

        if (patchRequests.length > 0) {
          this.postMessage({ type: 'assistantMessage', text: response });
          this.postMessage({ type: 'thinking', active: false });
          await this.handlePatchRequests(patchRequests);
        } else if (editRequests.length > 0) {
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
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleAgentContinue(): Promise<void> {
    if (this.isProcessing) return;

    // Enforce per-session iteration cap to prevent runaway autonomous loops.
    this._iterationCount += 1;
    const maxIterations =
      vscode.workspace.getConfiguration('agiWorkforce').get<number>('agent.maxIterations') ??
      AgentModePanel.DEFAULT_MAX_ITERATIONS;

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
        return;
      }
      // User approved — reset counter so they get another N iterations before
      // the next warning rather than being prompted on every subsequent call.
      this._iterationCount = 1;
    }

    try {
      this.isProcessing = true;

      this.postMessage({ type: 'thinking', active: true });

      try {
        const cancelSource = new vscode.CancellationTokenSource();
        let response: string;
        try {
          response = await chatCompletion(this.secrets, this.messages, cancelSource.token);
        } finally {
          cancelSource.dispose();
        }

        this.messages.push({ role: 'assistant', content: response });

        const patchRequests = parsePatchBlocks(response);
        const editRequests = parseFileEdits(response);
        this.postMessage({ type: 'assistantMessage', text: response });
        this.postMessage({ type: 'thinking', active: false });

        if (patchRequests.length > 0) {
          await this.handlePatchRequests(patchRequests);
        } else if (editRequests.length > 0) {
          await this.handleEditRequests(editRequests);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.postMessage({ type: 'error', text: message });
        this.postMessage({ type: 'thinking', active: false });
      }
    } finally {
      this.isProcessing = false;
    }
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
      // Validate that the LLM-provided path stays within the workspace root
      const resolvedPath = path.resolve(rootUri.fsPath, req.filePath);
      if (!resolvedPath.startsWith(rootUri.fsPath + path.sep) && resolvedPath !== rootUri.fsPath) {
        throw new Error('Path traversal detected: file path outside workspace');
      }
      const fileUri = vscode.Uri.file(resolvedPath);
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

    const batchId = `batch-${Date.now()}`;

    // Show QuickPick FIRST so the user decides which files to review/apply
    // before any diff tabs are opened.
    const ACCEPT_ALL_LABEL = '$(check-all) Accept All Changes';
    const REJECT_ALL_LABEL = '$(close-all) Reject All Changes';
    const SEPARATOR_LABEL = '';

    type EditPickItem = vscode.QuickPickItem & { edit?: FileEdit };

    const pickItems: EditPickItem[] = [
      { label: ACCEPT_ALL_LABEL, description: `Apply all ${edits.length} file(s) without review` },
      { label: REJECT_ALL_LABEL, description: 'Discard all proposed changes' },
      { label: SEPARATOR_LABEL, kind: vscode.QuickPickItemKind.Separator },
      ...edits.map((e) => ({
        label: e.filePath,
        description: e.originalContent === '' ? '(new file)' : '(modified)',
        picked: true,
        edit: e,
      })),
    ];

    const selected = await vscode.window.showQuickPick(pickItems, {
      title: `AGI Agent: ${edits.length} proposed change(s) — select files to review & apply`,
      canPickMany: true,
      placeHolder: 'Check files to apply, or pick Accept All / Reject All',
    });

    if (selected === undefined || selected.length === 0) {
      this.postMessage({ type: 'systemMessage', text: 'Edits cancelled.' });
      return;
    }

    // Handle Accept All
    if (selected.some((s) => s.label === ACCEPT_ALL_LABEL)) {
      await this.applyEdits(edits, batchId, edits.length);
      return;
    }

    // Handle Reject All
    if (selected.some((s) => s.label === REJECT_ALL_LABEL)) {
      this.postMessage({ type: 'systemMessage', text: 'All proposed changes rejected.' });
      return;
    }

    // User picked individual files — open diff tabs only for those
    const selectedEdits = selected
      .filter((s): s is EditPickItem & { edit: FileEdit } => s.edit !== undefined)
      .map((s) => s.edit);

    if (selectedEdits.length === 0) {
      this.postMessage({ type: 'systemMessage', text: 'No files selected. Edits cancelled.' });
      return;
    }

    // Open diff previews only for the selected files
    for (const edit of selectedEdits) {
      const originalUri = edit.uri.with({ scheme: 'agi-original', query: batchId });
      const modifiedUri = edit.uri.with({ scheme: 'agi-modified', query: batchId });

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

    // After reviewing diffs, confirm apply
    const confirmChoice = await vscode.window.showInformationMessage(
      `Apply changes to ${selectedEdits.length} file(s)?`,
      { modal: false },
      'Apply',
      'Cancel',
    );

    if (confirmChoice === 'Apply') {
      await this.applyEdits(selectedEdits, batchId, edits.length);
    } else {
      this.postMessage({ type: 'systemMessage', text: 'Edits cancelled after review.' });
    }
  }

  private async handlePatchRequests(patchRequests: PatchBlock[]): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length === 0) {
      this.postMessage({ type: 'error', text: 'No workspace folder open.' });
      return;
    }

    // Group by file for display.
    const fileSet = new Set(patchRequests.map((p) => p.filePath));
    const fileCount = fileSet.size;
    const hunkCount = patchRequests.length;

    // Show QuickPick to let user decide.
    const ACCEPT_LABEL = '$(check-all) Apply All Patches';
    const REJECT_LABEL = '$(close-all) Reject All Patches';

    const pickItems: vscode.QuickPickItem[] = [
      {
        label: ACCEPT_LABEL,
        description: `Apply ${hunkCount} patch(es) across ${fileCount} file(s)`,
      },
      { label: REJECT_LABEL, description: 'Discard all proposed patches' },
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      ...[...fileSet].map((fp) => {
        const count = patchRequests.filter((p) => p.filePath === fp).length;
        return { label: fp, description: `${count} patch(es)`, picked: true };
      }),
    ];

    const selected = await vscode.window.showQuickPick(pickItems, {
      title: `AGI Agent: ${hunkCount} patch(es) across ${fileCount} file(s)`,
      canPickMany: true,
      placeHolder: 'Select files to patch, or pick Apply All / Reject All',
    });

    if (selected === undefined || selected.length === 0) {
      this.postMessage({ type: 'systemMessage', text: 'Patches cancelled.' });
      return;
    }

    if (selected.some((s) => s.label === REJECT_LABEL)) {
      this.postMessage({ type: 'systemMessage', text: 'All proposed patches rejected.' });
      return;
    }

    // Determine which patches to apply.
    let patchesToApply: PatchBlock[];
    if (selected.some((s) => s.label === ACCEPT_LABEL)) {
      patchesToApply = patchRequests;
    } else {
      const selectedFiles = new Set(selected.map((s) => s.label));
      patchesToApply = patchRequests.filter((p) => selectedFiles.has(p.filePath));
    }

    if (patchesToApply.length === 0) {
      this.postMessage({ type: 'systemMessage', text: 'No patches selected.' });
      return;
    }

    // Create checkpoint before applying patches.
    const checkpointMgr = getCheckpointManager();
    if (checkpointMgr !== undefined) {
      const fileList = [...new Set(patchesToApply.map((p) => p.filePath))].join(', ');
      await checkpointMgr.createCheckpoint(`Before patch: ${fileList}`.slice(0, 100));
    }

    // Apply patches.
    const result = await applyPatchBatch(patchesToApply);

    // Store for undo.
    storeBatchForUndo(result);
    this.patchBatchHistory.push(result);

    // Report results with confidence indicators.
    const appliedCount = result.applied.length;
    const failedCount = result.failed.length;

    // Build confidence summary for applied patches.
    const confidenceSummary = this._buildConfidenceSummary(result);

    if (failedCount === 0) {
      this.postMessage({
        type: 'editsApplied',
        batchId: result.batchId,
        files: [...new Set(result.applied.map((p) => p.filePath))],
      });
      this.postMessage({
        type: 'systemMessage',
        text: `Applied ${appliedCount} patch(es) successfully.${confidenceSummary} Use "Undo Batch" to revert.`,
      });
    } else {
      if (appliedCount > 0) {
        this.postMessage({
          type: 'editsApplied',
          batchId: result.batchId,
          files: [...new Set(result.applied.map((p) => p.filePath))],
        });
      }

      const failedMsg = result.failed.map((f) => `  ${f.filePath}: ${f.error}`).join('\n');
      this.postMessage({
        type: 'systemMessage',
        text:
          `Applied ${appliedCount}/${appliedCount + failedCount} patches.${confidenceSummary} ` +
          `${failedCount} failed:\n${failedMsg}`,
      });

      // Show failure recovery actions for each failed patch.
      await this._handleFailedPatches(result.failed, patchesToApply);
    }
  }

  /**
   * Build a human-readable confidence summary for applied patches.
   */
  private _buildConfidenceSummary(result: BatchResult): string {
    const highCount = result.applied.filter((p) => p.confidence === 'high').length;
    const mediumCount = result.applied.filter((p) => p.confidence === 'medium').length;
    const lowCount = result.applied.filter((p) => p.confidence === 'low').length;

    const parts: string[] = [];
    if (highCount > 0) parts.push(`${highCount} high`);
    if (mediumCount > 0) parts.push(`${mediumCount} medium`);
    if (lowCount > 0) parts.push(`${lowCount} low`);

    if (parts.length === 0) return '';
    return ` Confidence: ${parts.join(', ')}.`;
  }

  /**
   * Handle failed patches by offering recovery actions:
   * - Show Failed Patch: opens raw patch content in a new editor tab
   * - Apply Manually: opens a diff editor with the intended change
   * - Retry with Fuzzy: tries again with aggressive fuzzy matching
   */
  private async _handleFailedPatches(
    failedPatches: Array<PatchBlock & { error: string }>,
    _allPatches: PatchBlock[],
  ): Promise<void> {
    const outputChannel = getPatchOutputChannel();

    for (const failedPatch of failedPatches) {
      // Log failure details to output channel.
      outputChannel.appendLine(`--- FAILED PATCH ---`);
      outputChannel.appendLine(`File: ${failedPatch.filePath}`);
      outputChannel.appendLine(`Error: ${failedPatch.error}`);
      outputChannel.appendLine(`Search text (${failedPatch.search.length} chars):`);
      outputChannel.appendLine(failedPatch.search);
      outputChannel.appendLine(`Replace text (${failedPatch.replace.length} chars):`);
      outputChannel.appendLine(failedPatch.replace);
      outputChannel.appendLine(`---`);

      // Show notification with recovery actions.
      const choice = await vscode.window.showWarningMessage(
        `Patch failed for ${failedPatch.filePath}: ${failedPatch.error}`,
        'Show Failed Patch',
        'Apply Manually',
        'Retry with Fuzzy',
        'Show Logs',
      );

      if (choice === 'Show Failed Patch') {
        await this._showFailedPatchContent(failedPatch);
      } else if (choice === 'Apply Manually') {
        await this._openManualDiffEditor(failedPatch);
      } else if (choice === 'Retry with Fuzzy') {
        await this._retryWithAggressiveFuzzy(failedPatch);
      } else if (choice === 'Show Logs') {
        outputChannel.show(true);
      }
    }
  }

  /**
   * Show the raw patch content in a new editor tab for inspection.
   */
  private async _showFailedPatchContent(patch: PatchBlock & { error: string }): Promise<void> {
    const content = [
      `# Failed Patch: ${patch.filePath}`,
      `# Error: ${patch.error}`,
      '',
      '<<<<<<< SEARCH',
      patch.search,
      '=======',
      patch.replace,
      '>>>>>>> REPLACE',
    ].join('\n');

    const doc = await vscode.workspace.openTextDocument({
      content,
      language: 'diff',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  /**
   * Open a diff editor showing the intended change so the user can apply it manually.
   */
  private async _openManualDiffEditor(patch: PatchBlock & { error: string }): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length === 0) return;

    const rootUri = workspaceFolders[0]!.uri;

    // Validate that the path stays within the workspace root (prevent path traversal)
    const resolvedPath = path.resolve(rootUri.fsPath, patch.filePath);
    if (!resolvedPath.startsWith(rootUri.fsPath + path.sep) && resolvedPath !== rootUri.fsPath) {
      this.postMessage({
        type: 'error',
        text: `Path traversal blocked: ${patch.filePath} resolves outside workspace.`,
      });
      return;
    }
    const fileUri = vscode.Uri.file(resolvedPath);

    let currentContent: string;
    try {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      currentContent = doc.getText();
    } catch {
      this.postMessage({
        type: 'error',
        text: `Cannot open ${patch.filePath} for manual editing.`,
      });
      return;
    }

    // Create the intended content by applying the search/replace
    const intendedContent = currentContent.replace(patch.search, patch.replace);

    // If the search text was not found, show what the patch expected
    if (intendedContent === currentContent && patch.search !== '') {
      await showOriginalContext(patch.search, currentContent.substring(0, 500), patch.filePath);
      return;
    }

    // Open diff view
    const originalUri = fileUri.with({ scheme: 'agi-original', query: `manual-${Date.now()}` });
    const modifiedUri = fileUri.with({ scheme: 'agi-modified', query: `manual-${Date.now()}` });

    this._originalContents.set(originalUri.toString(), currentContent);
    this._modifiedContents.set(modifiedUri.toString(), intendedContent);

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      `Manual Apply: ${patch.filePath}`,
      { preview: true },
    );

    // Ask if user wants to apply
    const applyChoice = await vscode.window.showInformationMessage(
      `Apply the intended change to ${patch.filePath}?`,
      'Apply',
      'Cancel',
    );

    if (applyChoice === 'Apply') {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
      const wsEdit = new vscode.WorkspaceEdit();
      wsEdit.replace(fileUri, fullRange, intendedContent);
      const applied = await vscode.workspace.applyEdit(wsEdit);
      if (applied) {
        this.postMessage({
          type: 'systemMessage',
          text: `Manually applied patch to ${patch.filePath}.`,
        });
      } else {
        this.postMessage({
          type: 'error',
          text: `Failed to manually apply patch to ${patch.filePath}.`,
        });
      }
    }
  }

  /**
   * Retry a failed patch with aggressive fuzzy matching
   * (ignore all whitespace, case-insensitive).
   */
  private async _retryWithAggressiveFuzzy(patch: PatchBlock & { error: string }): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length === 0) return;

    const rootUri = workspaceFolders[0]!.uri;

    // Validate that the path stays within the workspace root (prevent path traversal)
    const resolvedPath = path.resolve(rootUri.fsPath, patch.filePath);
    if (!resolvedPath.startsWith(rootUri.fsPath + path.sep) && resolvedPath !== rootUri.fsPath) {
      this.postMessage({
        type: 'error',
        text: `Path traversal blocked: ${patch.filePath} resolves outside workspace.`,
      });
      return;
    }
    const fileUri = vscode.Uri.file(resolvedPath);

    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(fileUri);
    } catch {
      this.postMessage({
        type: 'error',
        text: `Cannot open ${patch.filePath} for retry.`,
      });
      return;
    }

    const result = applyPatchAggressive(document, patch);

    if (result.success && result.range !== undefined) {
      // Show what was matched for review
      const confidenceIcon =
        result.confidence === 'high'
          ? '$(pass-filled)'
          : result.confidence === 'medium'
            ? '$(warning)'
            : '$(error)';

      const confirmChoice = await vscode.window.showWarningMessage(
        `${confidenceIcon} Aggressive fuzzy match found (${result.confidence} confidence, ${(result.whitespaceDiffPercent ?? 0).toFixed(1)}% diff). Apply?`,
        'Apply',
        'Show Context',
        'Cancel',
      );

      if (confirmChoice === 'Apply') {
        const wsEdit = new vscode.WorkspaceEdit();
        wsEdit.replace(fileUri, result.range, patch.replace);
        const applied = await vscode.workspace.applyEdit(wsEdit);
        if (applied) {
          this.postMessage({
            type: 'systemMessage',
            text: `Applied patch to ${patch.filePath} with aggressive fuzzy matching (${result.confidence} confidence).`,
          });
        } else {
          this.postMessage({
            type: 'error',
            text: `Failed to apply fuzzy-matched patch to ${patch.filePath}.`,
          });
        }
      } else if (confirmChoice === 'Show Context' && result.expectedText && result.matchedText) {
        await showOriginalContext(result.expectedText, result.matchedText, patch.filePath);
      }
    } else {
      this.postMessage({
        type: 'systemMessage',
        text: `Aggressive fuzzy retry also failed for ${patch.filePath}. The code may have changed significantly.`,
      });
    }
  }

  private async handleUndoPatchBatch(batchId: string): Promise<void> {
    const success = await undoPatchBatchEngine(batchId);
    if (success) {
      this.patchBatchHistory = this.patchBatchHistory.filter((b) => b.batchId !== batchId);
      this.postMessage({
        type: 'systemMessage',
        text: `Reverted patch batch ${batchId}.`,
      });
      this.postMessage({ type: 'batchUndone', batchId });
    } else {
      this.postMessage({
        type: 'error',
        text: `Failed to undo patch batch ${batchId}. Some files may have been moved or deleted.`,
      });
    }
  }

  private async applyEdits(
    approvedEdits: FileEdit[],
    batchId: string,
    totalProposed: number,
  ): Promise<void> {
    // Create checkpoint before applying edits.
    const checkpointMgr = getCheckpointManager();
    if (checkpointMgr !== undefined) {
      const fileList = approvedEdits.map((e) => e.filePath).join(', ');
      await checkpointMgr.createCheckpoint(`Before edit: ${fileList}`.slice(0, 100));
    }

    const batch: EditBatch = {
      id: batchId,
      timestamp: Date.now(),
      edits: approvedEdits,
      description: `Edited ${approvedEdits.length} file(s): ${approvedEdits.map((e) => e.filePath).join(', ')}`,
    };

    const wsEdit = new vscode.WorkspaceEdit();

    for (const edit of approvedEdits) {
      if (edit.originalContent === '') {
        wsEdit.createFile(edit.uri, { overwrite: true });
        wsEdit.insert(edit.uri, new vscode.Position(0, 0), edit.newContent);
      } else {
        const doc = await vscode.workspace.openTextDocument(edit.uri);
        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        wsEdit.replace(edit.uri, fullRange, edit.newContent);
      }
    }

    const applied = await vscode.workspace.applyEdit(wsEdit);
    if (applied) {
      this.editHistory.push(batch);
      this.postMessage({
        type: 'editsApplied',
        batchId,
        files: approvedEdits.map((e) => e.filePath),
      });
      const skipped = totalProposed - approvedEdits.length;
      const skippedMsg = skipped > 0 ? ` (${skipped} file(s) skipped)` : '';
      this.postMessage({
        type: 'systemMessage',
        text: `Applied edits to ${approvedEdits.length} file(s)${skippedMsg}. Use "Undo Batch" to revert.`,
      });
    } else {
      this.postMessage({ type: 'error', text: 'Failed to apply edits.' });
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
        // Validate that the path stays within the workspace root (prevent path traversal)
        const resolvedPath = path.resolve(rootUri.fsPath, filePath);
        if (
          !resolvedPath.startsWith(rootUri.fsPath + path.sep) &&
          resolvedPath !== rootUri.fsPath
        ) {
          results.push({
            path: filePath,
            content: `(path traversal blocked: ${filePath} resolves outside workspace)`,
            language: 'plaintext',
          });
          continue;
        }
        const fileUri = vscode.Uri.file(resolvedPath);
        const doc = await vscode.workspace.openTextDocument(fileUri);
        // Cap file content at 50k chars; add truncation indicator so the LLM knows.
        const FILE_READ_CAP = 50_000;
        const fullContent = doc.getText();
        const truncated = fullContent.length > FILE_READ_CAP;
        const content = truncated
          ? fullContent.slice(0, FILE_READ_CAP) +
            `\n... [TRUNCATED: file is ${fullContent.length} chars, showing first ${FILE_READ_CAP}]`
          : fullContent;
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

  /**
   * Build context from pinned files in the ContextPanel.
   * This wires the previously display-only pinned files into the actual prompt.
   */
  private getPinnedFilesContext(): string {
    const provider = getContextPanelProvider();
    if (provider === undefined) return '';

    const contextFiles = provider.getContextFiles();
    if (contextFiles.length === 0) return '';

    const lines: string[] = ['Pinned/context files:'];
    for (const filePath of contextFiles.slice(0, 10)) {
      const relativePath = vscode.workspace.asRelativePath(filePath);
      lines.push(`- ${relativePath}`);
    }
    if (contextFiles.length > 10) {
      lines.push(`  ... (${contextFiles.length - 10} more)`);
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
  return crypto.randomBytes(16).toString('hex');
}
