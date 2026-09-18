import * as vscode from 'vscode';
import {
  describePatchMatch,
  describePatchRefusal,
  matchAggressively,
  matchPatchBlock,
  matchPatchBlockAggressive,
  parsePatchBlocks,
  patchFailureMessage,
  type CodeRange,
  type PatchBlock,
  type PatchConfidence,
  type PatchMatch,
  type PatchOutcome,
} from '@agiworkforce/ide-runtime';

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

export { parsePatchBlocks };
export type { PatchBlock, PatchConfidence };

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

function toVscodeRange(range: CodeRange): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  );
}

function toPatchResult(match: PatchMatch): PatchResult {
  return {
    success: true,
    range: toVscodeRange(match.range),
    fuzzy: match.fuzzy,
    confidence: match.confidence,
    whitespaceDiffPercent: match.whitespaceDiffPercent,
    matchedText: match.matchedText,
    expectedText: match.expectedText,
  };
}

function reportOutcome(patch: PatchBlock, outcome: PatchOutcome): PatchResult {
  if (outcome.matched) {
    logPatch(`  -> ${describePatchMatch(patch, outcome.match)}`);
    return toPatchResult(outcome.match);
  }

  logPatch(`  -> ${describePatchRefusal(outcome.refusal, patch.filePath)}`);
  return {
    success: false,
    error: patchFailureMessage(patch),
    expectedText: patch.search,
  };
}

export function applyPatch(document: vscode.TextDocument, patch: PatchBlock): PatchResult {
  logPatch(
    `Applying patch to ${patch.filePath}: search ${patch.search.length} chars, replace ${patch.replace.length} chars`,
  );

  return reportOutcome(patch, matchPatchBlock(document.getText(), patch));
}

export function aggressiveFuzzyMatch(
  docText: string,
  searchText: string,
): { range: vscode.Range; matchedText: string; whitespaceDiffPercent: number } | undefined {
  const result = matchAggressively(docText, searchText);
  if ('kind' in result) {
    if (result.kind !== 'no-match') {
      logPatch(`  -> ${describePatchRefusal(result, '')}`);
    }
    return undefined;
  }

  return {
    range: toVscodeRange(result.range),
    matchedText: result.matchedText,
    whitespaceDiffPercent: result.whitespaceDiffPercent,
  };
}

export function applyPatchAggressive(
  document: vscode.TextDocument,
  patch: PatchBlock,
): PatchResult {
  logPatch(
    `Applying patch to ${patch.filePath}: search ${patch.search.length} chars, replace ${patch.replace.length} chars`,
  );

  const text = document.getText();
  const direct = matchPatchBlock(text, patch);
  if (direct.matched) return reportOutcome(patch, direct);

  logPatch(`  -> Retrying with aggressive fuzzy match for ${patch.filePath}`);
  return reportOutcome(patch, matchPatchBlockAggressive(text, patch));
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
