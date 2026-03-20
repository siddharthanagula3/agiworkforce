/**
 * patchEngine.ts -- Search-and-replace patch parser and applier
 *
 * Implements the patch-edit contract defined in VSCODE_PATCH_CONTRACT.md.
 * Parses ```patch:path``` envelopes containing <<<<<<< SEARCH / ======= / >>>>>>> REPLACE
 * blocks, and applies them to VS Code documents with exact + fuzzy matching.
 *
 * Phase 1: exact match, fuzzy whitespace fallback, bottom-to-top application.
 *
 * Wave 3 enhancements:
 * - Confidence scoring: high (exact), medium (<5% diff), low (>5% diff)
 * - Aggressive fuzzy matching (ignore all whitespace, case-insensitive)
 * - "Show Original Context" support
 * - Detailed patch logging via output channel
 */

import * as vscode from 'vscode';

// ─── Output channel for patch logs ────────────────────────────────────────────

let _patchOutputChannel: vscode.OutputChannel | undefined;

export function getPatchOutputChannel(): vscode.OutputChannel {
  if (_patchOutputChannel === undefined) {
    _patchOutputChannel = vscode.window.createOutputChannel('AGI Workforce: Patches');
  }
  return _patchOutputChannel;
}

function logPatch(message: string): void {
  const channel = getPatchOutputChannel();
  const timestamp = new Date().toISOString();
  channel.appendLine(`[${timestamp}] ${message}`);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type PatchConfidence = 'high' | 'medium' | 'low';

export interface PatchBlock {
  /** Relative path from workspace root. */
  filePath: string;
  /** Text to search for. Empty string = insert at beginning of file. */
  search: string;
  /** Replacement text. Empty string = delete the matched region. */
  replace: string;
}

export interface PatchResult {
  success: boolean;
  /** The matched range in the document (only set on success). */
  range?: vscode.Range;
  /** Error description (only set on failure). */
  error?: string;
  /** True if the match was fuzzy (whitespace-normalized) rather than exact. */
  fuzzy?: boolean;
  /** Confidence level of the match. */
  confidence?: PatchConfidence;
  /** Whitespace difference percentage (0-100) for fuzzy matches. */
  whitespaceDiffPercent?: number;
  /** The text that was actually matched in the document (for "Show Original Context"). */
  matchedText?: string;
  /** The search text from the patch (for "Show Original Context"). */
  expectedText?: string;
}

export interface BatchResult {
  batchId: string;
  applied: Array<PatchBlock & { confidence?: PatchConfidence }>;
  failed: Array<PatchBlock & { error: string }>;
  /** Snapshots of original file content keyed by file path, for undo. */
  snapshots: Map<string, string>;
  /** Per-patch results for detailed reporting. */
  patchResults?: PatchResult[];
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse patch blocks from an LLM response.
 *
 * Expected format (one or more):
 * ```patch:path/to/file.ts
 * <<<<<<< SEARCH
 * exact text to find
 * =======
 * replacement text
 * >>>>>>> REPLACE
 * ```
 *
 * A single patch envelope may contain multiple SEARCH/REPLACE blocks.
 */
export function parsePatchBlocks(text: string): PatchBlock[] {
  const blocks: PatchBlock[] = [];

  // Match ```patch:filepath ... ``` envelopes.
  // The regex captures the filepath and the inner content.
  const envelopePattern = /```patch:([^\n]+)\n([\s\S]*?)```/g;
  let envelopeMatch: RegExpExecArray | null;

  while ((envelopeMatch = envelopePattern.exec(text)) !== null) {
    const filePath = envelopeMatch[1]?.trim();
    const body = envelopeMatch[2] ?? '';

    if (!filePath) continue;

    // Within the envelope, find all SEARCH/REPLACE pairs.
    const hunkPattern = /<<<<<<< SEARCH\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> REPLACE/g;
    let hunkMatch: RegExpExecArray | null;

    while ((hunkMatch = hunkPattern.exec(body)) !== null) {
      // Trim trailing newline from search/replace but preserve internal structure.
      const search = trimTrailingNewline(hunkMatch[1] ?? '');
      const replace = trimTrailingNewline(hunkMatch[2] ?? '');

      blocks.push({ filePath, search, replace });
    }
  }

  return blocks;
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

/**
 * Calculate the whitespace difference percentage between two strings.
 * Returns 0 for identical strings, higher values for more differences.
 */
function calculateWhitespaceDiffPercent(original: string, matched: string): number {
  if (original === matched) return 0;

  const normalizeWs = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const origNorm = normalizeWs(original);
  const matchNorm = normalizeWs(matched);

  if (origNorm === matchNorm) {
    // Only whitespace differs — calculate how much
    const origWs = (original.match(/\s/g) ?? []).length;
    const matchWs = (matched.match(/\s/g) ?? []).length;
    const totalChars = Math.max(original.length, matched.length, 1);
    return (Math.abs(origWs - matchWs) / totalChars) * 100;
  }

  // Content also differs — higher difference
  const maxLen = Math.max(origNorm.length, matchNorm.length, 1);
  let diffChars = 0;
  for (let i = 0; i < maxLen; i++) {
    if (origNorm[i] !== matchNorm[i]) diffChars++;
  }
  return (diffChars / maxLen) * 100;
}

/**
 * Determine confidence level based on match type and whitespace difference.
 */
function determineConfidence(fuzzy: boolean, whitespaceDiffPercent: number): PatchConfidence {
  if (!fuzzy) return 'high';
  if (whitespaceDiffPercent < 5) return 'medium';
  return 'low';
}

// ─── Single patch application ────────────────────────────────────────────────

/**
 * Apply a single search-and-replace patch to a document.
 *
 * Strategy:
 * 1. If search is empty, this is an insert-at-beginning operation.
 * 2. Try exact match.
 * 3. Fall back to fuzzy match (normalized whitespace).
 * 4. Return failure if neither works.
 */
export function applyPatch(document: vscode.TextDocument, patch: PatchBlock): PatchResult {
  const docText = document.getText();

  logPatch(
    `Applying patch to ${patch.filePath}: search ${patch.search.length} chars, replace ${patch.replace.length} chars`,
  );

  // ── Insert at beginning (empty search) ──────────────────────────────────
  if (patch.search === '') {
    logPatch(`  -> Insert at beginning (empty search)`);
    return {
      success: true,
      range: new vscode.Range(0, 0, 0, 0),
      fuzzy: false,
      confidence: 'high',
      whitespaceDiffPercent: 0,
      expectedText: '',
      matchedText: '',
    };
  }

  // ── Exact match ──────────────────────────────────────────────────────────
  const exactIndex = docText.indexOf(patch.search);
  if (exactIndex !== -1) {
    const startPos = document.positionAt(exactIndex);
    const endPos = document.positionAt(exactIndex + patch.search.length);
    const matchedText = docText.substring(exactIndex, exactIndex + patch.search.length);
    logPatch(`  -> Exact match at line ${startPos.line}, confidence: high`);
    return {
      success: true,
      range: new vscode.Range(startPos, endPos),
      fuzzy: false,
      confidence: 'high',
      whitespaceDiffPercent: 0,
      matchedText,
      expectedText: patch.search,
    };
  }

  // ── Fuzzy match (whitespace-normalized) ──────────────────────────────────
  const fuzzyResult = fuzzyMatch(docText, patch.search);
  if (fuzzyResult !== undefined) {
    const matchedText = docText.substring(
      document.offsetAt(fuzzyResult.start),
      document.offsetAt(fuzzyResult.end),
    );
    const wsDiff = calculateWhitespaceDiffPercent(patch.search, matchedText);
    const confidence = determineConfidence(true, wsDiff);
    logPatch(
      `  -> Fuzzy match at line ${fuzzyResult.start.line}, ws diff: ${wsDiff.toFixed(1)}%, confidence: ${confidence}`,
    );
    return {
      success: true,
      range: fuzzyResult,
      fuzzy: true,
      confidence,
      whitespaceDiffPercent: wsDiff,
      matchedText,
      expectedText: patch.search,
    };
  }

  // ── No match ─────────────────────────────────────────────────────────────
  logPatch(`  -> No match found for ${patch.filePath}`);
  return {
    success: false,
    error: `Could not locate the target code block in ${patch.filePath}. The file may have changed since the patch was generated.`,
    expectedText: patch.search,
  };
}

// ─── Aggressive fuzzy matching ───────────────────────────────────────────────

/**
 * Try aggressive fuzzy matching: ignore all whitespace, case-insensitive.
 * Used as a last resort when standard fuzzy matching fails.
 */
export function aggressiveFuzzyMatch(
  docText: string,
  searchText: string,
): { range: vscode.Range; matchedText: string; whitespaceDiffPercent: number } | undefined {
  const stripAll = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

  const docStripped = stripAll(docText);
  const searchStripped = stripAll(searchText);

  if (searchStripped.length === 0) return undefined;

  const index = docStripped.indexOf(searchStripped);
  if (index === -1) return undefined;

  // Map back to original positions
  let origStart = -1;
  let origEnd = -1;
  let strippedIdx = 0;

  for (let i = 0; i < docText.length && origEnd === -1; i++) {
    const ch = docText[i]!;
    if (/\s/.test(ch)) continue;

    if (strippedIdx === index && origStart === -1) {
      origStart = i;
    }
    if (strippedIdx === index + searchStripped.length - 1) {
      origEnd = i + 1;
    }
    strippedIdx++;
  }

  if (origStart === -1 || origEnd === -1) return undefined;

  const matchedText = docText.substring(origStart, origEnd);
  const wsDiff = calculateWhitespaceDiffPercent(searchText, matchedText);

  // Create a simple range from character offsets
  // We need to convert to line/col positions
  const lines = docText.substring(0, origStart).split('\n');
  const startLine = lines.length - 1;
  const startCol = lines[startLine]?.length ?? 0;

  const endLines = docText.substring(0, origEnd).split('\n');
  const endLine = endLines.length - 1;
  const endCol = endLines[endLine]?.length ?? 0;

  return {
    range: new vscode.Range(startLine, startCol, endLine, endCol),
    matchedText,
    whitespaceDiffPercent: wsDiff,
  };
}

/**
 * Apply a patch with aggressive fuzzy matching as fallback.
 * Returns a result with 'low' confidence when aggressive matching succeeds.
 */
export function applyPatchAggressive(
  document: vscode.TextDocument,
  patch: PatchBlock,
): PatchResult {
  // First try normal application
  const normalResult = applyPatch(document, patch);
  if (normalResult.success) return normalResult;

  // Fall back to aggressive fuzzy
  logPatch(`  -> Retrying with aggressive fuzzy match for ${patch.filePath}`);
  const docText = document.getText();
  const aggressiveResult = aggressiveFuzzyMatch(docText, patch.search);

  if (aggressiveResult !== undefined) {
    logPatch(
      `  -> Aggressive match succeeded, ws diff: ${aggressiveResult.whitespaceDiffPercent.toFixed(1)}%`,
    );
    return {
      success: true,
      range: aggressiveResult.range,
      fuzzy: true,
      confidence: 'low',
      whitespaceDiffPercent: aggressiveResult.whitespaceDiffPercent,
      matchedText: aggressiveResult.matchedText,
      expectedText: patch.search,
    };
  }

  logPatch(`  -> Aggressive match also failed for ${patch.filePath}`);
  return normalResult;
}

// ─── Batch application ───────────────────────────────────────────────────────

/**
 * Apply multiple patches across potentially multiple files.
 *
 * Within a single file, patches are sorted bottom-to-top (highest line first)
 * to preserve line offsets for earlier patches. Across files, order doesn't matter.
 *
 * Returns a BatchResult with applied/failed lists and original content snapshots for undo.
 */
export async function applyPatchBatch(patches: PatchBlock[]): Promise<BatchResult> {
  const batchId = `batch-${Date.now()}-${randomHex(4)}`;
  const applied: Array<PatchBlock & { confidence?: PatchConfidence }> = [];
  const failed: Array<PatchBlock & { error: string }> = [];
  const snapshots = new Map<string, string>();
  const patchResults: PatchResult[] = [];

  logPatch(`=== Starting batch ${batchId}: ${patches.length} patches ===`);

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders === undefined || workspaceFolders.length === 0) {
    logPatch(`  Batch failed: no workspace folder open`);
    return {
      batchId,
      applied,
      failed: patches.map((p) => ({ ...p, error: 'No workspace folder open.' })),
      snapshots,
      patchResults,
    };
  }

  const rootUri = workspaceFolders[0]!.uri;

  // Group patches by file path.
  const byFile = new Map<string, PatchBlock[]>();
  for (const patch of patches) {
    const existing = byFile.get(patch.filePath) ?? [];
    existing.push(patch);
    byFile.set(patch.filePath, existing);
  }

  // Process each file.
  for (const [filePath, filePatches] of byFile) {
    // SECURITY: Reject path traversal attempts — file must stay within workspace root.
    // Normalize the path and ensure it does not escape the workspace via ".." segments.
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (
      normalizedPath.includes('..') ||
      normalizedPath.startsWith('/') ||
      normalizedPath.startsWith('~')
    ) {
      for (const p of filePatches) {
        failed.push({
          ...p,
          error: `Path traversal blocked: ${filePath}`,
        });
        patchResults.push({
          success: false,
          error: `Path traversal blocked: ${filePath}`,
          expectedText: p.search,
        });
      }
      logPatch(`  SECURITY: Path traversal blocked for ${filePath}`);
      continue;
    }

    const fileUri = vscode.Uri.joinPath(rootUri, filePath);

    // SECURITY: Double-check that the resolved URI is under the workspace root
    if (!fileUri.fsPath.startsWith(rootUri.fsPath)) {
      for (const p of filePatches) {
        failed.push({
          ...p,
          error: `Resolved path escapes workspace: ${filePath}`,
        });
        patchResults.push({
          success: false,
          error: `Resolved path escapes workspace: ${filePath}`,
          expectedText: p.search,
        });
      }
      logPatch(`  SECURITY: Resolved path escapes workspace for ${filePath}`);
      continue;
    }

    let document: vscode.TextDocument;

    try {
      document = await vscode.workspace.openTextDocument(fileUri);
    } catch {
      // Check if this is a new file creation (empty search block).
      const isCreation = filePatches.every((p) => p.search === '');
      if (isCreation) {
        // Create the file first, then open it.
        const content = filePatches.map((p) => p.replace).join('');
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
        await vscode.workspace.openTextDocument(fileUri);
        snapshots.set(filePath, '');
        applied.push(...filePatches.map((p) => ({ ...p, confidence: 'high' as PatchConfidence })));
        logPatch(`  Created new file: ${filePath}`);
        continue;
      }

      // File not found and not a creation — all patches for this file fail.
      for (const p of filePatches) {
        const error = `File not found: ${filePath}`;
        failed.push({ ...p, error });
        patchResults.push({ success: false, error, expectedText: p.search });
        logPatch(`  File not found: ${filePath}`);
      }
      continue;
    }

    // Snapshot original content for undo.
    if (!snapshots.has(filePath)) {
      snapshots.set(filePath, document.getText());
    }

    // Resolve each patch to a range and replacement, then sort bottom-to-top.
    interface ResolvedPatch {
      patch: PatchBlock;
      result: PatchResult;
    }

    const resolved: ResolvedPatch[] = [];

    for (const patch of filePatches) {
      const result = applyPatch(document, patch);
      resolved.push({ patch, result });
      patchResults.push(result);
    }

    // Separate successes and failures.
    const successes = resolved.filter((r) => r.result.success && r.result.range !== undefined);
    const failures = resolved.filter((r) => !r.result.success);

    for (const f of failures) {
      failed.push({ ...f.patch, error: f.result.error ?? 'Unknown error' });
    }

    if (successes.length === 0) continue;

    // Sort by start line descending (bottom-to-top) to preserve offsets.
    successes.sort((a, b) => {
      const aLine = a.result.range!.start.line;
      const bLine = b.result.range!.start.line;
      return bLine - aLine;
    });

    // Build a WorkspaceEdit with all successful patches for this file.
    const wsEdit = new vscode.WorkspaceEdit();

    for (const s of successes) {
      wsEdit.replace(fileUri, s.result.range!, s.patch.replace);
    }

    const editApplied = await vscode.workspace.applyEdit(wsEdit);
    if (editApplied) {
      for (const s of successes) {
        const entry: PatchBlock & { confidence?: PatchConfidence } = { ...s.patch };
        if (s.result.confidence !== undefined) {
          entry.confidence = s.result.confidence;
        }
        applied.push(entry);
      }
      logPatch(`  Applied ${successes.length} patches to ${filePath}`);
    } else {
      for (const s of successes) {
        failed.push({
          ...s.patch,
          error: `WorkspaceEdit failed for ${filePath}. The file may have been modified.`,
        });
      }
      logPatch(`  WorkspaceEdit failed for ${filePath}`);
    }
  }

  logPatch(`=== Batch ${batchId} complete: ${applied.length} applied, ${failed.length} failed ===`);

  return { batchId, applied, failed, snapshots, patchResults };
}

// ─── Undo support ────────────────────────────────────────────────────────────

/** Storage for batch snapshots, keyed by batchId. */
const batchSnapshotStore = new Map<string, BatchResult>();

/**
 * Store a batch result so it can be undone later.
 */
export function storeBatchForUndo(result: BatchResult): void {
  batchSnapshotStore.set(result.batchId, result);
}

/**
 * Undo all patches in a batch by restoring original file contents.
 * Returns true if undo succeeded for all files.
 */
export async function undoPatchBatch(batchId: string): Promise<boolean> {
  const batch = batchSnapshotStore.get(batchId);
  if (batch === undefined) return false;

  logPatch(`=== Undoing batch ${batchId} ===`);

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders === undefined || workspaceFolders.length === 0) return false;

  const rootUri = workspaceFolders[0]!.uri;
  const wsEdit = new vscode.WorkspaceEdit();
  let allSucceeded = true;

  for (const [filePath, originalContent] of batch.snapshots) {
    const fileUri = vscode.Uri.joinPath(rootUri, filePath);

    if (originalContent === '') {
      // File was created by the batch — delete it.
      wsEdit.deleteFile(fileUri);
    } else {
      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        wsEdit.replace(fileUri, fullRange, originalContent);
      } catch {
        allSucceeded = false;
      }
    }
  }

  const editApplied = await vscode.workspace.applyEdit(wsEdit);
  if (editApplied) {
    batchSnapshotStore.delete(batchId);
    logPatch(`  Batch ${batchId} undone successfully`);
  }

  return editApplied && allSucceeded;
}

// ─── Show Original Context ───────────────────────────────────────────────────

/**
 * Open a side-by-side comparison of what the patch expected vs what the file
 * actually contains. Useful for debugging failed or fuzzy-matched patches.
 */
export async function showOriginalContext(
  expectedText: string,
  matchedText: string,
  filePath: string,
): Promise<void> {
  // Create virtual documents with the content and use their URIs for diff
  const expectedDoc = await vscode.workspace.openTextDocument({
    content: expectedText,
    language: 'plaintext',
  });
  const matchedDoc = await vscode.workspace.openTextDocument({
    content: matchedText,
    language: 'plaintext',
  });

  await vscode.commands.executeCommand(
    'vscode.diff',
    expectedDoc.uri,
    matchedDoc.uri,
    `Patch Context: ${filePath} (Expected vs Actual)`,
    { preview: true },
  );
}

// ─── Fuzzy matching ──────────────────────────────────────────────────────────

/**
 * Attempt a fuzzy match by normalizing whitespace.
 *
 * Strategy:
 * - Split both document and search text into lines.
 * - Normalize each line: collapse runs of whitespace to single space, trim trailing.
 * - Slide a window of normalized-search-lines over normalized-doc-lines.
 * - If exactly one position matches, return the original (un-normalized) range.
 */
function fuzzyMatch(docText: string, searchText: string): vscode.Range | undefined {
  const normalizeLine = (line: string): string => line.replace(/\s+/g, ' ').trimEnd();

  const docLines = docText.split('\n');
  const searchLines = searchText.split('\n');

  if (searchLines.length === 0) return undefined;

  const normalizedDocLines = docLines.map(normalizeLine);
  const normalizedSearchLines = searchLines.map(normalizeLine);

  const matches: number[] = [];

  for (let i = 0; i <= normalizedDocLines.length - normalizedSearchLines.length; i++) {
    let match = true;
    for (let j = 0; j < normalizedSearchLines.length; j++) {
      if (normalizedDocLines[i + j] !== normalizedSearchLines[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      matches.push(i);
    }
  }

  // Only accept if there is exactly one match (unique fuzzy match).
  if (matches.length !== 1) return undefined;

  const startLine = matches[0]!;
  const endLine = startLine + searchLines.length - 1;

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, docLines[endLine]?.length ?? 0);

  return new vscode.Range(startPos, endPos);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trimTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

function randomHex(bytes: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < bytes * 2; i++) {
    result += chars.charAt(Math.floor(Math.random() * 16));
  }
  return result;
}
