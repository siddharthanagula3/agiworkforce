
export interface ArtifactDiff {
  hunks: Array<{
    startLine: number;
    endLine: number;
    originalContent: string;
    newContent: string;
  }>;
  changeDescription?: string;
}

function buildLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
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

  const hunks: ArtifactDiff['hunks'] = [];

  let origIdx = 0;
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
  const sorted = [...diff.hunks].sort((a, b) => a.startLine - b.startLine);

  let result: string[] = [];
  let cursor = 0;

  for (const hunk of sorted) {
    result = result.concat(lines.slice(cursor, hunk.startLine));
    if (hunk.newContent !== '') {
      result.push(...hunk.newContent.split('\n'));
    }
    cursor = hunk.endLine;
  }

  result = result.concat(lines.slice(cursor));

  return result.join('\n');
}
