import {
  CLOUD_CODE_SESSION_STATE_LABELS,
  CLOUD_CODE_SESSION_STATUS_FILTER_LABELS,
  MOBILE_CODE_SCREEN_LABEL,
  cloudCodeRepositoryLabel,
  diffPaths,
  type CloudCodeChangeState,
  type CloudCodeSession,
  type CloudCodeSessionState,
  type CloudCodeSessionStatusFilter,
  type CloudCodeTurnMode,
  type CloudCodeTurnStepBound,
  type RemoteCodeSessionStatus,
  type RemoteCodeSessionSummary,
} from '@agiworkforce/types';

export const CLOUD_CODE_SCREEN_TITLE = MOBILE_CODE_SCREEN_LABEL;

type CloudCodeBadgeTone = 'gray' | 'blue' | 'red';

export const CLOUD_CODE_STATE_BADGE_COLORS: Readonly<
  Record<CloudCodeSessionState, CloudCodeBadgeTone>
> = {
  provisioning: 'blue',
  ready: 'gray',
  running: 'blue',
  failed: 'red',
  closed: 'gray',
};

export const CLOUD_CODE_SESSION_VIEWS = [
  'open',
  'running',
  'ready',
  'provisioning',
  'failed',
  'closed',
  'archived',
  'all',
] as const;
export type CloudCodeSessionView = (typeof CLOUD_CODE_SESSION_VIEWS)[number];

export const CLOUD_CODE_DEFAULT_SESSION_VIEW: CloudCodeSessionView = 'open';

export const CLOUD_CODE_SESSION_VIEW_LABELS: Readonly<Record<CloudCodeSessionView, string>> = {
  open: CLOUD_CODE_SESSION_STATUS_FILTER_LABELS.open,
  running: 'Running',
  ready: CLOUD_CODE_SESSION_STATE_LABELS.ready,
  provisioning: CLOUD_CODE_SESSION_STATE_LABELS.provisioning,
  failed: CLOUD_CODE_SESSION_STATE_LABELS.failed,
  closed: CLOUD_CODE_SESSION_STATUS_FILTER_LABELS.closed,
  archived: CLOUD_CODE_SESSION_STATUS_FILTER_LABELS.archived,
  all: CLOUD_CODE_SESSION_STATUS_FILTER_LABELS.all,
};

const CLOUD_CODE_VIEW_STATUS_FILTERS: Readonly<
  Record<CloudCodeSessionView, CloudCodeSessionStatusFilter>
> = {
  open: 'open',
  running: 'open',
  ready: 'open',
  provisioning: 'open',
  failed: 'open',
  closed: 'closed',
  archived: 'archived',
  all: 'all',
};

const CLOUD_CODE_VIEW_STATES: Readonly<
  Partial<Record<CloudCodeSessionView, CloudCodeSessionState>>
> = {
  running: 'running',
  ready: 'ready',
  provisioning: 'provisioning',
  failed: 'failed',
};

export function cloudCodeViewStatusFilter(
  view: CloudCodeSessionView,
): CloudCodeSessionStatusFilter {
  return CLOUD_CODE_VIEW_STATUS_FILTERS[view];
}

export function cloudCodeSessionInView(
  session: Pick<CloudCodeSession, 'state'>,
  view: CloudCodeSessionView,
): boolean {
  const state = CLOUD_CODE_VIEW_STATES[view];
  return state === undefined || session.state === state;
}

export const CLOUD_CODE_SESSION_SORTS = ['recent', 'oldest'] as const;
export type CloudCodeSessionSort = (typeof CLOUD_CODE_SESSION_SORTS)[number];

export const CLOUD_CODE_DEFAULT_SESSION_SORT: CloudCodeSessionSort = 'recent';

export const CLOUD_CODE_SESSION_SORT_LABELS: Readonly<Record<CloudCodeSessionSort, string>> = {
  recent: 'Most recent',
  oldest: 'Oldest first',
};

function sessionTime(session: Pick<CloudCodeSession, 'updatedAt'>): number {
  const time = Date.parse(session.updatedAt);
  return Number.isNaN(time) ? 0 : time;
}

export function sortCloudCodeSessions<T extends Pick<CloudCodeSession, 'id' | 'updatedAt'>>(
  sessions: readonly T[],
  sort: CloudCodeSessionSort,
): T[] {
  const direction = sort === 'recent' ? -1 : 1;
  return [...sessions].sort(
    (a, b) => direction * (sessionTime(a) - sessionTime(b)) || a.id.localeCompare(b.id),
  );
}

export function matchesSearchTerms(
  query: string,
  fields: ReadonlyArray<string | null | undefined>,
): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fields
    .filter((field): field is string => Boolean(field))
    .join('\n')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function cloudCodeSessionMatchesQuery(
  session: Pick<
    CloudCodeSession,
    'title' | 'repositoryUrl' | 'repositoryBranch' | 'workingBranch' | 'baseBranch'
  >,
  query: string,
): boolean {
  return matchesSearchTerms(query, [
    session.title,
    session.repositoryUrl ? cloudCodeRepositoryLabel(session.repositoryUrl) : null,
    session.repositoryBranch,
    session.workingBranch,
    session.baseBranch,
  ]);
}

export function visibleCloudCodeSessions(
  sessions: readonly CloudCodeSession[],
  options: { view: CloudCodeSessionView; sort: CloudCodeSessionSort; query: string },
): CloudCodeSession[] {
  return sortCloudCodeSessions(
    sessions.filter(
      (session) =>
        cloudCodeSessionInView(session, options.view) &&
        cloudCodeSessionMatchesQuery(session, options.query),
    ),
    options.sort,
  );
}

export type CodeListEntry =
  | { kind: 'cloud'; id: string; updatedAt: string; session: CloudCodeSession }
  | { kind: 'computer'; id: string; updatedAt: string; session: RemoteCodeSessionSummary };

const COMPUTER_SESSION_VIEWS: Readonly<
  Record<RemoteCodeSessionStatus, CloudCodeSessionView | null>
> = {
  running: 'running',
  idle: 'ready',
  awaiting_approval: 'failed',
  failed: 'failed',
  unknown: null,
};

export function computerCodeSessionInView(
  session: Pick<RemoteCodeSessionSummary, 'status'>,
  view: CloudCodeSessionView,
): boolean {
  if (view === 'open' || view === 'all') return true;
  return COMPUTER_SESSION_VIEWS[session.status] === view;
}

export function computerCodeSessionMatchesQuery(
  session: Pick<RemoteCodeSessionSummary, 'title' | 'folder' | 'branch'>,
  query: string,
): boolean {
  return matchesSearchTerms(query, [session.title, session.folder, session.branch]);
}

export function visibleCodeListEntries(
  cloudSessions: readonly CloudCodeSession[],
  computerSessions: readonly RemoteCodeSessionSummary[],
  options: { view: CloudCodeSessionView; sort: CloudCodeSessionSort; query: string },
): CodeListEntry[] {
  const cloud = visibleCloudCodeSessions(cloudSessions, options).map((session): CodeListEntry => ({
    kind: 'cloud',
    id: `cloud:${session.id}`,
    updatedAt: session.updatedAt,
    session,
  }));
  // A computer can relay the account's cloud sessions too; the cloud list owns those.
  const computer = computerSessions
    .filter(
      (session) =>
        session.location !== 'cloud' &&
        computerCodeSessionInView(session, options.view) &&
        computerCodeSessionMatchesQuery(session, options.query),
    )
    .map((session): CodeListEntry => ({
      kind: 'computer',
      id: `computer:${JSON.stringify([session.rootId, session.threadId])}`,
      updatedAt: session.updatedAt,
      session,
    }));
  return sortCloudCodeSessions([...cloud, ...computer], options.sort);
}

export const CLOUD_CODE_CHANGE_STATE_LABELS: Readonly<Record<CloudCodeChangeState, string>> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'Untracked',
  conflicted: 'Conflicted',
};

export const CLOUD_CODE_TURN_MODE_OPTIONS: ReadonlyArray<{
  id: CloudCodeTurnMode;
  label: string;
  description: string;
}> = [
  { id: 'agent', label: 'Agent', description: 'Edits files and runs commands to finish the task' },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Reads the code and proposes changes without making any',
  },
];

export const CLOUD_CODE_TURN_STEP_HINTS: Readonly<Record<CloudCodeTurnStepBound, string>> = {
  12: 'Quick fixes and questions',
  24: 'Most tasks',
  48: 'Larger changes that take longer and use more',
};

export const CLOUD_CODE_CHANGES_COPY = Object.freeze({
  open: 'Changes',
  heading: 'Changes',
  close: 'Close changes',
  refresh: 'Refresh the changes',
  loading: 'Loading changes',
  none: 'No changes to show',
  noRepository: 'This session has no repository, so there is nothing to push.',
  diffTruncated: 'The diff is too large to show in full.',
  includeFile: 'Include in the commit:',
  discardFile: 'Discard the changes to',
  discardTitle: 'Discard these changes?',
  discardDescription:
    'The workspace goes back to the last committed version of this file, and a new file is deleted. This cannot be undone:',
  discardConfirm: 'Discard changes',
  commitLabel: 'Commit message',
  commitAction: 'Commit and push',
  commitPushed: 'Pushed to the repository.',
  commitNoFilesChosen: 'Choose at least one file to commit.',
  createPullRequest: 'Create pull request',
  creatingPullRequest: 'Creating pull request',
  pullRequestNeedsBranch: 'A pull request needs a repository and a working branch.',
  pullRequestNeedsOpenSession: 'A closed or archived session cannot open a pull request.',
  checksPassing: 'Checks passing',
  checksFailing: 'Checks failing',
  checksPending: 'Checks running',
  checksNone: 'No checks reported',
  checksUnavailable: 'Check status is unavailable',
  checksRefresh: 'Refresh the checks',
  pullRequestMerged: 'Merged',
  pullRequestClosed: 'Closed without merging',
  reviewApproved: 'Review approved',
  reviewChangesRequested: 'Changes requested',
  terminal: 'Commands',
  terminalEmpty: 'No commands have run in this session.',
  commandLabel: 'Command',
  commandPlaceholder: 'Run a command',
  commandRun: 'Run',
});

export const CLOUD_CODE_OPTIONS_COPY = Object.freeze({
  open: 'Task options and usage',
  heading: 'Task options',
  close: 'Close task options',
  mode: 'Mode',
  steps: 'Steps per task',
  stepsUnit: 'steps',
  ownAgent: 'This environment runs its own agent, so it sets its own mode and steps.',
  usage: 'Usage',
  contextWindow: 'Context window',
  usageUnavailable: 'Usage is not available right now.',
  usageDetail: 'See detailed usage',
});

export function cloudCodeCommitChosenLabel(chosen: number, total: number): string {
  return `Commits ${chosen} of ${total} changed files. The rest stay in the workspace.`;
}

export function cloudCodeWorkspaceLabel(
  session: Pick<CloudCodeSession, 'repositoryUrl' | 'workingBranch'>,
): string | null {
  const parts = [
    session.repositoryUrl ? cloudCodeRepositoryLabel(session.repositoryUrl) : null,
    session.workingBranch,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function cloudCodeDiffByPath(diff: string): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const section of diff.split(/^(?=diff --git )/m)) {
    const [path] = diffPaths(section);
    if (path) byPath.set(path, section.trimEnd());
  }
  return byPath;
}

export type CloudCodeDiffLineKind = 'added' | 'removed' | 'meta' | 'context';

export function cloudCodeDiffLineKind(line: string): CloudCodeDiffLineKind {
  if (/^(diff --git |\+\+\+ |--- |index |@@)/.test(line)) return 'meta';
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

export interface CloudCodeLineCounts {
  added: number;
  removed: number;
}

export interface CloudCodeChangeTotals extends CloudCodeLineCounts {
  files: number;
}

export const CLOUD_CODE_MINUS_SIGN = '−';

export function cloudCodeDiffLineCounts(diff: string): CloudCodeLineCounts {
  let added = 0;
  let removed = 0;
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) inHunk = false;
    else if (line.startsWith('@@')) inHunk = true;
    else if (inHunk && line.startsWith('+')) added += 1;
    else if (inHunk && line.startsWith('-')) removed += 1;
  }
  return { added, removed };
}

export function cloudCodeLineCountsByPath(diff: string): Map<string, CloudCodeLineCounts> {
  const counts = new Map<string, CloudCodeLineCounts>();
  for (const [path, section] of cloudCodeDiffByPath(diff)) {
    counts.set(path, cloudCodeDiffLineCounts(section));
  }
  return counts;
}

export function cloudCodeChangeTotals(
  files: ReadonlyArray<{ path: string }>,
  diff: string,
): CloudCodeChangeTotals {
  const totals: CloudCodeChangeTotals = { files: files.length, added: 0, removed: 0 };
  const counts = cloudCodeLineCountsByPath(diff);
  for (const file of files) {
    const own = counts.get(file.path);
    if (!own) continue;
    totals.added += own.added;
    totals.removed += own.removed;
  }
  return totals;
}

const THOUSAND = 1_000;
const MILLION = 1_000_000;
const THOUSAND_ROUNDS_UP_AT = 999_950;

function trimmedDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

export function cloudCodeCompactCount(count: number): string {
  if (count < THOUSAND) return String(count);
  if (count < THOUSAND_ROUNDS_UP_AT) return `${trimmedDecimal(count / THOUSAND)}K`;
  return `${trimmedDecimal(count / MILLION)}M`;
}

export function cloudCodeAddedLabel(count: number): string {
  return `+${cloudCodeCompactCount(count)}`;
}

export function cloudCodeRemovedLabel(count: number): string {
  return `${CLOUD_CODE_MINUS_SIGN}${cloudCodeCompactCount(count)}`;
}

export function cloudCodeFileCountLabel(count: number): string {
  return count === 1 ? '1 file' : `${count} files`;
}

export function cloudCodeFilesChangedLabel(count: number): string {
  return `${cloudCodeFileCountLabel(count)} changed`;
}

export function cloudCodeViewMoreFilesLabel(remaining: number): string {
  return `View ${remaining} more ${remaining === 1 ? 'file' : 'files'}`;
}

export function cloudCodeChangeCountsLabel({ added, removed }: CloudCodeLineCounts): string {
  return `${added} lines added, ${removed} lines removed`;
}

export const CLOUD_CODE_CHANGES_CARD_PREVIEW_ROWS = 3;

export const CLOUD_CODE_REPLY_COPY = Object.freeze({
  actions: 'Reply actions',
  copy: 'Copy reply',
  share: 'Share reply',
});

export function cloudCodeRestoreRefusedGoal(current: string, goal: string): string {
  const typed = current.trim();
  if (!typed) return goal;
  if (typed === goal) return current;
  return `${goal}\n\n${current}`;
}
