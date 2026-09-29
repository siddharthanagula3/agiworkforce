import {
  cloudCodeRepositoryLabel,
  diffPaths,
  type CloudCodeChangeState,
  type CloudCodeSession,
  type CloudCodeSessionState,
  type CloudCodeTurnMode,
  type CloudCodeTurnStepBound,
} from '@agiworkforce/types';

export const CLOUD_CODE_SCREEN_TITLE = 'AGI Code';

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

export const CLOUD_CODE_COMMIT_MESSAGE_LIMIT = 500;
export const CLOUD_CODE_COMMAND_LIMIT = 2000;

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
