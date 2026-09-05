import type { CloudCodeNetworkAccess, CloudCodeSession } from '@agiworkforce/types';
import type { CloudCodeAgentStopReason } from './services/cloud-code-api';

export const CODE_ROUTES = {
  root: '/chat/code',
  chat: '/chat',
  artifacts: '/chat/library?surface=artifact',
  customize: '/settings/capabilities',
  routines: '/chat/schedules',
  editorExtension: '/vscode-extension',
  desktop: '/download',
  connectors: '/connectors',
  usage: '/settings/usage',
} as const;

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

export const CODE_TIMING = {
  elapsedTickMs: 1000,
  msPerSecond: 1000,
  secondsPerMinute: 60,
  minutesPerHour: 60,
} as const;

export const CODE_COPY = {
  surface: 'Code',
  toChat: 'Go to chat',
  toCode: 'Code',
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
  dismiss: 'Dismiss',
  composerPlaceholder: 'Describe a task or ask a question',
  greetingWithName: "What's up next, {name}?",
  greeting: "What's up next?",
  send: 'Start the task',
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
  environmentPromotedToTrusted: 'Cloning a repository needs Trusted hosts, so the tier was raised.',
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
  sortActivity: 'Last activity',
  sortCreated: 'Created',
  sortTitle: 'Title',
  runningSession: 'Running',

  modeMenu: 'Mode',
  attachMenu: 'Add to this session',
  addConnectors: 'Add connectors',
  microphoneMenu: 'Microphone',
  usageMenu: 'Usage',
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

  repositoryAdd: 'Add a repository',
  branchChip: 'Branch',

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
  editEnvironment: 'Edit environment',

  changesBranchFrom: 'Cloned from',
  changesNone: 'No changes to show',
  changesCheck: 'Check for changes',
  changesChecking: 'Checking',
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

export const CODE_STATUS_FILTERS = ['all', 'open', 'closed'] as const;
export type CodeStatusFilter = (typeof CODE_STATUS_FILTERS)[number];

export const CODE_SORT_OPTIONS = ['activity', 'created', 'title'] as const;
export type CodeSortOption = (typeof CODE_SORT_OPTIONS)[number];

export const CODE_STATUS_FILTER_LABELS: Record<CodeStatusFilter, string> = {
  all: CODE_COPY.filterAll,
  open: CODE_COPY.statusOpen,
  closed: CODE_COPY.statusClosed,
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
  const matched = sessions.filter((session) => {
    if (filters.status === 'open' && session.state === 'closed') return false;
    if (filters.status === 'closed' && session.state !== 'closed') return false;
    if (filters.environment !== 'all' && session.networkAccess !== filters.environment)
      return false;
    return true;
  });
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
