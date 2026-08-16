
import * as vscode from 'vscode';

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

export type PatchConfidence = 'high' | 'medium' | 'low';

export interface PatchBlock {
  filePath: string;
  search: string;
  replace: string;
}

export interface PatchResult {
  success: boolean;
  range?: vscode.Range;
  error?: string;
  fuzzy?: boolean;
  confidence?: PatchConfidence;
  whitespaceDiffPercent?: number;
  matchedText?: string;
  expectedText?: string;
}

export function parsePatchBlocks(text: string): PatchBlock[] {
  const blocks: PatchBlock[] = [];

  const envelopePattern = /```patch:([^\n]+)\n([\s\S]*?)```/g;
  let envelopeMatch: RegExpExecArray | null;

  while ((envelopeMatch = envelopePattern.exec(text)) !== null) {
    const filePath = envelopeMatch[1]?.trim();
    const body = envelopeMatch[2] ?? '';

    if (!filePath) continue;

    const hunkPattern = /<<<<<<< SEARCH\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> REPLACE/g;
    let hunkMatch: RegExpExecArray | null;

    while ((hunkMatch = hunkPattern.exec(body)) !== null) {
      const search = trimTrailingNewline(hunkMatch[1] ?? '');
      const replace = trimTrailingNewline(hunkMatch[2] ?? '');

      blocks.push({ filePath, search, replace });
    }
  }

  return blocks;
}

function calculateWhitespaceDiffPercent(original: string, matched: string): number {
  if (original === matched) return 0;

  const normalizeWs = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const origNorm = normalizeWs(original);
  const matchNorm = normalizeWs(matched);

  if (origNorm === matchNorm) {
    const origWs = (original.match(/\s/g) ?? []).length;
    const matchWs = (matched.match(/\s/g) ?? []).length;
    const totalChars = Math.max(original.length, matched.length, 1);
    return (Math.abs(origWs - matchWs) / totalChars) * 100;
  }

  const maxLen = Math.max(origNorm.length, matchNorm.length, 1);
  let diffChars = 0;
  for (let i = 0; i < maxLen; i++) {
    if (origNorm[i] !== matchNorm[i]) diffChars++;
  }
  return (diffChars / maxLen) * 100;
}

function determineConfidence(fuzzy: boolean, whitespaceDiffPercent: number): PatchConfidence {
  if (!fuzzy) return 'high';
  if (whitespaceDiffPercent < 5) return 'medium';
  return 'low';
}

export function applyPatch(document: vscode.TextDocument, patch: PatchBlock): PatchResult {
  const docText = document.getText();

  logPatch(
    `Applying patch to ${patch.filePath}: search ${patch.search.length} chars, replace ${patch.replace.length} chars`,
  );

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

  logPatch(`  -> No match found for ${patch.filePath}`);
  return {
    success: false,
    error: `Could not locate the target code block in ${patch.filePath}. The file may have changed since the patch was generated.`,
    expectedText: patch.search,
  };
}

const AGGRESSIVE_FUZZY_MIN_LEN = 24;

export function aggressiveFuzzyMatch(
  docText: string,
  searchText: string,
): { range: vscode.Range; matchedText: string; whitespaceDiffPercent: number } | undefined {
  const stripAll = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

  const docStripped = stripAll(docText);
  const searchStripped = stripAll(searchText);

  if (searchStripped.length === 0) return undefined;
  if (searchStripped.length < AGGRESSIVE_FUZZY_MIN_LEN) {
    logPatch(
      `  -> Aggressive fuzzy refused: stripped search length ${searchStripped.length} < ${AGGRESSIVE_FUZZY_MIN_LEN} chars`,
    );
    return undefined;
  }

  const index = docStripped.indexOf(searchStripped);
  if (index === -1) return undefined;
  const secondIndex = docStripped.indexOf(searchStripped, index + 1);
  if (secondIndex !== -1) {
    logPatch(
      `  -> Aggressive fuzzy refused: ${searchStripped.length}-char search appears more than once`,
    );
    return undefined;
  }

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

export function applyPatchAggressive(
  document: vscode.TextDocument,
  patch: PatchBlock,
): PatchResult {
  const normalResult = applyPatch(document, patch);
  if (normalResult.success) return normalResult;

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

export async function showOriginalContext(
  expectedText: string,
  matchedText: string,
  filePath: string,
): Promise<void> {
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

  if (matches.length !== 1) return undefined;

  const startLine = matches[0]!;
  const endLine = startLine + searchLines.length - 1;

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, docLines[endLine]?.length ?? 0);

  return new vscode.Range(startPos, endPos);
}

function trimTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}
