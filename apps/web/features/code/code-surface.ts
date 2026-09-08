import {
  CLOUD_CODE_SESSION_STATUS_FILTERS,
  type CloudCodeChangeState,
  type CloudCodeNetworkAccess,
  type CloudCodeSession,
  type CloudCodeSessionStatusFilter,
} from '@agiworkforce/types';
import type { CloudCodeAgentStopReason } from './services/cloud-code-api';

export const CODE_ROUTES = {
  root: '/code',
  chat: '/chat',
  artifacts: '/chat/library?surface=artifact',
  customize: '/settings/capabilities',
  routines: '/chat/schedules',
  editorExtension: '/vscode-extension',
  desktop: '/download',
  connectors: '/connectors',
  usage: '/settings/usage',
  githubInstall: '/api/github/install/start',
} as const;

export const CODE_MISSING_SESSION_PARAM = 'missing';

export function codeHomeAfterMissingSession(): string {
  return `${CODE_ROUTES.root}?${CODE_MISSING_SESSION_PARAM}=1`;
}

export function codeSessionPath(sessionId: string): string {
  return `${CODE_ROUTES.root}/${encodeURIComponent(sessionId)}`;
}

export const CODE_LIMITS = {
  title: 120,
  repositoryUrl: 500,
  repositoryBranch: 255,
  commitMessage: 500,
  command: 2000,
  task: 8000,
  extraHosts: 200,
} as const;

export const CODE_SIZES = {
  railWidth: 290,
  changesWidth: 700,
  narrowViewport: 900,
} as const;

const PERCENT_MAX = 100;

export const CODE_TIMING = {
  searchDebounceMs: 250,
  elapsedTickMs: 1000,
  msPerSecond: 1000,
  secondsPerMinute: 60,
  minutesPerHour: 60,
} as const;

export const CODE_COPY = {
  surface: 'AGI Code',
  toChat: 'Go to chat',
  toCode: 'AGI Code',
  newSession: 'New',
  artifacts: 'Artifacts',
  customize: 'Customize',
  more: 'More',
  routines: 'Routines',
  editorExtension: 'Open in the editor extension',
  desktop: 'Work with local code',
  recents: 'Recents',
  filterSessions: 'Filter sessions',
  showClosed: 'Show closed sessions',
  hideClosed: 'Hide closed sessions',
  noSessions: 'No sessions yet.',
  noOpenSessions: 'No open sessions.',
  loadingSessions: 'Loading sessions',
  openingSession: 'Opening session',
  retry: 'Retry',
  retryTask: 'Run this task again',
  dismiss: 'Dismiss',
  composerPlaceholder: 'Describe a task or ask a question',
  greetingWithName: "What's up next, {name}?",
  greeting: "What's up next?",
  send: 'Start the task',
  stopTurn: 'Stop the task',
  stoppingTurn: 'Stopping the task',
  startDictation: 'Start voice input',
  repositoryChip: 'Select repository',
  repositoryUrlLabel: 'Repository URL',
  repositoryUrlPlaceholder: 'https://github.com/owner/repository',
  repositoryBranchLabel: 'Branch',
  repositoryBranchPlaceholder: 'Leave empty for the default branch',
  repositoryApply: 'Use this repository',
  repositoryClear: 'Clear repository',
  environmentChip: 'Environment',
  openEmptyEnvironment: 'Open an empty environment',
  environmentHeading: 'Network access',
  environmentImageHeading: 'Coding harness',
  emptyRuntimeCatalogue:
    'Managed Code is not configured for this deployment, so no harness can be started.',
  defaultRuntimeOption: 'No agent, Python 3, Node.js, git, curl, build-essential, GitHub CLI',
  harnessGroup: 'Coding agents',
  imageGroup: 'Environments',
  extraHostsLabel: 'Extra allowed hosts',
  extraHostsPlaceholder: 'api.example.com, *.internal.example.com',
  extraHostsHelp: 'Comma separated, one leading wildcard allowed, up to 10 hosts.',
  fullNetworkAcknowledgement:
    'I understand commands in this session can contact any internet host. The environment stays isolated and receives no AGI Workforce credentials.',
  environmentPromotedToTrusted:
    'Cloning a repository needs Trusted hosts, so choosing one raises the tier.',
  approvalMode: 'Approval mode',
  firstRunHint:
    'Commands run in an isolated environment. Nothing reaches your local files or credentials.',
  dismissHint: 'Dismiss hint',
  changes: 'Changes',
  changesHeading: 'Changes',
  closeChanges: 'Close the changes panel',
  sessionMenu: 'Session actions',
  closeSession: 'Close session',
  closeSessionTitle: 'Close this session?',
  closeSessionDescription:
    'The environment and its files are destroyed. Uncommitted work is lost and the session cannot be reopened. The transcript stays readable.',
  closeSessionConfirm: 'Close session',
  commitLabel: 'Commit message',
  commitAction: 'Commit and push',
  commitPushed: 'Pushed to the repository.',
  terminal: 'Terminal',
  terminalEmpty: 'No commands have run in this session.',
  commandLabel: 'Command',
  commandPlaceholder: 'Run a command',
  commandRun: 'Run',
  closedBanner: 'This session is closed. Start a new one to keep working.',
  closedBannerAction: 'New session',
  copyReply: 'Copy',
  copiedReply: 'Copied',
  readAloud: 'Read aloud',
  stopReading: 'Stop reading',
  approvalHeading: 'Approval required',
  approve: 'Approve and continue',
  reject: 'Reject',
  agentWorking: 'Working',
  deploymentDisabled:
    'Managed environments are not enabled on this deployment. Existing sessions stay readable.',
  storageNotReady: 'Managed environments are not available yet. Existing sessions stay readable.',
  planNotEntitled: 'Your plan does not include managed environments.',
  loadFailed: 'Something went wrong. Please retry.',
  sessionNotFound: 'That session is not available. It may have been deleted.',

  collapseRail: 'Collapse the session list',
  expandRail: 'Expand the session list',
  filterMenu: 'Filter sessions',
  filterStatus: 'Status',
  filterEnvironment: 'Environment',
  filterSort: 'Sort by',
  filterClear: 'Clear filters',
  filterAll: 'All',
  statusOpen: 'Open',
  statusClosed: 'Closed',
  statusArchived: 'Archived',
  sortActivity: 'Last activity',
  sortCreated: 'Created',
  sortTitle: 'Title',
  runningSession: 'Running',

  modeMenu: 'Mode',
  attachMenu: 'Add to this session',
  addConnectors: 'Add connectors',
  microphoneMenu: 'Microphone',
  usageMenu: 'Usage',
  contextWindow: 'Context window',
  planUsage: 'Plan usage limits',
  usageDetail: 'See detailed breakdown',
  usageSession: 'Five hour limit',
  usageWeekly: 'Weekly, all models',
  usageFlagship: 'Weekly, top model',
  usageResetPrefix: 'Resets in',
  usageUnavailable: 'Usage is not available right now.',

  environmentLocal: 'Local',
  environmentLocalHint: 'Desktop only',
  environmentCloud: 'Cloud',
  environmentRemote: 'Remote control',
  environmentRemoteHint: 'Desktop only',

  repositoryChange: 'Change repository',
  branchEdit: 'Change the branch',
  branchApply: 'Use this branch',

  repositorySearchLabel: 'Search repositories',
  repositorySearchPlaceholder: 'Search repositories',
  repositoryLoading: 'Loading repositories',
  repositoryNoMatches: 'No repositories match that search.',
  repositoryNoneReachable:
    'The installed app can reach no repositories yet. Give it access to one on GitHub.',
  repositoryLoadFailed: 'Repositories could not be loaded.',
  repositoryTruncated: 'More repositories exist. Search to narrow the list.',
  repositoryUnreachablePrefix: 'These installations could not be read:',
  repositoryPrivate: 'Private',
  repositoryUrlToggle: 'Use a repository URL instead',
  repositoryUrlHide: 'Hide the repository URL',
  firstRunRepositoryHeading: 'Two steps to work in your repository',
  firstRunConnectTitle: 'Connect your GitHub account',
  firstRunConnectCopy: 'Sign in so this surface can see the repositories you can reach.',
  firstRunInstallTitle: 'Install the GitHub app',
  firstRunInstallCopy: 'Choose which repositories the environment may clone and push.',
  firstRunAction: 'Connect GitHub',

  runningPlaceholder: 'The agent is working. Your next task can wait here.',
  initializedSession: 'Initialized session',
  stepContainer: 'Set up a cloud container',
  stepClone: 'Cloned the repository',
  stepCloneSkipped: 'No repository was attached',
  stepAgent: 'Started the coding agent',
  stepAgentSkipped: 'No coding agent was installed',
  stepFailed: 'Provisioning did not finish',
  cloningRepository: 'Cloning repository',
  transcriptNormal: 'Normal',
  transcriptVerbose: 'Verbose',
  transcriptView: 'Transcript view',
  openIn: 'Open in',
  openTerminal: 'Terminal',
  openDesktop: 'Desktop app',
  copyLink: 'Copy link',
  copiedLink: 'Link copied',
  copyLinkFailed: 'Could not copy the link',
  editEnvironment: 'Edit environment',
  rename: 'Rename',
  renameLabel: 'Session title',
  renameApply: 'Rename the session',
  renameCancel: 'Keep the current title',
  archiveSession: 'Archive',
  unarchiveSession: 'Unarchive',
  archivedBanner: 'This session is archived. Unarchive it to keep working in this session.',
  deleteSession: 'Delete',
  deleteSessionTitle: 'Delete this session?',
  deleteSessionDescription:
    'The transcript, every command it ran and its approvals go with it. Nothing here can be recovered.',
  deleteSessionConfirm: 'Delete session',
  deleteNeedsClosed: 'Close or archive the session before deleting it.',

  changesNone: 'No changes to show',
  changesRefresh: 'Refresh the changes',
  changesLoading: 'Loading changes',
  changesDiffTruncated: 'The diff is too large to show in full.',
  createPullRequest: 'Create pull request',
  creatingPullRequest: 'Opening the pull request',
  pullRequestChipPrefix: 'Pull request',
  pullRequestNeedsBranch: 'A pull request needs a repository and a working branch.',
  pullRequestNeedsOpenSession: 'A closed or archived session cannot open a pull request.',
  changesSettings: 'Changes settings',
  changesExpand: 'Widen the panel',
  changesCollapse: 'Narrow the panel',
  changesNoRepository: 'This session has no repository, so there is nothing to push.',
  showExitCodes: 'Show exit codes',
} as const;

export const CODE_NETWORK_OPTIONS: ReadonlyArray<{
  id: CloudCodeNetworkAccess;
  label: string;
  description: string;
}> = [
  {
    id: 'none',
    label: 'Isolated',
    description: 'Commands cannot reach the internet.',
  },
  {
    id: 'trusted',
    label: 'Trusted hosts',
    description: 'Package registries and code hosts only. Required to clone a repository.',
  },
  {
    id: 'full',
    label: 'Full internet',
    description: 'Unrestricted outbound access from this isolated environment.',
  },
];

export const DEFAULT_NETWORK_ACCESS: CloudCodeNetworkAccess = 'none';
export const REPOSITORY_MINIMUM_NETWORK_ACCESS: CloudCodeNetworkAccess = 'trusted';
/** The catalogue never contains an empty id, so it cannot collide with a real image. */
export const DEFAULT_RUNTIME_ID = '';
export const DEFAULT_RUNTIME_LABEL = 'Default image';

export function networkAccessLabel(access: CloudCodeNetworkAccess): string {
  return CODE_NETWORK_OPTIONS.find((option) => option.id === access)?.label ?? access;
}

const SESSION_STATE_LABELS: Record<CloudCodeSession['state'], string> = {
  ready: 'Ready',
  running: 'Running a command',
  provisioning: 'Provisioning',
  failed: 'Needs attention',
  closed: 'Closed',
};

export function sessionStateLabel(session: CloudCodeSession): string {
  return SESSION_STATE_LABELS[session.state];
}

const STOP_REASON_LABELS: Record<CloudCodeAgentStopReason, string> = {
  done: 'Finished',
  awaiting_approval: 'Waiting for your approval',
  max_steps: 'Stopped at the step limit',
  timeout: 'Timed out',
  cancelled: 'Cancelled',
  denied: 'Stopped, a command was denied',
  error: 'Failed',
};

export function stopReasonLabel(reason: CloudCodeAgentStopReason): string {
  return STOP_REASON_LABELS[reason];
}

export function stopReasonIsFailure(reason: CloudCodeAgentStopReason): boolean {
  return reason === 'error' || reason === 'denied' || reason === 'timeout';
}

export function stopReasonIsRetryable(reason: CloudCodeAgentStopReason): boolean {
  return stopReasonIsFailure(reason) || reason === 'cancelled';
}

const CHANGE_STATE_LABELS: Record<CloudCodeChangeState, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
  untracked: 'Untracked',
  conflicted: 'Conflicted',
};

export function changeStateLabel(state: CloudCodeChangeState): string {
  return CHANGE_STATE_LABELS[state];
}

export function repositoryLabel(repositoryUrl: string): string {
  const trimmed = repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || trimmed;
}

export function parseExtraHosts(value: string): string[] {
  return value
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

export function commandRanLabel(count: number): string {
  return count === 1 ? 'Ran a command' : `Ran ${count} commands`;
}

export const CODE_STATUS_FILTERS = CLOUD_CODE_SESSION_STATUS_FILTERS;
export type CodeStatusFilter = CloudCodeSessionStatusFilter;

export const CODE_SORT_OPTIONS = ['activity', 'created', 'title'] as const;
export type CodeSortOption = (typeof CODE_SORT_OPTIONS)[number];

export const CODE_STATUS_FILTER_LABELS: Record<CodeStatusFilter, string> = {
  open: CODE_COPY.statusOpen,
  closed: CODE_COPY.statusClosed,
  archived: CODE_COPY.statusArchived,
  all: CODE_COPY.filterAll,
};

export const CODE_SORT_LABELS: Record<CodeSortOption, string> = {
  activity: CODE_COPY.sortActivity,
  created: CODE_COPY.sortCreated,
  title: CODE_COPY.sortTitle,
};

export interface CodeSessionFilters {
  status: CodeStatusFilter;
  environment: CloudCodeNetworkAccess | 'all';
  sort: CodeSortOption;
}

export const DEFAULT_CODE_FILTERS: CodeSessionFilters = {
  status: 'open',
  environment: 'all',
  sort: 'activity',
};

export function filtersAreDefault(filters: CodeSessionFilters): boolean {
  return (
    filters.status === DEFAULT_CODE_FILTERS.status &&
    filters.environment === DEFAULT_CODE_FILTERS.environment &&
    filters.sort === DEFAULT_CODE_FILTERS.sort
  );
}

export function filterAndSortSessions(
  sessions: CloudCodeSession[],
  filters: CodeSessionFilters,
): CloudCodeSession[] {
  const matched = sessions.filter(
    (session) => filters.environment === 'all' || session.networkAccess === filters.environment,
  );
  const sorted = [...matched];
  if (filters.sort === 'title') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (filters.sort === 'created') {
    sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
    sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return sorted;
}

export function sessionIsBusy(session: CloudCodeSession): boolean {
  return session.state === 'running' || session.state === 'provisioning';
}

export type CodeStepState = 'done' | 'skipped' | 'failed';

export interface CodeProvisioningStep {
  id: string;
  label: string;
  state: CodeStepState;
}

/**
 * The session API reports no step list, so the checklist states only what the
 * session record itself proves: the container exists, a repository was attached,
 * an agent image was chosen.
 */
export function provisioningSteps(session: CloudCodeSession): CodeProvisioningStep[] {
  const provisioned: CodeStepState = session.state === 'failed' ? 'failed' : 'done';
  return [
    { id: 'container', label: CODE_COPY.stepContainer, state: provisioned },
    session.repositoryUrl
      ? { id: 'clone', label: CODE_COPY.stepClone, state: provisioned }
      : { id: 'clone', label: CODE_COPY.stepCloneSkipped, state: 'skipped' },
    session.runtimeId
      ? { id: 'agent', label: CODE_COPY.stepAgent, state: provisioned }
      : { id: 'agent', label: CODE_COPY.stepAgentSkipped, state: 'skipped' },
  ];
}

const TOKENS_PER_THOUSAND = 1000;
const TOKENS_PER_MILLION = 1000000;
const TOKEN_DECIMALS = 1;
const TRAILING_ZERO = /\.0$/;

function trimTokenDecimal(value: number): string {
  return value.toFixed(TOKEN_DECIMALS).replace(TRAILING_ZERO, '');
}

export function formatTokenCount(tokens: number): string {
  const safe = Math.max(0, Math.round(tokens));
  if (safe < TOKENS_PER_THOUSAND) return String(safe);
  if (safe < TOKENS_PER_MILLION) return `${trimTokenDecimal(safe / TOKENS_PER_THOUSAND)}k`;
  return `${trimTokenDecimal(safe / TOKENS_PER_MILLION)}M`;
}

export function contextWindowLabel(used: number, window: number): string {
  const percent = Math.min(PERCENT_MAX, Math.round((used / window) * PERCENT_MAX));
  return `${formatTokenCount(used)} / ${formatTokenCount(window)} (${percent}%)`;
}

export function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / CODE_TIMING.msPerSecond));
  const seconds = totalSeconds % CODE_TIMING.secondsPerMinute;
  const totalMinutes = Math.floor(totalSeconds / CODE_TIMING.secondsPerMinute);
  const minutes = totalMinutes % CODE_TIMING.minutesPerHour;
  const hours = Math.floor(totalMinutes / CODE_TIMING.minutesPerHour);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatResetIn(resetAt: string | null | undefined, now: number): string | null {
  if (!resetAt) return null;
  const target = new Date(resetAt).getTime();
  if (!Number.isFinite(target) || target <= now) return null;
  return `${CODE_COPY.usageResetPrefix} ${formatElapsed(target - now)}`;
}

/** The reference header chip reads "<environment> · <repository>". */
export function sessionContextChip(session: CloudCodeSession): string {
  const environment = networkAccessLabel(session.networkAccess);
  if (!session.repositoryUrl) return environment;
  return `${environment} · ${repositoryLabel(session.repositoryUrl)}`;
}
