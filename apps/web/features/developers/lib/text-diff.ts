export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

const MAX_DIFF_LINES = 2_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const left = before.split('\n').slice(0, MAX_DIFF_LINES);
  const right = after.split('\n').slice(0, MAX_DIFF_LINES);
  const lengths: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        left[i] === right[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ kind: 'same', text: left[i]! });
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      lines.push({ kind: 'removed', text: left[i]! });
      i += 1;
    } else {
      lines.push({ kind: 'added', text: right[j]! });
      j += 1;
    }
  }
  while (i < left.length) lines.push({ kind: 'removed', text: left[(i += 1) - 1]! });
  while (j < right.length) lines.push({ kind: 'added', text: right[(j += 1) - 1]! });
  return lines;
}
