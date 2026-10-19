import { artifactChanges, type ArtifactChangeRun } from '@agiworkforce/artifacts';

export type ReviewPiece =
  | { kind: 'same'; text: string }
  | { kind: 'change'; index: number; removed: string; added: string };

export interface ChangeReview {
  pieces: ReviewPiece[];
  changeCount: number;
}

export function buildChangeReview(previous: string, next: string): ChangeReview | null {
  const changes = artifactChanges(previous, next, 'word');
  if (changes.unit !== 'word') return null;
  const pieces: ReviewPiece[] = [];
  let pending: { removed: string; added: string } | null = null;
  let count = 0;
  const flush = () => {
    if (!pending) return;
    pieces.push({ kind: 'change', index: count, ...pending });
    count += 1;
    pending = null;
  };
  for (const run of changes.runs as ArtifactChangeRun[]) {
    if (run.kind === 'same') {
      flush();
      pieces.push({ kind: 'same', text: run.text });
      continue;
    }
    pending ??= { removed: '', added: '' };
    if (run.kind === 'added') pending.added += run.text;
    else pending.removed += run.text;
  }
  flush();
  const review = { pieces, changeCount: count };
  if (resolveReview(review, new Set()) !== next || resolveReview(review, null) !== previous)
    return null;
  return review;
}

export function resolveReview(review: ChangeReview, undone: ReadonlySet<number> | null): string {
  return review.pieces
    .map((piece) => {
      if (piece.kind === 'same') return piece.text;
      const undo = undone === null || undone.has(piece.index);
      return undo ? piece.removed : piece.added;
    })
    .join('');
}
