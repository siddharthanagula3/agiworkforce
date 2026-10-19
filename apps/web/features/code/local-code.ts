import { translateUiPlural } from '@agiworkforce/ui';
import {
  DEVELOPER_AGENT_MODES,
  isSshEnvironmentId,
  DEVELOPER_FILE_CHANGE_LABELS,
  DEVELOPER_SESSION_ORIGIN_LABELS,
  DEVELOPER_SESSION_TRUST_LABELS,
  type DeveloperAgentMode,
  type DeveloperApprovalDecision,
  type DeveloperApprovalRequest,
  type DeveloperUserInputRequest,
  type DeveloperFileChange,
  type DeveloperMcpServerAwaitingApproval,
  type DeveloperRuntimeModels,
  type DeveloperSessionEvent,
  type DeveloperSessionGroup,
  type DeveloperSessionStartRequest,
  type DeveloperTurnFailure,
  type DeveloperTurnOutcome,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import type { DeveloperMessage, ThreadStatus } from '@agiworkforce/types/protocol';
import {
  CLOUD_CODE_DEFAULT_TURN_MODE,
  providerLabels,
  type CloudCodeAgentStep,
  type CloudCodeAgentStopReason,
  type CloudCodeGoalCommand,
} from '@agiworkforce/types';
import { getModelMetadata } from '@shared/config/llm';
import type { CodeTranscriptItem } from '@agiworkforce/cloud-contracts';

export const LOCAL_REVIEW_COMMAND: CloudCodeGoalCommand = '/review';

export const LOCAL_CODE_COPY = {
  heading: 'On this device',
  skipChoice: 'Skip the question',
  addFolder: 'Add a folder',
  addRepository: 'Add a repository',
  addingFolder: 'Choosing…',
  runTests: 'Run tests',
  stopTests: 'Stop tests',
  runningTests: (command: string): string => `Running ${command}`,
  testsPassed: (command: string): string => `${command} passed.`,
  testsFailed: (command: string, exitCode: number | null): string =>
    exitCode === null ? `${command} was stopped.` : `${command} failed with exit code ${exitCode}.`,
  testsTimedOut: (command: string): string => `${command} ran past its time limit and was stopped.`,
  testsNotFound:
    'No test command found here. Add a test script to package.json, or a Cargo.toml, go.mod or pyproject.toml.',
  testsCouldNotStart: 'The tests could not be started.',
  testOutput: 'Test output',
  openInEditor: 'Open in VS Code',
  editorFailed: 'VS Code could not be opened.',
  newSessionPrefix: 'New session in',
  empty: 'No coding sessions on this device yet.',
  emptyNoFolders: 'No folder on this device is open to AGI yet.',
  sessionsWithheld: 'Allow running commands in this folder to see its sessions.',
  allowSessions: 'Allow running commands',
  allowingSessions: 'Waiting for your answer',
  sessionsRefused:
    'Running commands in this folder was refused. That lasts until you quit AGI Cloud, or until you withdraw the answer in Settings, under Capabilities.',
  allowSessionsFailed: 'This folder could not be opened to coding sessions.',
  mcpAwaitingApproval: (name: string): string =>
    `The MCP server ${name} has not started. This project names it, and it waits for your approval.`,
  reviewMcpServer: (name: string): string => `Review ${name}…`,
  reviewingMcpServer: 'Waiting for your answer',
  mcpReviewFailed: 'That server could not be reviewed.',
  gitOff: (reason: string): string => `Git status is off for this folder: ${reason}.`,
  loading: 'Loading local sessions',
  openingSession: 'Opening session',
  composerPlaceholder: 'Continue this session',
  send: 'Send',
  stop: 'Stop',
  stopping: 'Stopping',
  working: 'Working',
  back: 'Back to cloud sessions',
  transcriptTruncated: 'Only the most recent messages are shown.',
  approvalHeading: 'Approval required',
  approve: 'Approve and continue',
  reject: 'Deny',
  runtimeStopped: 'The local runtime stopped.',
  activityReloaded:
    'Some live activity could not be kept. The session was read again; check its history for details.',
  startFailed: 'That session could not be started.',
  switchToReadyModel: 'Switch to a ready model',
  modelNeedsSetup: (model: string, provider: string): string =>
    `${model} cannot run on this machine yet: ${provider} needs a sign-in first.`,
  readFailed: 'That session could not be opened.',
  turnFailed: 'That message could not be sent.',
  changesFailed: 'The changes in this folder could not be read.',
  changesNotRepository: 'This folder is not a git repository, so there are no changes to show.',
  discardFailed: 'That change could not be discarded.',
  commandFailed: 'That command could not be run.',
  editFile: 'Edit',
  reviewCode: 'Review code',
  closeFile: 'Close the file',
  openingFile: 'Opening the file',
  saveFile: 'Save',
  fileReadFailed: 'That file could not be opened.',
  fileSaveFailed: 'That file could not be saved.',
  fileUnsupportedEncoding: 'This file is not UTF-8. Open it in your editor to change it.',
  discardLocalEditsDescription:
    'Your unsaved file edits will be discarded. You cannot recover them after leaving.',
  fileTooLarge: 'This file is too large to edit here. Open it in your editor instead.',
  discardFileEdits: 'Discard',
  reloadFile: 'Reload',
  overwriteFile: 'Overwrite',
  fileChangedOnDisk: 'This file changed on disk since you opened it.',
  fileDeletedOnDisk:
    'This file was deleted since you opened it. Overwrite to create it again with your version.',
  files: 'Files',
  filesShortcut: 'Files (⌘P)',
  closeFiles: 'Close files',
  searchFiles: 'Search files by name',
  filesLoading: 'Listing files',
  filesEmpty: 'This folder is empty.',
  filesNoMatch: 'No file names match.',
  filesFailed: 'The files in this folder could not be listed.',
  openFiles: 'Open files',
  closeTab: (name: string): string => `Close ${name}`,
  discardEditsTitle: 'Discard your edits?',
  discardEditsDescription: (path: string): string =>
    `Your unsaved edits to ${path} cannot be recovered.`,
  overwriteFileTitle: 'Overwrite the file on disk?',
  overwriteFileDescription: (path: string): string =>
    `Your version replaces what is on disk at ${path} now. Changes made there since you opened it cannot be recovered unless they were committed.`,
  pushAndOpenPullRequest: 'Push and open a pull request',
  pullRequestOnGitHub: 'Open a pull request on GitHub',
  pullRequestNotConnected:
    'The AGI GitHub App is not installed on this repository, so GitHub opens the compare page instead.',
  pullRequestOnBase: 'Switch to a branch other than the default branch to open a pull request.',
  pullRequestNoBase: 'The remote has no default branch to open a pull request against.',
  pullRequestReadFailed: 'The pull request for this branch could not be read.',
  pullRequestOpenFailed: 'The pull request could not be opened.',
  commandStopped: 'stopped',
  extensions: 'Skills and plugins',
  skillsHeading: 'Skills',
  pluginsHeading: 'Plugins',
  extensionsLoading: 'Loading skills and plugins',
  extensionsFailed: 'Skills and plugins could not be read.',
  extensionsUpdateFailed: 'That change could not be saved.',
  extensionsNone: 'No skills or plugins are installed for this folder.',
  projectSkillsUntrusted:
    "This folder's own skills stay off until you trust them. Trusted skills can run their scripts with your account.",
  trustProjectSkills: "Trust this folder's skills",
  revokeProjectSkills: "Stop trusting this folder's skills",
  skillScopeLabels: { project: 'This folder', user: 'Your account', plugin: 'From a plugin' },
  memory: 'Memory',
  memoryHeading: 'Remember for later sessions',
  memoryLabel: 'What to remember',
  memoryPlaceholder: 'A fact about this repository the agent should keep in mind',
  memoryProject: 'Project memory',
  memoryProjectHint: 'Saved in this repository and shared through git.',
  memoryUser: 'User memory',
  memoryUserHint: 'Saved for all your projects on this computer.',
  memorySave: 'Save to memory',
  memorySaving: 'Saving to memory',
  memorySavedTo: 'Saved to',
  memoryFailed: 'That could not be saved to memory.',
  steerPlaceholder: 'Add to the running turn',
  queuePlaceholder: 'Queue a follow-up',
  steer: 'Send to the running turn',
  queue: 'Queue',
  queued: (count: number): string => (count === 1 ? '1 queued' : `${count} queued`),
  queuedMessage: 'Queued message',
  editQueued: 'Edit',
  saveQueued: 'Save',
  removeQueued: 'Remove',
  sendQueuedNow: 'Send now',
  queuePaused: 'The turn stopped, so the queue is waiting for you.',
  steerQueued: 'The running turn could not take that message, so it was queued instead.',
  steered: 'Sent to the running turn',
  steersReturned: (count: number): string =>
    count === 1
      ? 'The turn ended before it read your last message, so it is back in the queue.'
      : `The turn ended before it read your last ${count} messages, so they are back in the queue.`,
  queueFull: 'The queue is full. Send or remove a queued message first.',
  filesQueued:
    'Files from the folder are read when a turn starts, so this message is queued for the next turn.',
  unsentQueued: 'That message was not sent. It is at the head of the queue for you to send again.',
  modelsStale:
    'The model list for this folder could not be refreshed, so it shows what was read last.',
  sentWhileBusyQueued: 'A turn was already starting, so that message is queued to send after it.',
  bypassDeclined:
    'Bypass permissions was not allowed, so that message was not sent. It is back in the message box.',
  stopShortcut: 'Stop (Esc)',
  agentMode: 'Permissions',
  reasoningEffort: 'Reasoning',
  reasoningDefault: 'Default',
  approvalFolder: 'Folder',
  approvalIrreversible: 'Cannot be undone',
  approvalMore: (count: number): string =>
    count === 1 ? '1 more approval is waiting.' : `${count} more approvals are waiting.`,
  alwaysAllowTitle: 'Always allow this command?',
  alwaysAllowBody: (prefix: string): string =>
    `From now on the agent runs any command that starts with "${prefix}" without asking, in every folder on this computer and in every session. The rule is saved in the AGI CLI on this computer and stays until you remove it there.`,
  alwaysAllowConfirm: 'Always allow',
  turnChanges: (count: number): string =>
    translateUiPlural('chat', 'counts.changedFiles', count, {
      one: 'Changed {{count}} file',
      other: 'Changed {{count}} files',
    }),
  addContextFile: 'Add a file from this folder',
  contextFilesHeading: 'Files from this folder',
  openFolderUp: 'Up one folder',
  folderEmpty: 'No files here.',
  listFailed: 'This folder could not be listed.',
  removeContextFile: (path: string): string => `Remove ${path}`,
  imagesOnly: 'Only images can be pasted into a coding session. Add other files from this folder.',
  imagesNeedUpdate:
    'Pasting images into a coding session needs a newer version of AGI Cloud. Update the app, then try again.',
  tooManyImages: (limit: number): string => `A message can carry at most ${limit} images.`,
  tooManyFiles: (limit: number): string => `A message can carry at most ${limit} files.`,
  imageTooLarge: (limit: string): string => `Images must be ${limit} or smaller.`,
  sessionRunning: 'Running',
  sessionNeedsApproval: 'Needs approval',
  sessionFailed: 'Failed',
  sessionNeedsInput: 'Waiting for your answer',
  questionHeading: 'The agent has a question',
  answerLabel: 'Your answer',
  sendAnswer: 'Send answer',
  skipQuestion: 'Skip',
  questionMore: (count: number): string =>
    count === 1 ? '1 more question is waiting.' : `${count} more questions are waiting.`,
  sessionNotFound: 'That coding session is not on this device any more.',
  deleteSession: 'Delete session',
  deleteSessionWhileRunning: 'Stop the running turn before deleting this session.',
  deleteSessionTitle: 'Delete this session?',
  deleteSessionConfirm: 'Delete session',
  deleteFailed: 'That session could not be deleted.',
  archiveSession: 'Archive session',
  archiveSessionWhileRunning: 'Stop the running turn before archiving this session.',
  archiveSessionTitle: 'Archive this session?',
  archiveSessionConfirm: 'Archive session',
  archiveFailed: 'That session could not be archived.',
  takeOver: 'Take over',
  takeOverTitle: 'Take over this session?',
  takeOverConfirm: 'Take over',
  takeOverFailed: 'This session could not be taken over.',
  heldByAnotherProgram: 'Another program is writing this session.',
  heldElsewhere: (holder: string): string =>
    `${holder} Wait until it hands the session back, or take the session over to continue here.`,
  heldElsewhereNeedsUpdate: (holder: string): string =>
    `${holder} Wait until it hands the session back, then send your message again.`,
  deleteArchives: 'Delete them too',
  deleteArchivesTitle: 'Delete the kept worktree archives?',
  deleteArchivesConfirm: 'Delete archives',
  keptArchivesList: 'Kept archives',
  cleanupFailuresList: 'Worktrees left in place',
  dismiss: 'Dismiss',
  agentModeShortcut: 'Switch between Ask, Auto and Plan (Ctrl+Shift+M, or Cmd+Shift+M on a Mac)',
  agentModeNow: (label: string): string => `Permissions: ${label}`,
  forkHere: 'Branch from here',
  forkHereLabel: 'Start a new session with the conversation up to the end of this turn',
  forkFailed: 'A new session could not be started from that turn.',
  compactSession: 'Summarize conversation',
  compactSessionWhileRunning: 'Stop the running turn before summarizing this session.',
  compactTitle: 'Summarize this conversation?',
  compactBody:
    "This session's model condenses the older messages into one summary, so the agent has room to keep working. You still see every message here, but from now on the agent reads only the summary of them, and turns before the summary can no longer be rewound to. This cannot be undone. Your most recent turns and the files in this folder stay as they are.",
  compactConfirm: 'Summarize',
  compactFailed: 'This session could not be summarized.',
  compactRunning: 'Summarizing the conversation',
  compactCancel: 'Cancel',
  compactCancelled: 'Summarizing was cancelled. The conversation is unchanged.',
  compactCancelFailed: 'Summarizing could not be cancelled.',
  compactNothing: 'This conversation is still short, so nothing was summarized.',
  compacted: (before: number, after: number): string =>
    `Summarized the conversation, from about ${Math.max(1, Math.round(before / 1000))}K to ${Math.max(1, Math.round(after / 1000))}K tokens.`,
} as const;

const LOCAL_SESSION_STATUS_LABELS: Partial<Record<ThreadStatus, string>> = {
  archived: 'Archived',
};

const LOCAL_PULL_REQUEST_STATE_LABELS = {
  open: 'open',
  draft: 'draft',
  merged: 'merged',
  closed: 'closed',
} as const;

const LOCAL_PULL_REQUEST_CHECK_LABELS = {
  passing: 'checks passing',
  failing: 'checks failing',
  pending: 'checks running',
  none: '',
} as const;

export function localPullRequestLabel(pullRequest: {
  number: number;
  state: keyof typeof LOCAL_PULL_REQUEST_STATE_LABELS;
  checks: keyof typeof LOCAL_PULL_REQUEST_CHECK_LABELS;
}): string {
  return [
    `Pull request #${pullRequest.number}`,
    LOCAL_PULL_REQUEST_STATE_LABELS[pullRequest.state],
    LOCAL_PULL_REQUEST_CHECK_LABELS[pullRequest.checks],
  ]
    .filter(Boolean)
    .join(' · ');
}

export function localSessionStatusLabel(status: ThreadStatus): string | null {
  return LOCAL_SESSION_STATUS_LABELS[status] ?? null;
}

export const LOCAL_AGENT_MODE_HINTS: Record<DeveloperAgentMode, string> = {
  plan: 'Reads and plans. Changes nothing.',
  ask: 'Asks before each edit or command.',
  auto: 'Edits files in this folder and runs safe commands without asking. Asks before anything else, such as changing git hooks or MCP servers.',
  bypass: 'Does everything without asking, changes to git hooks and MCP servers included.',
};

export const LOCAL_FALLBACK_AGENT_MODE: DeveloperAgentMode = 'ask';

/** The postures a thread may remember. Bypass is chosen each time and never kept. */
export function rememberableAgentMode(mode: unknown): DeveloperAgentMode | null {
  const known = DEVELOPER_AGENT_MODES.find((candidate) => candidate === mode);
  return known && known !== 'bypass' ? known : null;
}

/** Bypass is left out, so no keystroke can reach it without its confirmation. */
const CYCLED_AGENT_MODES: readonly DeveloperAgentMode[] = ['ask', 'auto', 'plan'];

export function nextCycledAgentMode(current: DeveloperAgentMode): DeveloperAgentMode {
  const index = CYCLED_AGENT_MODES.indexOf(current);
  return CYCLED_AGENT_MODES[(index + 1) % CYCLED_AGENT_MODES.length] ?? LOCAL_FALLBACK_AGENT_MODE;
}

export const LOCAL_APPROVAL_DECISION_LABELS: Record<DeveloperApprovalDecision, string> = {
  approve_once: 'Allow once',
  approve_for_session: 'Allow for this session',
  always_allow_command: 'Always allow',
  deny: 'Deny',
  deny_and_stop: 'Deny and stop',
};

export const LOCAL_APPROVAL_RISK_LABELS = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
} as const;

export type LocalApproval = DeveloperApprovalRequest & { turnId: string };

export type LocalQuestion = DeveloperUserInputRequest & { turnId: string };

/** The decisions one request offers, allowing first. */
export function localApprovalDecisions(approval: LocalApproval): DeveloperApprovalDecision[] {
  return [
    'approve_once',
    'approve_for_session',
    ...(approval.proposedCommandPrefix?.length ? (['always_allow_command'] as const) : []),
    'deny',
    'deny_and_stop',
  ];
}

export const LOCAL_SESSION_MARKERS = [
  'running',
  'needs-approval',
  'needs-input',
  'failed',
] as const;

export type LocalSessionMarker = (typeof LOCAL_SESSION_MARKERS)[number];

export const LOCAL_SESSION_MARKER_LABELS: Record<LocalSessionMarker, string> = {
  running: LOCAL_CODE_COPY.sessionRunning,
  'needs-approval': LOCAL_CODE_COPY.sessionNeedsApproval,
  'needs-input': LOCAL_CODE_COPY.sessionNeedsInput,
  failed: LOCAL_CODE_COPY.sessionFailed,
};

/**
 * What a session's row should say after one runtime event, or undefined when
 * the event says nothing about it. A turn that ends any way but failing clears
 * the row, because nothing about it then needs the reader.
 */
export function nextSessionMarker(
  current: LocalSessionMarker | null,
  event: Exclude<DeveloperSessionEvent, { type: 'runtime-stopped' }>,
): LocalSessionMarker | null | undefined {
  switch (event.type) {
    case 'turn-started':
      return 'running';
    case 'approval-requested':
      return 'needs-approval';
    case 'approval-answered':
      return current === 'needs-approval' ? 'running' : current;
    case 'user-input-requested':
      return 'needs-input';
    case 'user-input-answered':
      return current === 'needs-input' ? 'running' : current;
    case 'turn-finished':
      return event.outcome === 'failed' ? 'failed' : null;
    case 'worktree-setup-log':
    case 'worktree-setup-finished':
      return undefined;
    default:
      return current === null ? 'running' : undefined;
  }
}

/** The row's marker: what the runtime said since this page loaded, else what the CLI listed. */
export function localSessionMarker(
  session: LocalDeveloperSession,
  live: LocalSessionMarker | null | undefined,
): LocalSessionMarker | null {
  if (live !== undefined) return live;
  if (session.status === 'running') return 'running';
  if (session.status === 'awaiting_approval') return 'needs-approval';
  if (session.status === 'failed') return 'failed';
  return null;
}

export interface LocalQueuedMessage {
  id: string;
  text: string;
  images: string[];
  contextFiles: string[];
}

/**
 * A model as the catalog names it. A model the catalog does not carry, which is
 * any model pulled locally, keeps its own id rather than being hidden.
 */
export function localModelLabel(modelId: string | null): string | null {
  if (!modelId) return null;
  return getModelMetadata(modelId)?.name ?? modelId;
}

export function localProviderLabel(providerId: string | null): string | null {
  if (!providerId) return null;
  return providerLabels[providerId] ?? providerId;
}

/**
 * The failure as this surface says it.
 *
 * The CLI writes for a terminal, so its own line names an environment variable
 * and a shell command. Where the code says exactly what went wrong, the desktop
 * says it in its own words; where it does not, the CLI's line is still the best
 * description anyone has and is shown unchanged.
 */
/** The route that bills the AGI Workforce account, which the app signs in. */
function isManagedAccountRoute(provider: string | null): boolean {
  return provider === 'managed_cloud';
}

export function localTurnFailureSentence(failure: DeveloperTurnFailure): string {
  const provider = localProviderLabel(failure.provider);
  const login = failure.provider ? `\`agi login ${failure.provider}\`` : null;

  // The account's own route is signed in by this app, never from a terminal:
  // a missing or expired managed session means the app's sign-in has to be
  // renewed, and "agi login managed_cloud" is not something a desktop user runs.
  if (
    failure.code === 'account_signed_out' ||
    (isManagedAccountRoute(failure.provider) &&
      (failure.code === 'provider_auth_missing' || failure.code === 'provider_auth_invalid'))
  ) {
    return 'This session could not use your AGI Workforce account because its sign-in has ended. Sign out of AGI Workforce and sign back in, then start a new session.';
  }
  if (failure.code === 'plan_excludes_model') {
    return 'Your plan does not include this model. Choose another model for the session, or change your plan in Billing.';
  }

  if (failure.code === 'provider_auth_missing' && provider && login) {
    return `No ${provider} key on this computer. Run ${login} in a terminal, then start a new session.`;
  }
  if (failure.code === 'provider_auth_invalid' && provider && login) {
    return `This computer's ${provider} key was refused. Run ${login} in a terminal to replace it.`;
  }
  if (failure.code === 'provider_rate_limited' && provider) {
    return `${provider} is rate limiting this computer. Wait a moment and send it again.`;
  }
  if (failure.code === 'free_allowance_exhausted') {
    return "The free model has used up the allowance everyone on the Free plan shares, so this is not a limit on this account. It reopens on the provider's own schedule, so send it again later.";
  }
  if (failure.code === 'usage_limit_reached') {
    return 'This account has reached a usage limit its plan sets. Open Usage to see when it resets, then send it again.';
  }
  if (failure.code === 'provider_unavailable' && provider) {
    return `${provider} could not be reached from this computer.`;
  }
  if (failure.code === 'stream_interrupted') {
    return provider
      ? `${provider} stopped part way through the response. Send it again to get the rest.`
      : 'The response stopped part way through. Send it again to get the rest.';
  }
  if (failure.code === 'output_limit_reached') {
    return "The answer reached this model's maximum length and stopped there. Ask for a shorter answer, or split the request.";
  }
  if (failure.code === 'refused_by_safety') {
    return 'The safety system stopped this response. Rephrase the request and send it again.';
  }
  if (failure.code === 'network') {
    return 'This computer could not reach the network.';
  }
  if (failure.code === 'context_window_exceeded') {
    return 'This session is longer than the model can read. Start a new one to carry on.';
  }
  if (failure.code === 'tool_denied') {
    return 'The agent stopped because a command it needed was denied.';
  }
  if (failure.code === 'timeout') {
    return 'The turn ran too long and was stopped.';
  }
  return failure.message;
}

/**
 * What this surface can actually do about a failure.
 *
 * Signing a provider in happens in a terminal, so the offer is the command
 * rather than a button that cannot do what it says. An action the desktop
 * cannot carry out gets no button at all.
 */
export type LocalFailureAction = { kind: 'retry' } | { kind: 'copy'; text: string } | null;

export function localOfferFor(
  action: DeveloperTurnFailure['action'],
  provider: string | null,
  retryable: boolean,
): LocalFailureAction {
  if (action === 'retry' && retryable) return { kind: 'retry' };
  if (action === 'sign_in_provider' && provider && !isManagedAccountRoute(provider)) {
    return { kind: 'copy', text: `agi login ${provider}` };
  }
  return null;
}

export function localFailureAction(failure: DeveloperTurnFailure): LocalFailureAction {
  return localOfferFor(failure.action, failure.provider, failure.retryable);
}

/**
 * What "Send it again" would send for a failed turn, or null when this page
 * never saw what was asked: a turn started from a phone or the CLI, or one
 * already running when the session was opened, has no prompt here, and its
 * question is known only if the stored conversation carries it for that turn.
 */
export function localRetryPrompt(
  turn: Pick<LocalTurn, 'prompt' | 'turnId'>,
  messages: readonly DeveloperMessage[],
): string | null {
  if (turn.prompt.trim() !== '') return turn.prompt;
  if (turn.turnId === null) return null;
  const asked = messages.filter(
    (message) => message.role === 'user' && message.turnId === turn.turnId,
  );
  const text = asked[asked.length - 1]?.text ?? '';
  return text.trim() === '' ? null : text;
}

export const LOCAL_FAILURE_ACTION_LABELS = {
  retry: 'Send it again',
  copy: 'Copy the sign-in command',
  copied: 'Copied',
} as const;

export interface LocalModelChoice {
  id: string;
  label: string;
  /** Why this model is offered, which is also how far it has been proven. */
  evidence: 'reachable' | 'used-here' | 'installed' | 'configured';
}

/**
 * One route the host cannot reach, and what makes it reachable. Reachability
 * cannot differ inside a route, so the row is the route, not each model on it.
 */
export interface LocalProviderSetup {
  provider: string;
  label: string;
  count: number;
  offer: LocalFailureAction;
}

const EVIDENCE_ORDER: Record<LocalModelChoice['evidence'], number> = {
  reachable: 0,
  'used-here': 1,
  installed: 2,
  configured: 3,
};

export const LOCAL_MODEL_EVIDENCE_LABELS: Record<LocalModelChoice['evidence'], string> = {
  reachable: 'Ready on this device',
  'used-here': 'Used in this folder',
  installed: 'On this computer',
  configured: 'The CLI default',
};

export const LOCAL_MODEL_SETUP_HEADING = 'Needs setup on this machine';

export function localModelSetupCount(setup: LocalProviderSetup): string {
  return translateUiPlural('settings', 'counts.models', setup.count, {
    one: '{{count}} model',
    other: '{{count}} models',
  });
}

/**
 * The models offered for a session in one folder. A CLI that predates
 * `hostModels` gives no verdict, so there the folder's history stands in.
 */
export function localModelChoices(
  runtime: DeveloperRuntimeModels | null,
  sessions: readonly LocalDeveloperSession[],
): LocalModelChoice[] {
  const byId = new Map<string, LocalModelChoice>();

  if (runtime !== null && runtime.hostModels.length > 0) {
    for (const model of runtime.hostModels) {
      if (!model.reachable || byId.has(model.id)) continue;
      byId.set(model.id, {
        id: model.id,
        label: localModelLabel(model.id) ?? model.id,
        evidence: 'reachable',
      });
    }
  } else {
    for (const session of sessions) {
      if (!session.model || byId.has(session.model)) continue;
      byId.set(session.model, {
        id: session.model,
        label: localModelLabel(session.model) ?? session.model,
        evidence: 'used-here',
      });
    }
    for (const model of runtime?.models ?? []) {
      if (byId.has(model.id)) continue;
      byId.set(model.id, {
        id: model.id,
        label: localModelLabel(model.id) ?? model.id,
        evidence: 'installed',
      });
    }
  }

  const configured = runtime?.defaultModelId;
  if (configured && !byId.has(configured) && localModelSetup(runtime, configured) === null) {
    byId.set(configured, {
      id: configured,
      label: localModelLabel(configured) ?? configured,
      evidence: 'configured',
    });
  }

  return [...byId.values()].sort((a, b) => EVIDENCE_ORDER[a.evidence] - EVIDENCE_ORDER[b.evidence]);
}

/** The routes the host cannot reach, one row each, most models first. */
export function localProviderSetups(runtime: DeveloperRuntimeModels | null): LocalProviderSetup[] {
  const byProvider = new Map<string, LocalProviderSetup>();

  for (const model of runtime?.hostModels ?? []) {
    if (model.reachable || model.unreachable === null) continue;
    const provider = model.unreachable.provider ?? model.provider;
    const existing = byProvider.get(provider);
    if (existing !== undefined) {
      existing.count += 1;
      continue;
    }
    byProvider.set(provider, {
      provider,
      label: localProviderLabel(getModelMetadata(model.id)?.provider ?? null) ?? provider,
      count: 1,
      offer: localOfferFor(model.unreachable.action, provider, false),
    });
  }

  return [...byProvider.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

/** The route a model needs before it can run, or null when it can run now. */
export function localModelSetup(
  runtime: DeveloperRuntimeModels | null,
  modelId: string | null,
): LocalProviderSetup | null {
  if (!modelId) return null;
  const host = (runtime?.hostModels ?? []).find((model) => model.id === modelId);
  if (host === undefined || host.reachable || host.unreachable === null) return null;
  const provider = host.unreachable.provider ?? host.provider;
  return localProviderSetups(runtime).find((setup) => setup.provider === provider) ?? null;
}

const TOP_QUALITY_TIER = 'best';

function offeredCost(modelId: string): number {
  const metadata = getModelMetadata(modelId);
  if (!metadata) return 0;
  return metadata.inputCost + metadata.outputCost;
}

function isTopTier(modelId: string): boolean {
  return getModelMetadata(modelId)?.qualityTier === TOP_QUALITY_TIER;
}

/**
 * The model a session started here begins on. A top-tier route is never the
 * silent choice, so the folder's own history comes first, then the host's
 * default while it is not top tier, then the cheapest route on offer. A model
 * the catalog does not price is one this machine runs itself, and costs nothing
 * to call.
 */
export function startingModelId(
  runtime: DeveloperRuntimeModels | null,
  sessions: readonly LocalDeveloperSession[],
): string | undefined {
  const choices = localModelChoices(runtime, sessions);
  if (choices.length === 0) return undefined;
  const offered = new Set(choices.map((choice) => choice.id));

  const lastUsed = [...sessions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .find((session) => session.model !== null && offered.has(session.model))?.model;
  if (lastUsed) return lastUsed;

  const configured = runtime?.defaultModelId;
  const vouchedFor = choices.some(
    (choice) => choice.id === configured && choice.evidence !== 'configured',
  );
  if (configured && vouchedFor && !isTopTier(configured)) return configured;

  return choices.reduce((cheapest, choice) =>
    offeredCost(choice.id) < offeredCost(cheapest.id) ? choice : cheapest,
  ).id;
}

export function newSessionLabel(folderName: string): string {
  return `${LOCAL_CODE_COPY.newSessionPrefix} ${folderName}`;
}

export function localSessionOriginLabel(session: LocalDeveloperSession): string {
  return DEVELOPER_SESSION_ORIGIN_LABELS[session.origin];
}

export function localSessionTrustLabel(session: LocalDeveloperSession): string {
  return DEVELOPER_SESSION_TRUST_LABELS[session.trustMode];
}

/**
 * The line under a session's title: where it lives, then what answered it.
 * A folder with no branch is not in a repository, so the branch is dropped
 * rather than printed as an absence.
 */
export function localSessionContext(
  session: LocalDeveloperSession,
  group: Pick<DeveloperSessionGroup, 'name' | 'branch'>,
): string {
  return [group.name, group.branch, localModelLabel(session.model), localSessionTrustLabel(session)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

export interface LocalFileChange {
  path: string;
  change: DeveloperFileChange;
}

export const LOCAL_TOOL_STATES = ['queued', 'running', 'finished'] as const;

export type LocalToolState = (typeof LOCAL_TOOL_STATES)[number];

export interface LocalToolRun {
  toolCallId: string;
  name: string;
  summary: string;
  output: string;
  isError: boolean;
  state: LocalToolState;
  /** The command line, when this call is a shell command the runtime named. */
  command: string | null;
  files: LocalFileChange[];
}

export interface LocalTurnDiff {
  unifiedDiff: string;
  paths: string[];
}

/** A turn's diff with what each file underwent, which outlives the live turn it came from. */
export interface LocalTurnChanges extends LocalTurnDiff {
  changes: Record<string, DeveloperFileChange>;
}

export function localTurnChanges(
  diff: LocalTurnDiff,
  tools: readonly LocalToolRun[],
): LocalTurnChanges {
  const changes: Record<string, DeveloperFileChange> = {};
  for (const tool of tools) {
    for (const file of tool.files) changes[file.path] = file.change;
  }
  return { ...diff, changes };
}

export function localFileChangeLabel(changes: LocalTurnChanges, path: string): string {
  return DEVELOPER_FILE_CHANGE_LABELS[changes.changes[path] ?? 'modified'];
}

export interface LocalTurn {
  turnId: string | null;
  prompt: string;
  /** Messages the reader added while this turn ran, in the order the CLI took them. */
  steered: string[];
  reply: string;
  tools: LocalToolRun[];
  diff: LocalTurnDiff | null;
  outcome: DeveloperTurnOutcome | null;
  failure: DeveloperTurnFailure | null;
}

export const EMPTY_LOCAL_TURN: LocalTurn = {
  turnId: null,
  prompt: '',
  steered: [],
  reply: '',
  tools: [],
  diff: null,
  outcome: null,
  failure: null,
};

/**
 * What a step row says it is doing. A queued call has not started, so it must
 * not read as work in flight; a command names itself, because the command line
 * is the only thing that says what it will do.
 */
export function localToolLabel(tool: LocalToolRun): string {
  if (tool.state === 'queued') return `Queued · ${tool.summary}`;
  return tool.command ?? tool.summary;
}

/** The files one call wrote, as the step row lists them under its output. */
export function localToolFileLines(tool: LocalToolRun): string[] {
  return tool.files.map((file) => `${DEVELOPER_FILE_CHANGE_LABELS[file.change]} ${file.path}`);
}

const OUTCOME_STOP_REASONS: Record<DeveloperTurnOutcome, CloudCodeAgentStopReason> = {
  completed: 'done',
  failed: 'error',
  interrupted: 'cancelled',
};

export function localTurnStopReason(turn: LocalTurn): CloudCodeAgentStopReason | null {
  return turn.outcome ? OUTCOME_STOP_REASONS[turn.outcome] : null;
}

export function localTurnIsRunning(turn: LocalTurn): boolean {
  return turn.turnId !== null && turn.outcome === null;
}

function toSteps(tools: LocalToolRun[]): CloudCodeAgentStep[] {
  return tools.map((tool, index) => ({
    index,
    toolName: tool.name,
    label: localToolLabel(tool),
    output: [tool.output, ...localToolFileLines(tool)].filter(Boolean).join('\n'),
    isError: tool.isError,
  }));
}

/**
 * The persisted transcript, then the turn in flight.
 *
 * A stored message carries no stop reason and no timestamp, so its reply block
 * shows neither: the CLI records what was said, not how each past turn ended,
 * and printing "Finished" under every one of them would be an invention.
 */
export function localTranscriptItems(
  messages: readonly DeveloperMessage[],
  turn: LocalTurn,
): CodeTranscriptItem[] {
  const items: CodeTranscriptItem[] = [];

  messages.forEach((message, index) => {
    if (message.text.trim() === '') return;
    if (message.role === 'user') {
      const startsTurn =
        message.turnId !== undefined && message.turnId !== messages[index - 1]?.turnId;
      items.push({
        kind: 'task',
        id: `stored-${index}`,
        at: '',
        text: message.text,
        mode: CLOUD_CODE_DEFAULT_TURN_MODE,
        ...(startsTurn && message.turnId ? { rewindTurnId: message.turnId } : {}),
      });
      return;
    }
    items.push({
      kind: 'reply',
      id: `stored-${index}`,
      at: '',
      text: message.text,
      stopReason: null,
      retryGoal: null,
      retryMode: CLOUD_CODE_DEFAULT_TURN_MODE,
    });
  });

  if (turn.prompt !== '') {
    items.push({
      kind: 'task',
      id: 'live-task',
      at: '',
      text: turn.prompt,
      mode: CLOUD_CODE_DEFAULT_TURN_MODE,
    });
  }
  const steps = toSteps(turn.tools);
  if (steps.length > 0) {
    items.push({ kind: 'steps', id: 'live-steps', at: '', steps });
  }
  turn.steered.forEach((text, index) => {
    if (text.trim() === '') return;
    items.push({
      kind: 'task',
      id: `live-steer-${index}`,
      at: '',
      text,
      mode: CLOUD_CODE_DEFAULT_TURN_MODE,
    });
  });
  const said = turn.failure === null ? null : localTurnFailureSentence(turn.failure);
  const reply = [turn.reply, said].filter(Boolean).join('\n\n');
  if (reply !== '') {
    items.push({
      kind: 'reply',
      id: 'live-reply',
      at: '',
      text: reply,
      stopReason: localTurnStopReason(turn),
      retryGoal: null,
      retryMode: CLOUD_CODE_DEFAULT_TURN_MODE,
    });
  }

  return items;
}

export interface LocalFolderChoice {
  rootId: string;
  name: string;
  branch: string | null;
  unavailable: string | null;
}

/** One project MCP server in one folder: the same name can come from the MCP file and a plugin. */
export function localMcpServerKey(
  rootId: string,
  server: DeveloperMcpServerAwaitingApproval,
): string {
  return JSON.stringify([rootId, server.scope, server.name]);
}

/** The approved folders, without the worktrees made from them. */
export function localFolderGroups(
  groups: readonly DeveloperSessionGroup[],
): DeveloperSessionGroup[] {
  return groups.filter((group) => group.worktree === undefined);
}

export function localFolderChoices(groups: readonly DeveloperSessionGroup[]): LocalFolderChoice[] {
  return localFolderGroups(groups)
    .filter((group) => !isSshEnvironmentId(group.rootId))
    .map((group) => ({
      rootId: group.rootId,
      name: group.name,
      branch: group.branch,
      unavailable: group.unavailable
        ? `${group.unavailable.message} ${group.unavailable.hint}`
        : null,
    }));
}

export function localFolderChoice(
  groups: readonly DeveloperSessionGroup[],
  rootId: string | null,
): LocalFolderChoice | null {
  if (!rootId) return null;
  return localFolderChoices(groups).find((choice) => choice.rootId === rootId) ?? null;
}

/**
 * The folder a new session starts in: the one whose sessions were touched most
 * recently, ignoring folders whose runtime cannot start one at all.
 */
export function preferredLocalRootId(groups: readonly DeveloperSessionGroup[]): string | null {
  const ranked = localFolderGroups(groups)
    .filter((group) => !isSshEnvironmentId(group.rootId))
    .filter((group) => group.unavailable === undefined)
    .map((group) => ({
      rootId: group.rootId,
      at: group.sessions.reduce(
        (latest, session) => (session.updatedAt > latest ? session.updatedAt : latest),
        '',
      ),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
  return ranked[0]?.rootId ?? null;
}

/**
 * The one line to show when every approved folder reports the same reason for
 * having no runtime, which is what a machine without the CLI looks like.
 */
export function sharedUnavailableLine(groups: readonly DeveloperSessionGroup[]): string | null {
  const folders = localFolderGroups(groups);
  const messages = folders.map((group) => group.unavailable).filter((value) => value !== undefined);
  if (messages.length === 0 || messages.length !== folders.length) return null;
  const first = messages[0];
  if (!first) return null;
  const same = messages.every((value) => value?.message === first.message);
  return same ? `${first.message} ${first.hint}` : null;
}

const NPM_PLACEHOLDER_TEST = 'no test specified';

function packageTestScript(packageJson: string | null): string | null {
  if (packageJson === null) return null;
  try {
    const parsed: unknown = JSON.parse(packageJson);
    if (!parsed || typeof parsed !== 'object') return null;
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (!scripts || typeof scripts !== 'object') return null;
    const test = (scripts as Record<string, unknown>)['test'];
    return typeof test === 'string' && !test.includes(NPM_PLACEHOLDER_TEST) ? test : null;
  } catch {
    return null;
  }
}

/**
 * The command that runs this project's own tests, read from the files at the
 * top of the folder, or null when the folder does not declare one.
 */
export function detectTestCommand(
  topLevelNames: readonly string[],
  packageJson: string | null,
): string | null {
  const has = (name: string) => topLevelNames.includes(name);
  if (packageTestScript(packageJson) !== null) {
    if (has('pnpm-lock.yaml')) return 'pnpm test';
    if (has('yarn.lock')) return 'yarn test';
    if (has('bun.lock') || has('bun.lockb')) return 'bun run test';
    return 'npm test';
  }
  if (has('Cargo.toml')) return 'cargo test';
  if (has('go.mod')) return 'go test ./...';
  if (has('pyproject.toml') || has('pytest.ini') || has('tox.ini') || has('setup.cfg')) {
    return 'pytest';
  }
  return null;
}

export const LOCAL_PLACEMENTS = ['local', 'worktree', 'worktree-with-changes'] as const;

/** Where a new session runs: the folder itself, or a worktree only it changes. */
export type LocalPlacement = (typeof LOCAL_PLACEMENTS)[number];

export const LOCAL_PLACEMENT_HEADING = 'Run the session in';

export const LOCAL_PLACEMENT_LABELS: Record<LocalPlacement, string> = {
  local: 'This folder',
  worktree: 'New worktree',
  'worktree-with-changes': 'New worktree with my changes',
};

export const LOCAL_PLACEMENT_HINTS: Record<LocalPlacement, string> = {
  local: 'The agent changes the files you are working on.',
  worktree: 'A separate checkout of the current commit, so your files stay as they are.',
  'worktree-with-changes':
    'A separate checkout of the current commit plus everything you have not committed yet.',
};

export function localPlacementRequest(
  placement: LocalPlacement,
): Pick<DeveloperSessionStartRequest, 'environment' | 'worktreeStart'> {
  if (placement === 'local') return { environment: 'local' };
  return {
    environment: 'worktree',
    worktreeStart: placement === 'worktree' ? 'head' : 'working_tree',
  };
}

export const LOCAL_REVIEW_COPY = {
  open: 'Review changes',
  close: 'Close review',
  shortcut: 'Review changes (Ctrl+Shift+G, or Cmd+Shift+G on a Mac)',
  heading: 'Changes',
  refresh: 'Refresh changes',
  loading: 'Reading checkpoints',
  empty: 'No turn in this session has changed a file yet.',
  turnLabel: (index: number): string => `Turn ${index}`,
  turnRunning: 'Still running',
  turnFiles: (count: number): string => (count === 1 ? '1 file' : `${count} files`),
  readFailed: 'The changes could not be read.',
  binary: 'Binary file, changed as a whole.',
  stageFile: 'Stage file',
  revertFile: 'Revert file',
  stageHunk: 'Stage',
  revertHunk: 'Revert',
  rewind: 'Rewind to before this turn',
  rewindTitle: (index: number): string => `Rewind to before turn ${index}?`,
  rewindConfirm: 'Rewind',
  rewindHere: 'Rewind to here',
  rewindHereTitle: 'Rewind to before this message?',
  revertTitle: 'Revert these changes?',
  revertConfirm: 'Revert',
  notRewindable:
    'The conversation was condensed after this turn, so it can no longer rewind with the files.',
  nothingToRewindHere:
    'Every file already matches how it was before this turn, so only the conversation rewinds.',
  nothingToRestore:
    'Every file already matches how it was before this turn, so there is nothing to restore.',
  chooseTitle: 'Rewind to before this turn',
  chooseHereTitle: 'Rewind to before this message',
  chooseCancel: 'Never mind',
  restoreLabel: {
    both: 'Restore code and conversation',
    conversation: 'Restore conversation',
    code: 'Restore code',
  },
  restoreCopy: {
    both: 'Files and the conversation go back to how they were before this turn.',
    conversation: 'The conversation goes back to before this turn. Files stay as they are now.',
    code: 'Files go back to how they were before this turn. The conversation stays as it is.',
  },
  restoreConfirm: {
    both: 'Rewind',
    conversation: 'Restore conversation',
    code: 'Restore code',
  },
  summarizeLabel: 'Summarize from here',
  summarizeCopy:
    'The model keeps a summary of this turn and the ones after it, freeing context. The messages stay in the transcript.',
  summarizeTitle: 'Summarize from this turn on?',
  summarizeConfirm: 'Summarize',
  summarizeConsequence:
    'From this turn on, the model sees one summary in place of every turn except the latest. The messages stay in the transcript, but the summarized turns can no longer be rewound or branched from, and this cannot be undone. Earlier turns and every file stay as they are.',
  summarized: (messages: number): string =>
    messages === 1 ? 'Summarized 1 message.' : `Summarized ${messages} messages.`,
  nothingToSummarize:
    'Nothing was summarized: the latest turn is always kept word for word, and nothing after this turn comes before it.',
  commitInTerminal:
    'This pane stages and reverts changes. To commit what you staged, run git commit in your terminal.',
  checkpointScope:
    'Each turn saves every file in this folder, edits made by shell commands included. Files your .gitignore excludes and large files git does not track are not saved, so a rewind leaves them as they are.',
  rewound: (count: number): string =>
    count === 1
      ? 'Rewound 1 file and the conversation.'
      : `Rewound ${count} files and the conversation.`,
  reverted: (count: number): string =>
    count === 1 ? 'Reverted 1 change.' : `Reverted ${count} changes.`,
  staged: (count: number): string =>
    count === 1 ? 'Staged 1 change.' : `Staged ${count} changes.`,
  conflicted: (paths: readonly string[]): string =>
    `Left alone because the file changed since: ${paths.join(', ')}.`,
  worktreeHeading: 'Worktree',
  worktreeFrom: (start: string): string => `Started from ${start}`,
  worktreeFromChanges: 'Started from the current commit and your uncommitted changes',
  apply: 'Apply to local',
  applyTitle: 'Apply this worktree to your folder?',
  applyConfirm: 'Apply',
  applyNothing: 'The worktree has no changes your folder does not already have.',
  applied: (applied: number, skipped: number, conflicted: number): string =>
    [
      `Applied ${applied === 1 ? '1 file' : `${applied} files`}.`,
      skipped > 0
        ? `${skipped === 1 ? '1 file was' : `${skipped} files were`} already the same.`
        : '',
      conflicted > 0
        ? `${conflicted === 1 ? '1 file was' : `${conflicted} files were`} left alone because you changed ${conflicted === 1 ? 'it' : 'them'} here.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
  pin: 'Keep this worktree',
  unpin: 'Allow cleanup',
  pinned: 'Kept: cleanup will not remove it.',
  remove: 'Remove worktree',
  removeTitle: 'Remove this worktree?',
  removeConfirm: 'Remove',
  removed: (ref: string): string => `Removed. Everything it held is kept in ${ref}.`,
  setupHeading: 'Setup script',
  setupBody: (path: string): string =>
    `This repository asks to run ${path} in each new worktree. It is a program from the repository and runs with your account.`,
  setupApproved: 'You approved this exact script before.',
  setupRun: 'Run setup',
  setupRunning: 'Running setup',
  setupTitle: 'Run the setup script?',
  setupConfirm: 'Run',
  setupPassed: 'Setup finished.',
  setupFailed: (code: number | null): string =>
    code === null ? 'Setup was stopped.' : `Setup failed with exit code ${code}.`,
  setupOutput: 'Setup output',
  actionFailed: 'That could not be done.',
  skippedFilesList: 'Files not saved',
  turnSkipped: (count: number): string =>
    count === 1 ? '1 large file not saved' : `${count} large files not saved`,
} as const;

const NAMED_FILES = 5;

function listed(paths: readonly string[]): string {
  const named = paths.slice(0, NAMED_FILES);
  const rest = paths.length - named.length;
  if (rest > 0)
    return `${named.join(', ')} and ${rest === 1 ? '1 more file' : `${rest} more files`}`;
  if (named.length < 2) return named.join('');
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
}

/** The consequence of a rewind, naming every file whose current content goes. */
export function localRewindConsequence(files: readonly string[], messagesRemoved: number): string {
  const conversation =
    messagesRemoved === 1
      ? 'The last message is removed from the conversation.'
      : `${messagesRemoved} messages are removed from the conversation.`;
  if (files.length === 0) return conversation;
  return `What ${listed(files)} hold now is replaced with how ${files.length === 1 ? 'it was' : 'they were'} before this turn, including any edits you made since. ${conversation} The current state is kept in git, but this page cannot bring it back.`;
}

/** The consequence of restoring only the files or only the conversation, from the CLI's preview. */
export function localRestoreConsequence(
  restore: 'code' | 'conversation',
  files: readonly string[],
  messagesRemoved: number,
): string {
  if (restore === 'conversation') {
    const removed =
      messagesRemoved === 1
        ? 'The last message is removed from the conversation'
        : `${messagesRemoved} messages are removed from the conversation`;
    return `${removed} and cannot be recovered. Every file stays as it is now, including what the agent changed in this turn.`;
  }
  return `What ${listed(files)} hold now is replaced with how ${files.length === 1 ? 'it was' : 'they were'} before this turn, including any edits you made since. The conversation stays as it is. The current files are kept in git, but this page cannot bring them back.`;
}

/** What a finished rewind did, in the reader's terms. */
export function localRestored(restore: 'both' | 'code' | 'conversation', files: number): string {
  if (restore === 'both') return LOCAL_REVIEW_COPY.rewound(files);
  if (restore === 'conversation') return 'The conversation is back to before that turn.';
  return files === 1 ? 'Restored 1 file.' : `Restored ${files} files.`;
}

/** The consequence of reverting sections, naming the files that lose the agent's lines. */
export function localRevertConsequence(files: readonly string[]): string {
  return `The agent's changes to ${listed(files)} are removed from the files on disk. Changes you made yourself stay. This cannot be undone from here.`;
}

/** The consequence of applying, naming the files it overwrites in the folder. */
export function localApplyConsequence(files: readonly string[]): string {
  return `${listed(files)} in your folder ${files.length === 1 ? 'is' : 'are'} replaced with the worktree's version. Each of them still matches how it was when the worktree started, so no edit of yours is lost. Nothing is staged.`;
}

export function localRemoveWorktreeConsequence(name: string): string {
  return `${name} and its checkout are deleted from this computer, and its session can no longer run. Everything the worktree held, committed or not, is kept in a git ref you can restore from.`;
}

/** Untracked files too large to snapshot, which a checkpoint neither shows nor restores. */
export function localSkippedFilesLine(count: number): string {
  return count === 1
    ? '1 large file was not saved in this checkpoint and will not be restored.'
    : `${count} large files were not saved in this checkpoint and will not be restored.`;
}

/** The rewind preview names the large files the rewind leaves as they are. */
export function localRewindSkippedConsequence(files: readonly string[]): string {
  if (files.length === 0) return '';
  return `${listed(files)} ${files.length === 1 ? 'was' : 'were'} too large to save in a checkpoint and will not be restored.`;
}

/**
 * The consequence of deleting a local session. Archives of its worktrees are
 * kept by default, and saying so is part of the answer: they are the only
 * thing that survives.
 */
export function localDeleteSessionConsequence(title: string): string {
  return `${title} is deleted from this computer with its conversation and checkpoints, so it can no longer be reopened or rewound. This cannot be recovered. Files in the folder stay as they are, and archives of worktrees it used, which can hold uncommitted work, are kept.`;
}

/**
 * The consequence of archiving a local session. This app has no way to bring
 * one back, so the answer names the command that does.
 */
export function localArchiveSessionConsequence(title: string, threadId: string): string {
  return `${title} leaves this list and can no longer be opened from this app. Its conversation and checkpoints stay on this computer, and files in the folder stay as they are. To bring it back, run "agi session unarchive ${threadId}" in a terminal.`;
}

/** What the list says once a session's worktree has been removed with it. */
export function localWorktreeRemovedLine(snapshotRef: string): string {
  return `Worktree removed. Everything it held is kept in ${snapshotRef}.`;
}

/** What the list says once a session has been archived. */
export function localSessionArchivedLine(threadId: string): string {
  return `Session archived. To bring it back, run "agi session unarchive ${threadId}" in a terminal.`;
}

/**
 * The consequence of taking a session from the program writing it: who loses
 * it, and what still happens to the turn that program is running.
 */
export function localTakeOverConsequence(holder: string): string {
  return `${holder} Taking the session over lets turns sent from this app run, and that program loses the session: the next turn it sends is refused until it takes the session back. A turn it is already running still finishes.`;
}

/** What deleting a session did beyond removing it. */
export function localSessionDeletedLine(outcome: {
  keptWorktreeArchives: readonly string[];
  removedWorktreeArchives: readonly string[];
  releasedWorktrees: readonly string[];
}): string {
  const released = outcome.releasedWorktrees.length;
  const kept = outcome.keptWorktreeArchives.length;
  const removed = outcome.removedWorktreeArchives.length;
  return [
    'Session deleted.',
    released === 0
      ? ''
      : released === 1
        ? 'The worktree it used is free for another session.'
        : `The ${released} worktrees it used are free for another session.`,
    kept === 0
      ? ''
      : kept === 1
        ? '1 worktree archive with uncommitted work was kept.'
        : `${kept} worktree archives with uncommitted work were kept.`,
    removed === 0
      ? ''
      : removed === 1
        ? '1 worktree archive was deleted.'
        : `${removed} worktree archives were deleted.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The consequence of discarding a deleted session's kept worktree archives. */
export function localDiscardArchivesConsequence(count: number): string {
  return `${count === 1 ? 'The kept worktree archive is' : `The ${count} kept worktree archives are`} deleted, and any uncommitted work in ${count === 1 ? 'it' : 'them'} cannot be recovered.`;
}

/**
 * Older worktrees cleanup could not archive while making a new one. An entry
 * with no id means the worktrees could not be listed at all.
 */
export function localCleanupFailuresLine(
  failures: readonly { worktreeId: string; reason: string }[],
): string {
  const named = failures.filter((failure) => failure.worktreeId !== '').length;
  const opening =
    named === 0
      ? 'Older worktrees could not be checked for cleanup, so none were archived.'
      : named === 1
        ? '1 older worktree could not be archived and is still on this computer.'
        : `${named} older worktrees could not be archived and are still on this computer.`;
  return `${opening} This session runs in its new worktree.`;
}

export function localCleanupFailureRow(failure: { worktreeId: string; reason: string }): string {
  return failure.worktreeId === '' ? failure.reason : `${failure.worktreeId}: ${failure.reason}`;
}

/** Ctrl+Shift+G, or Cmd+Shift+G on a Mac, as ChatGPT binds its review pane. */
export function isLocalFilesShortcut(event: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.key.toLowerCase() === 'p' &&
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function isLocalReviewShortcut(event: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.key.toLowerCase() === 'g' &&
    event.shiftKey &&
    !event.altKey &&
    (event.metaKey || event.ctrlKey)
  );
}

export const LOCAL_WORKTREE_SETTINGS_COPY = {
  heading: 'Worktrees',
  intro:
    'Each coding session started in a worktree gets its own checkout. When a new one is made, older ones beyond this count are removed, after everything in them is kept in git. Pinned worktrees and worktrees in use are never removed.',
  label: 'Keep the newest',
  save: 'Save',
  saved: (keep: number): string =>
    keep === 1 ? 'Keeping the newest worktree.' : `Keeping the newest ${keep} worktrees.`,
  saveFailed: 'The worktree count was not saved.',
  notRunning:
    'Start a coding session to change this. The count is kept by the AGI CLI, which is not running yet.',
  readFailed: 'The worktree count could not be read.',
  range: (max: number): string => `Choose a whole number from 1 to ${max}.`,
} as const;
