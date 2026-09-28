export type ArtifactChangeUnit = 'line' | 'word';

export type ArtifactChangeKind = 'same' | 'added' | 'removed';

export interface ArtifactChangeRun {
  kind: ArtifactChangeKind;
  text: string;
}

export interface ArtifactChanges {
  unit: ArtifactChangeUnit;
  runs: ArtifactChangeRun[];
  added: number;
  removed: number;
}

const MAX_EDIT_DISTANCE = 1_000;
const WORD_TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
const COUNTED_WORD = /[\p{L}\p{N}]/u;
const WHITESPACE_ONLY = /^\s+$/u;

function tokenize(text: string, unit: ArtifactChangeUnit): string[] {
  if (unit === 'line') return text.length === 0 ? [] : text.split('\n');
  return text.match(WORD_TOKEN) ?? [];
}

function backtrack(trace: Int32Array[], n: number, m: number): ArtifactChangeKind[] {
  const ops: ArtifactChangeKind[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const before = trace[d]!;
    const at = (k: number): number => before[k + d + 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const previousK = down ? k + 1 : k - 1;
    const previousX = at(previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      ops.push('same');
      x--;
      y--;
    }
    if (d > 0) ops.push(x === previousX ? 'added' : 'removed');
    x = previousX;
    y = previousY;
  }
  return ops.reverse();
}

function shortestEdit(a: readonly string[], b: readonly string[]): ArtifactChangeKind[] | null {
  const n = a.length;
  const m = b.length;
  if (n === 0) return Array<ArtifactChangeKind>(m).fill('added');
  if (m === 0) return Array<ArtifactChangeKind>(n).fill('removed');
  const limit = Math.min(n + m, MAX_EDIT_DISTANCE);
  const offset = limit + 1;
  const frontier = new Int32Array(2 * limit + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= limit; d++) {
    trace.push(frontier.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && frontier[offset + k - 1]! < frontier[offset + k + 1]!);
      let x = down ? frontier[offset + k + 1]! : frontier[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      frontier[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return null;
}

function editScript(a: readonly string[], b: readonly string[]): ArtifactChangeKind[] | null {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const middle = shortestEdit(a.slice(start, endA), b.slice(start, endB));
  if (!middle) return null;
  return [
    ...Array<ArtifactChangeKind>(start).fill('same'),
    ...middle,
    ...Array<ArtifactChangeKind>(a.length - endA).fill('same'),
  ];
}

function countsAsChange(token: string, unit: ArtifactChangeUnit): boolean {
  return unit === 'line' || COUNTED_WORD.test(token);
}

function collect(
  a: readonly string[],
  b: readonly string[],
  ops: readonly ArtifactChangeKind[],
  unit: ArtifactChangeUnit,
): ArtifactChanges {
  const joiner = unit === 'line' ? '\n' : '';
  const grouped: Array<{ kind: ArtifactChangeKind; tokens: string[] }> = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  for (const op of ops) {
    const token = op === 'added' ? b[j]! : a[i]!;
    if (op !== 'added') i++;
    if (op !== 'removed') j++;
    if (op === 'added' && countsAsChange(token, unit)) added++;
    if (op === 'removed' && countsAsChange(token, unit)) removed++;
    const last = grouped[grouped.length - 1];
    if (last?.kind === op) last.tokens.push(token);
    else grouped.push({ kind: op, tokens: [token] });
  }
  const runs = grouped.map(({ kind, tokens }) => ({ kind, text: tokens.join(joiner) }));
  return { unit, runs: unit === 'word' ? joinReplacements(runs) : runs, added, removed };
}

function joinReplacements(runs: readonly ArtifactChangeRun[]): ArtifactChangeRun[] {
  const out: ArtifactChangeRun[] = [];
  let removed = '';
  let added = '';
  const flush = (): void => {
    if (removed) out.push({ kind: 'removed', text: removed });
    if (added) out.push({ kind: 'added', text: added });
    removed = '';
    added = '';
  };
  runs.forEach((run, index) => {
    const bridges =
      run.kind === 'same' &&
      WHITESPACE_ONLY.test(run.text) &&
      runs[index - 1] !== undefined &&
      runs[index - 1]!.kind !== 'same' &&
      runs[index + 1] !== undefined &&
      runs[index + 1]!.kind !== 'same';
    if (bridges) {
      removed += run.text;
      added += run.text;
    } else if (run.kind === 'removed') {
      removed += run.text;
    } else if (run.kind === 'added') {
      added += run.text;
    } else {
      flush();
      out.push(run);
    }
  });
  flush();
  return out;
}

function compare(previous: string, next: string, unit: ArtifactChangeUnit): ArtifactChanges | null {
  const a = tokenize(previous, unit);
  const b = tokenize(next, unit);
  const ops = editScript(a, b);
  return ops ? collect(a, b, ops, unit) : null;
}

export function artifactChanges(
  previous: string,
  next: string,
  unit: ArtifactChangeUnit,
): ArtifactChanges {
  const preferred = compare(previous, next, unit);
  if (preferred) return preferred;
  const lines = unit === 'word' ? compare(previous, next, 'line') : null;
  if (lines) return lines;
  const before = tokenize(previous, 'line');
  const after = tokenize(next, 'line');
  return collect(
    before,
    after,
    [
      ...Array<ArtifactChangeKind>(before.length).fill('removed'),
      ...Array<ArtifactChangeKind>(after.length).fill('added'),
    ],
    'line',
  );
}
