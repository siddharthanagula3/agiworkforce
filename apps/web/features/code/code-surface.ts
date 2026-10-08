import {
  buildVsCodeCloudTaskHandoffUri,
  buildVsCodeDeveloperSessionHandoffUri,
  CLOUD_CODE_LIMITS,
  CLOUD_CODE_PAGE_ROUTE,
  CLOUD_CODE_SESSION_STATUS_FILTERS,
  CLOUD_CODE_SESSION_COPY,
  cloudCodeRepositoryLabel,
  cloudCodeSessionPagePath,
  type CloudCodeChangeState,
  type CloudCodeGoalCommand,
  type CloudCodeNetworkAccess,
  type CloudCodeSession,
  type CloudCodeSessionStatusFilter,
  type CloudCodeTurnStepBound,
} from '@agiworkforce/types';
import { CLOUD_CODE_AGENT_TURN_BUDGET_MS } from '@/lib/services/cloud-code-turn-budget';

export const CODE_ROUTES = {
  root: CLOUD_CODE_PAGE_ROUTE,
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
  return cloudCodeSessionPagePath(sessionId);
}

export const CODE_LIMITS = {
  title: CLOUD_CODE_LIMITS.title,
  repositoryUrl: 500,
  repositoryBranch: 255,
  commitMessage: 500,
  command: 2000,
  task: CLOUD_CODE_LIMITS.task,
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
  composerPlaceholder: CLOUD_CODE_SESSION_COPY.composerPlaceholder,
  greetingWithName: "What's up next, {name}?",
  greeting: "What's up next?",
  send: 'Start the task',
  stopTurn: CLOUD_CODE_SESSION_COPY.stopTurn,
  stoppingTurn: CLOUD_CODE_SESSION_COPY.stoppingTurn,
  startDictation: 'Start voice input',
  repositoryChip: 'Select repository',
  repositoryUrlLabel: 'Repository URL',
  repositoryUrlPlaceholder: 'https://github.com/owner/repository',
  repositoryBranchLabel: 'Branch',
  repositoryBranchPlaceholder: 'Leave empty for the default branch',
  repositoryApply: 'Use this repository',
  repositoryClear: 'Clear repository',
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
  commitNoFilesChosen: 'Choose at least one file to commit.',
  commitChosenPrefix: 'Commits',
  commitChosenOf: 'of',
  commitChosenSuffix: 'changed files. The rest stay in the workspace.',
  changesIncludeFile: 'Include in the commit:',
  changesDiscardFile: 'Discard the changes to',
  changesDiscardTitle: 'Discard these changes?',
  changesDiscardDescription:
    'The workspace goes back to the last committed version of this file, and a new file is deleted. This cannot be undone:',
  changesDiscardConfirm: 'Discard changes',
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
  approvalHeading: CLOUD_CODE_SESSION_COPY.approvalHeading,
  approve: CLOUD_CODE_SESSION_COPY.approve,
  reject: CLOUD_CODE_SESSION_COPY.reject,
  agentWorking: CLOUD_CODE_SESSION_COPY.agentWorking,
  deploymentDisabled:
    'Managed environments are not enabled on this deployment. Existing sessions stay readable.',
  storageNotReady: 'Managed environments are not available yet. Existing sessions stay readable.',
  planNotEntitled: 'Your plan does not include managed environments.',
  upgradeHeading: 'AGI Code is on paid plans',
  upgradeBody:
    'Give a task to an agent that works in its own cloud environment, on your repository or from scratch.',
  upgradeFromPlan: 'It is included from the {plan} plan.',
  upgradeAction: 'Upgrade',
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
  sortActivity: 'Last activity',
  sortCreated: 'Created',
  sortTitle: 'Title',
  runningSession: 'Running',

  modeMenu: 'Mode',
  planMode: 'Plan',
  planModeHint: 'Reads the code and proposes changes without making any',
  turnStepsMenu: 'Steps per task',
  turnStepsUnit: 'steps',
  turnBudgetPrefix: 'A task also stops after',
  turnBudgetUnit: 'minutes.',
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
  environmentCloud: 'Cloud',
  environmentFolderUnavailable: 'Cannot run here',

  repositoryChange: 'Change repository',
  branchEdit: 'Change the branch',
  branchApply: 'Use this branch',
  branchListLabel: 'Branches',
  branchLoading: 'Loading branches',
  branchLoadFailed: 'Branches could not be loaded.',
  branchNoMatches: 'This repository has no branches yet.',
  branchProtected: 'Protected',
  branchSearchLabel: 'Search branches',
  branchSearchPlaceholder: 'Search or type a branch name',
  branchTruncated: 'Some branches are not listed. Type the full name to use one.',
  branchUseTyped: 'Use branch',
  branchSwitchFailed: 'That branch could not be checked out.',
  branchSwitchHelp:
    'Switching checks the branch out in this folder. Uncommitted changes come along when git allows it.',

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

  runningPlaceholder: CLOUD_CODE_SESSION_COPY.runningPlaceholder,
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
  share: 'Share',
  shareTitle: 'Share session',
  shareAudience: 'Who can open this session',
  sharePrivate: 'Private',
  sharePrivateHint: 'Only you can open this session.',
  shareTeam: 'Team',
  shareTeamHint: 'Members of your workspace can open it with the link.',
  sharePublic: 'Public',
  sharePublicHint: 'Anyone signed in to AGI Workforce can open it with the link.',
  shareWarning:
    'Check this session for sensitive content before you share it. It can contain code and credentials from private repositories.',
  shareSnapshotNote:
    'People who open the link see your name and the session as it is when they open it.',
  shareRepositoryNote: 'Teammates also need GitHub access to the repository to open it.',
  shareLinkLabel: 'Session link',
  shareFailed: 'Could not change who can open this session.',
  shareSaving: 'Saving who can open this session',
  shareDone: 'Done',
  stopSharingTitle: 'Stop sharing this session?',
  stopSharingDescription:
    'Everyone who has the link loses access right away. Sharing it again makes a new link, and the old one stays closed.',
  stopSharingConfirm: 'Stop sharing',
  sharedTeam: 'Shared with your team',
  sharedPublic: 'Shared by link',
  sharedLoading: 'Opening the shared session',
  sharedUnavailable: 'This shared session is not available.',
  sharedEmpty: 'Nothing has run in this session yet.',
  sharedSnapshot: 'You are viewing a shared session as it was when you opened it.',
  sharedByPrefix: 'Shared by',
  sharedUpdated: 'Updated',
  sharedOpenCode: 'Open AGI Code',
  editEnvironment: 'Edit environment',
  rename: 'Rename',
  renameLabel: 'Session title',
  renameApply: 'Rename the session',
  renameCancel: 'Keep the current title',
  archiveSession: 'Archive',
  unarchiveSession: CLOUD_CODE_SESSION_COPY.unarchiveSession,
  archivedBanner: CLOUD_CODE_SESSION_COPY.archivedBanner,
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
  pullRequestNeedsBranch: 'A pull request needs a repository and a working branch.',
  pullRequestNeedsOpenSession: 'A closed or archived session cannot open a pull request.',
  checksPassing: 'Checks passing',
  checksFailing: 'Checks failing',
  checksPending: 'Checks running',
  checksNone: 'No checks reported',
  checksUnavailable: 'Check status is unavailable',
  checksRefresh: 'Refresh the checks',
  checksLoading: 'Loading the checks',
  pullRequestMerged: 'Merged',
  pullRequestClosed: 'Closed without merging',
  reviewApproved: 'Approved',
  reviewChangesRequested: 'Changes requested',
  continueInVsCode: 'Continue in VS Code',
  continueElsewhere: 'Continue in VS Code or the terminal',
  resumeInTerminal: 'To continue in the terminal, run this in the same folder:',
  continueInVsCodeHelp:
    'Opens this session in VS Code and offers to check out its branch in the folder you have open. Commit and push first so your computer can fetch it.',
  changesSettings: 'Changes settings',
  changesExpand: 'Widen the panel',
  changesCollapse: 'Narrow the panel',
  changesNoRepository: 'This session has no repository, so there is nothing to push.',
  showExitCodes: 'Show exit codes',
} as const;

export const CODE_GOAL_COMMAND_DESCRIPTIONS: Record<CloudCodeGoalCommand, string> = {
  '/review': 'Review the changes in this session for bugs',
  '/security-review': 'Check the changes in this session for security problems',
};

export const CODE_TURN_STEP_HINTS: Record<CloudCodeTurnStepBound, string> = {
  12: 'Quick fixes and questions',
  24: 'Most tasks',
  48: 'Larger changes that take longer and use more',
};

export function turnBudgetNote(): string {
  const minutes = Math.round(
    CLOUD_CODE_AGENT_TURN_BUDGET_MS / (CODE_TIMING.msPerSecond * CODE_TIMING.secondsPerMinute),
  );
  return `${CODE_COPY.turnBudgetPrefix} ${minutes} ${CODE_COPY.turnBudgetUnit}`;
}

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

export const CODE_ENVIRONMENTS = ['local', 'cloud'] as const;
export type CodeEnvironment = (typeof CODE_ENVIRONMENTS)[number];
export const DEFAULT_CODE_ENVIRONMENT: CodeEnvironment = 'cloud';

const ENVIRONMENT_SEPARATOR = ' · ';

export function environmentChipLabel(
  environment: CodeEnvironment,
  networkAccess: CloudCodeNetworkAccess,
  folderName: string | null,
): string {
  if (environment === 'local') {
    return folderName
      ? `${CODE_COPY.environmentLocal}${ENVIRONMENT_SEPARATOR}${folderName}`
      : CODE_COPY.environmentLocal;
  }
  return `${CODE_COPY.environmentCloud}${ENVIRONMENT_SEPARATOR}${networkAccessLabel(networkAccess)}`;
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

export function continueInVsCodeHref(
  session: Pick<CloudCodeSession, 'id' | 'title' | 'workingBranch'>,
): string | null {
  if (session.workingBranch === null) return null;
  try {
    return buildVsCodeCloudTaskHandoffUri({
      runId: session.id,
      goal: session.title,
      plan: [],
      branch: session.workingBranch,
    });
  } catch {
    return null;
  }
}

export function continueLocalSessionInVsCodeHref(session: {
  id: string;
  cwd: string;
}): string | null {
  try {
    return buildVsCodeDeveloperSessionHandoffUri({ threadId: session.id, cwd: session.cwd });
  } catch {
    return null;
  }
}

const SHELL_SAFE_ARGUMENT = /^[A-Za-z0-9._:-]+$/;

export function localSessionResumeCommand(sessionId: string): string {
  const argument = SHELL_SAFE_ARGUMENT.test(sessionId)
    ? sessionId
    : `'${sessionId.replace(/'/g, `'\\''`)}'`;
  return `agi --resume ${argument}`;
}

export function parseExtraHosts(value: string): string[] {
  return value
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

export const CODE_STATUS_FILTERS = CLOUD_CODE_SESSION_STATUS_FILTERS;
export type CodeStatusFilter = CloudCodeSessionStatusFilter;

export const CODE_SORT_OPTIONS = ['activity', 'created', 'title'] as const;
export type CodeSortOption = (typeof CODE_SORT_OPTIONS)[number];

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
  return `${environment} · ${cloudCodeRepositoryLabel(session.repositoryUrl)}`;
}
