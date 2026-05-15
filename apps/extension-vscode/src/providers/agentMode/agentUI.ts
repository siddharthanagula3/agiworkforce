/**
 * agentUI.ts — Approval dialogs, diff previews, patch/edit application, and undo.
 * No LLM calls; purely VS Code UI + filesystem side effects.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getActiveWorkspaceFolderSync } from '../../utils/workspaceFolders';
import { getCheckpointManager } from '../../services/checkpointManager';
import {
  applyPatchBatch,
  storeBatchForUndo,
  undoPatchBatch as undoPatchBatchEngine,
  applyPatchAggressive,
  showOriginalContext,
  getPatchOutputChannel,
  type PatchBlock,
  type BatchResult,
} from '../../services/patchEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileEdit {
  filePath: string;
  uri: vscode.Uri;
  originalContent: string;
  newContent: string;
  language: string;
}

export interface EditBatch {
  id: string;
  timestamp: number;
  edits: FileEdit[];
  description: string;
}

// ─── AgentUI ─────────────────────────────────────────────────────────────────

export class AgentUI {
  private editHistory: EditBatch[] = [];
  private patchBatchHistory: BatchResult[] = [];

  constructor(
    private readonly originalContents: Map<string, string>,
    private readonly modifiedContents: Map<string, string>,
    private readonly postMessage: (msg: Record<string, unknown>) => void,
  ) {}

  getEditHistory(): EditBatch[] {
    return this.editHistory;
  }

  getPatchBatchHistory(): BatchResult[] {
    return this.patchBatchHistory;
  }

  reset(): void {
    this.editHistory = [];
    this.patchBatchHistory = [];
  }

  async handleEditRequests(
    editRequests: Array<{ filePath: string; content: string }>,
  ): Promise<void> {
    // SECURITY (VSCODE-02): block auto-apply in untrusted workspaces.
    if (!vscode.workspace.isTrusted) {
      const confirm = await vscode.window.showWarningMessage(
        'AGI Workforce: This workspace is untrusted. Applying AI-generated edits in an untrusted workspace is blocked for your security.',
        { modal: true },
        'Trust Workspace and Proceed',
      );
      if (confirm !== 'Trust Workspace and Proceed') {
        this.postMessage({
          type: 'systemMessage',
          text: 'Edit blocked: workspace is untrusted. Trust the workspace to apply AI edits.',
        });
        return;
      }
    }

    const folder = getActiveWorkspaceFolderSync();
    if (folder === undefined) {
      this.postMessage({
        type: 'error',
        text: 'No active workspace folder. Open a file to anchor multi-root operations.',
      });
      return;
    }

    const rootUri = folder.uri;
    const edits: FileEdit[] = [];

    for (const req of editRequests) {
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
        originalContent = '';
        const ext = req.filePath.split('.').pop() ?? '';
        language = inferLanguage(ext);
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

    const ACCEPT_ALL_LABEL = '$(check-all) Accept All Changes';
    const REJECT_ALL_LABEL = '$(close-all) Reject All Changes';

    type EditPickItem = vscode.QuickPickItem & { edit?: FileEdit };

    const pickItems: EditPickItem[] = [
      { label: ACCEPT_ALL_LABEL, description: `Apply all ${edits.length} file(s) without review` },
      { label: REJECT_ALL_LABEL, description: 'Discard all proposed changes' },
      { label: '', kind: vscode.QuickPickItemKind.Separator },
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

    if (selected.some((s) => s.label === ACCEPT_ALL_LABEL)) {
      await this.applyEdits(edits, batchId, edits.length);
      return;
    }

    if (selected.some((s) => s.label === REJECT_ALL_LABEL)) {
      this.postMessage({ type: 'systemMessage', text: 'All proposed changes rejected.' });
      return;
    }

    const selectedEdits = selected
      .filter((s): s is EditPickItem & { edit: FileEdit } => s.edit !== undefined)
      .map((s) => s.edit);

    if (selectedEdits.length === 0) {
      this.postMessage({ type: 'systemMessage', text: 'No files selected. Edits cancelled.' });
      return;
    }

    for (const edit of selectedEdits) {
      const originalUri = edit.uri.with({ scheme: 'agi-original', query: batchId });
      const modifiedUri = edit.uri.with({ scheme: 'agi-modified', query: batchId });

      this.originalContents.set(originalUri.toString(), edit.originalContent);
      this.modifiedContents.set(modifiedUri.toString(), edit.newContent);

      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        modifiedUri,
        `AGI Agent: ${edit.filePath} (Preview)`,
        { preview: true },
      );
    }

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

  async handlePatchRequests(patchRequests: PatchBlock[]): Promise<void> {
    // SECURITY (VSCODE-02): same trust guard as handleEditRequests.
    if (!vscode.workspace.isTrusted) {
      const confirm = await vscode.window.showWarningMessage(
        'AGI Workforce: This workspace is untrusted. Applying AI-generated patches in an untrusted workspace is blocked for your security.',
        { modal: true },
        'Trust Workspace and Proceed',
      );
      if (confirm !== 'Trust Workspace and Proceed') {
        this.postMessage({
          type: 'systemMessage',
          text: 'Patch blocked: workspace is untrusted. Trust the workspace to apply AI patches.',
        });
        return;
      }
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length === 0) {
      this.postMessage({ type: 'error', text: 'No workspace folder open.' });
      return;
    }

    const fileSet = new Set(patchRequests.map((p) => p.filePath));
    const fileCount = fileSet.size;
    const hunkCount = patchRequests.length;

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

    const checkpointMgr = getCheckpointManager();
    if (checkpointMgr !== undefined) {
      const fileList = [...new Set(patchesToApply.map((p) => p.filePath))].join(', ');
      await checkpointMgr.createCheckpoint(`Before patch: ${fileList}`.slice(0, 100));
    }

    const result = await applyPatchBatch(patchesToApply);

    storeBatchForUndo(result);
    this.patchBatchHistory.push(result);

    const appliedCount = result.applied.length;
    const failedCount = result.failed.length;
    const confidenceSummary = buildConfidenceSummary(result);

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

      await this.handleFailedPatches(result.failed, patchesToApply);
    }
  }

  async handleUndoPatchBatch(batchId: string): Promise<void> {
    const success = await undoPatchBatchEngine(batchId);
    if (success) {
      this.patchBatchHistory = this.patchBatchHistory.filter((b) => b.batchId !== batchId);
      this.postMessage({ type: 'systemMessage', text: `Reverted patch batch ${batchId}.` });
      this.postMessage({ type: 'batchUndone', batchId });
    } else {
      this.postMessage({
        type: 'error',
        text: `Failed to undo patch batch ${batchId}. Some files may have been moved or deleted.`,
      });
    }
  }

  async applyEdits(
    approvedEdits: FileEdit[],
    batchId: string,
    totalProposed: number,
  ): Promise<void> {
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

  async undoBatch(batchId: string): Promise<void> {
    const batchIndex = this.editHistory.findIndex((b) => b.id === batchId);
    if (batchIndex === -1) {
      this.postMessage({ type: 'error', text: 'Batch not found in history.' });
      return;
    }

    const batch = this.editHistory[batchIndex]!;
    const wsEdit = new vscode.WorkspaceEdit();

    for (const edit of batch.edits) {
      if (edit.originalContent === '') {
        wsEdit.deleteFile(edit.uri);
      } else {
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
      this.postMessage({ type: 'systemMessage', text: `Reverted batch: ${batch.description}` });
      this.postMessage({ type: 'batchUndone', batchId });
    } else {
      this.postMessage({ type: 'error', text: 'Failed to undo edits.' });
    }
  }

  // ─── Failed patch recovery ──────────────────────────────────────────────────

  private async handleFailedPatches(
    failedPatches: Array<PatchBlock & { error: string }>,
    _allPatches: PatchBlock[],
  ): Promise<void> {
    const outputChannel = getPatchOutputChannel();

    for (const failedPatch of failedPatches) {
      outputChannel.appendLine(`--- FAILED PATCH ---`);
      outputChannel.appendLine(`File: ${failedPatch.filePath}`);
      outputChannel.appendLine(`Error: ${failedPatch.error}`);
      outputChannel.appendLine(`Search text (${failedPatch.search.length} chars):`);
      outputChannel.appendLine(failedPatch.search);
      outputChannel.appendLine(`Replace text (${failedPatch.replace.length} chars):`);
      outputChannel.appendLine(failedPatch.replace);
      outputChannel.appendLine(`---`);

      const choice = await vscode.window.showWarningMessage(
        `Patch failed for ${failedPatch.filePath}: ${failedPatch.error}`,
        'Show Failed Patch',
        'Apply Manually',
        'Retry with Fuzzy',
        'Show Logs',
      );

      if (choice === 'Show Failed Patch') {
        await this.showFailedPatchContent(failedPatch);
      } else if (choice === 'Apply Manually') {
        await this.openManualDiffEditor(failedPatch);
      } else if (choice === 'Retry with Fuzzy') {
        await this.retryWithAggressiveFuzzy(failedPatch);
      } else if (choice === 'Show Logs') {
        outputChannel.show(true);
      }
    }
  }

  private async showFailedPatchContent(patch: PatchBlock & { error: string }): Promise<void> {
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

    const doc = await vscode.workspace.openTextDocument({ content, language: 'diff' });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  private async openManualDiffEditor(patch: PatchBlock & { error: string }): Promise<void> {
    const folder = getActiveWorkspaceFolderSync();
    if (folder === undefined) return;

    const rootUri = folder.uri;
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

    const intendedContent = currentContent.replace(patch.search, patch.replace);

    if (intendedContent === currentContent && patch.search !== '') {
      await showOriginalContext(patch.search, currentContent.substring(0, 500), patch.filePath);
      return;
    }

    const originalUri = fileUri.with({ scheme: 'agi-original', query: `manual-${Date.now()}` });
    const modifiedUri = fileUri.with({ scheme: 'agi-modified', query: `manual-${Date.now()}` });

    this.originalContents.set(originalUri.toString(), currentContent);
    this.modifiedContents.set(modifiedUri.toString(), intendedContent);

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      `Manual Apply: ${patch.filePath}`,
      { preview: true },
    );

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

  private async retryWithAggressiveFuzzy(patch: PatchBlock & { error: string }): Promise<void> {
    const folder = getActiveWorkspaceFolderSync();
    if (folder === undefined) return;

    const rootUri = folder.uri;
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
      this.postMessage({ type: 'error', text: `Cannot open ${patch.filePath} for retry.` });
      return;
    }

    const result = applyPatchAggressive(document, patch);

    if (result.success && result.range !== undefined) {
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
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function buildConfidenceSummary(result: BatchResult): string {
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

export function inferLanguage(ext: string): string {
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
