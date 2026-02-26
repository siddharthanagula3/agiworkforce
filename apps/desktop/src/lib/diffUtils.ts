/**
 * diffUtils.ts
 *
 * Pure utility functions for computing and applying line-level diffs between
 * two strings. Uses an LCS (longest common subsequence) based algorithm to
 * group contiguous changed regions into hunks.
 *
 * No side effects — safe to call from any context.
 */

export interface ArtifactDiff {
  hunks: Array<{
    startLine: number;
    endLine: number;
    originalContent: string;
    newContent: string;
  }>;
  changeDescription?: string;
}

// =============================================================================
// LCS-based line diff
// =============================================================================

/**
 * Computes the LCS (longest common subsequence) table for two arrays using
 * dynamic programming. Returns the DP table; each cell dp[i][j] holds the
 * length of the LCS of the first i elements of `a` and first j elements of `b`.
 */
function buildLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  // Allocate a (m+1) x (n+1) table initialised to 0
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }
  return dp;
}

type DiffOp = { op: 'equal' | 'delete' | 'insert'; line: string };

/**
 * Back-tracks through the LCS table to produce a list of diff operations.
 */
function backtrack(dp: number[][], a: string[], b: string[]): DiffOp[] {
  const ops: DiffOp[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ op: 'equal', line: a[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      ops.push({ op: 'insert', line: b[j - 1]! });
      j--;
    } else {
      ops.push({ op: 'delete', line: a[i - 1]! });
      i--;
    }
  }

  ops.reverse();
  return ops;
}

/**
 * Computes a line-level diff between `original` and `modified` and returns
 * an `ArtifactDiff` whose hunks cover contiguous changed regions.
 *
 * @param original - The original string content
 * @param modified - The modified string content
 * @returns An ArtifactDiff with hunks describing the changes
 */
export function computeLineDiff(original: string, modified: string): ArtifactDiff {
  if (original === modified) {
    return { hunks: [] };
  }

  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  const dp = buildLcsTable(originalLines, modifiedLines);
  const ops = backtrack(dp, originalLines, modifiedLines);

  // Convert the flat list of ops into hunks of contiguous changes.
  // We walk the ops, tracking original-line index and modified-line index.
  // Whenever we see a sequence of delete/insert ops, we accumulate them into
  // a hunk; when we hit an 'equal' op we flush any open hunk.
  const hunks: ArtifactDiff['hunks'] = [];

  let origIdx = 0; // current position in originalLines
  let hunkStart = -1;
  let deletedLines: string[] = [];
  let insertedLines: string[] = [];

  const flushHunk = () => {
    if (hunkStart === -1) return;
    hunks.push({
      startLine: hunkStart,
      endLine: hunkStart + deletedLines.length,
      originalContent: deletedLines.join('\n'),
      newContent: insertedLines.join('\n'),
    });
    hunkStart = -1;
    deletedLines = [];
    insertedLines = [];
  };

  for (const op of ops) {
    if (op.op === 'equal') {
      flushHunk();
      origIdx++;
    } else if (op.op === 'delete') {
      if (hunkStart === -1) hunkStart = origIdx;
      deletedLines.push(op.line);
      origIdx++;
    } else {
      // insert
      if (hunkStart === -1) hunkStart = origIdx;
      insertedLines.push(op.line);
      // inserts do not advance origIdx
    }
  }

  flushHunk();

  return { hunks };
}

/**
 * Applies a previously computed `ArtifactDiff` to `original` and returns the
 * resulting string. Hunks are applied in order from earliest to latest line.
 *
 * @param original - The original string content
 * @param diff - The diff to apply
 * @returns The modified string after applying all hunks
 */
export function applyDiff(original: string, diff: ArtifactDiff): string {
  if (diff.hunks.length === 0) return original;

  const lines = original.split('\n');
  // Sort hunks by startLine ascending so we process them in order.
  const sorted = [...diff.hunks].sort((a, b) => a.startLine - b.startLine);

  let result: string[] = [];
  let cursor = 0;

  for (const hunk of sorted) {
    // Copy lines before this hunk as-is
    result = result.concat(lines.slice(cursor, hunk.startLine));
    // Insert the new content (may be empty string for deletions).
    // Split on '\n' so multi-line hunks are pushed as individual lines,
    // ensuring correct round-trip behaviour with result.join('\n').
    if (hunk.newContent !== '') {
      result.push(...hunk.newContent.split('\n'));
    }
    // Advance cursor past the replaced region
    cursor = hunk.endLine;
  }

  // Append any remaining lines after the last hunk
  result = result.concat(lines.slice(cursor));

  return result.join('\n');
}
