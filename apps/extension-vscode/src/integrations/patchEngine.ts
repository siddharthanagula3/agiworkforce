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
  // PR-2B (F-16): prepend operations cannot have "high" confidence —
  // there is nothing to match against. Downgrade so the UI requires
  // explicit confirmation for files that already exist.
  if (patch.search === '') {
    logPatch(`  -> Insert at beginning (empty search) — confidence: medium`);
    return {
      success: true,
      range: new vscode.Range(0, 0, 0, 0),
      fuzzy: false,
      confidence: 'medium',
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
 *
 * PR-3A (F-25): refuse offers when the matched text is too small to be
 * a meaningful unique anchor. Short searches (under 24 stripped chars)
 * are ambiguous and can apply patches at unintended locations.
 */
const AGGRESSIVE_FUZZY_MIN_LEN = 24;

export function aggressiveFuzzyMatch(
  docText: string,
  searchText: string,
): { range: vscode.Range; matchedText: string; whitespaceDiffPercent: number } | undefined {
  const stripAll = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

  const docStripped = stripAll(docText);
  const searchStripped = stripAll(searchText);

  if (searchStripped.length === 0) return undefined;
  // PR-3A (F-25): refuse fuzzy matching of very short anchors.
  if (searchStripped.length < AGGRESSIVE_FUZZY_MIN_LEN) {
    logPatch(
      `  -> Aggressive fuzzy refused: stripped search length ${searchStripped.length} < ${AGGRESSIVE_FUZZY_MIN_LEN} chars`,
    );
    return undefined;
  }

  const index = docStripped.indexOf(searchStripped);
  if (index === -1) return undefined;
  // PR-3A (F-25): require uniqueness — if the stripped search appears
  // more than once, refuse rather than guess.
  const secondIndex = docStripped.indexOf(searchStripped, index + 1);
  if (secondIndex !== -1) {
    logPatch(
      `  -> Aggressive fuzzy refused: ${searchStripped.length}-char search appears more than once`,
    );
    return undefined;
  }

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
