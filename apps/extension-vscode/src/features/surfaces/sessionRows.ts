export type SessionSource = 'local' | 'cloud';

export interface SessionRowInput {
  id: string;
  title: string;
  updatedAt: string;
  source: SessionSource;
}

export interface SessionRow {
  id: string;
  title: string;
  age: string;
  source: SessionSource;
  sourceLabel: string;
}

const SOURCE_LABELS: Record<SessionSource, string> = {
  local: 'Local',
  cloud: 'Cloud',
};

export function formatSessionAge(updatedAt: number, now: number): string {
  const diff = Math.max(0, now - updatedAt);
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(updatedAt).toLocaleDateString();
}

export function mergeSessionRows(
  inputs: readonly SessionRowInput[],
  now = Date.now(),
): SessionRow[] {
  return inputs
    .map((input) => ({ input, updatedAt: Date.parse(input.updatedAt) }))
    .filter((entry) => Number.isFinite(entry.updatedAt))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ input, updatedAt }) => ({
      id: input.id,
      title: input.title.trim() === '' ? 'Untitled session' : input.title.trim(),
      age: formatSessionAge(updatedAt, now),
      source: input.source,
      sourceLabel: SOURCE_LABELS[input.source],
    }));
}
