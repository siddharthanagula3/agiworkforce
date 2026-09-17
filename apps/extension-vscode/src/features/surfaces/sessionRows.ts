export type SessionSource = 'local' | 'cloud';

/** Which surface started the session, as the protocol's `createdBy` reports it. */
export type SessionOrigin = 'cli' | 'vscode' | 'desktop' | 'unknown';

export interface SessionRowInput {
  id: string;
  title: string;
  updatedAt: string;
  source: SessionSource;
  origin?: SessionOrigin;
  branch?: string;
}

export interface SessionRow {
  id: string;
  title: string;
  age: string;
  source: SessionSource;
  sourceLabel: string;
  branch?: string;
}

const SOURCE_LABELS: Record<SessionSource, string> = {
  local: 'Local',
  cloud: 'Cloud',
};

/**
 * A local session says which surface opened it rather than the word "Local",
 * because every row in that list is local and the useful distinction is the
 * one the protocol now carries.
 */
const ORIGIN_LABELS: Record<SessionOrigin, string> = {
  cli: 'CLI',
  vscode: 'VS Code',
  desktop: 'Desktop',
  unknown: 'Another surface',
};

function sourceLabelFor(input: SessionRowInput): string {
  if (input.source === 'local' && input.origin !== undefined) return ORIGIN_LABELS[input.origin];
  return SOURCE_LABELS[input.source];
}

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
      sourceLabel: sourceLabelFor(input),
      ...(input.branch === undefined || input.branch.trim() === ''
        ? {}
        : { branch: input.branch.trim() }),
    }));
}
