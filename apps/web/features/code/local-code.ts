import { translateUiPlural } from '@agiworkforce/ui';
import {
  DEVELOPER_FILE_CHANGE_LABELS,
  DEVELOPER_SESSION_ORIGIN_LABELS,
  DEVELOPER_SESSION_TRUST_LABELS,
  type DeveloperAgentMode,
  type DeveloperFileChange,
  type DeveloperRuntimeModels,
  type DeveloperSessionGroup,
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
} from '@agiworkforce/types';
import { getModelMetadata } from '@shared/config/llm';
import type { CodeApprovalPrompt, CodeTranscriptItem } from '@agiworkforce/cloud-contracts';

export const LOCAL_CODE_COPY = {
  heading: 'On this device',
  skipQuestion: 'Skip the question',
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
  startFailed: 'That session could not be started.',
  switchToReadyModel: 'Switch to a ready model',
  modelNeedsSetup: (model: string, provider: string): string =>
    `${model} cannot run on this machine yet: ${provider} needs a sign-in first.`,
  readFailed: 'That session could not be opened.',
  turnFailed: 'That message could not be sent.',
  modeMenu: 'Permissions',
  modeControl: 'Permission mode',
  sessionRunning: 'Running',
  changesFailed: 'The changes in this folder could not be read.',
  changesNotRepository: 'This folder is not a git repository, so there are no changes to show.',
  discardFailed: 'That change could not be discarded.',
  commandFailed: 'That command could not be run.',
  editFile: 'Edit',
  closeFile: 'Close the file',
  openingFile: 'Opening the file',
  saveFile: 'Save',
  fileReadFailed: 'That file could not be opened.',
  fileSaveFailed: 'That file could not be saved.',
  fileTooLarge: 'This file is too large to edit here. Open it in your editor instead.',
  discardFileEdits: 'Discard',
  reloadFile: 'Reload',
  overwriteFile: 'Overwrite',
  fileChangedOnDisk: 'This file changed on disk since you opened it.',
  fileDeletedOnDisk:
    'This file was deleted since you opened it. Overwrite to create it again with your version.',
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
} as const;

const LOCAL_SESSION_STATUS_LABELS: Partial<Record<ThreadStatus, string>> = {
  awaiting_approval: 'Needs approval',
  failed: 'Failed',
  archived: 'Archived',
};

const QUIET_LOCAL_SESSION_STATUSES: ReadonlySet<ThreadStatus> = new Set(['archived']);

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

export function localSessionStatusIsQuiet(status: ThreadStatus): boolean {
  return QUIET_LOCAL_SESSION_STATUSES.has(status);
}

export const LOCAL_AGENT_MODES = [
  'plan',
  'ask',
  'auto',
] as const satisfies readonly DeveloperAgentMode[];
export type LocalAgentMode = (typeof LOCAL_AGENT_MODES)[number];

export const LOCAL_AGENT_MODE_HINTS: Record<LocalAgentMode, string> = {
  plan: 'Reads the code and proposes a plan. Changes nothing.',
  ask: 'Asks before every edit and command.',
  auto: 'Edits files and runs safe commands on its own. Other commands still ask.',
};

export function localAgentMode(mode: DeveloperAgentMode | null | undefined): LocalAgentMode {
  return mode === 'plan' || mode === 'auto' ? mode : 'ask';
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

export interface LocalTurn {
  turnId: string | null;
  prompt: string;
  reply: string;
  tools: LocalToolRun[];
  diff: LocalTurnDiff | null;
  outcome: DeveloperTurnOutcome | null;
  failure: DeveloperTurnFailure | null;
}

export const EMPTY_LOCAL_TURN: LocalTurn = {
  turnId: null,
  prompt: '',
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
 * The turn's own diff as one final step. The runtime sends it once the turn
 * settles, so it reads as what the turn changed rather than as another tool.
 */
function diffStep(diff: LocalTurnDiff, index: number): CloudCodeAgentStep {
  const count = diff.paths.length;
  return {
    index,
    toolName: 'turn_diff',
    label: translateUiPlural('chat', 'counts.changedFiles', count, {
      one: 'Changed {{count}} file',
      other: 'Changed {{count}} files',
    }),
    output: diff.unifiedDiff,
    isError: false,
  };
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
      items.push({
        kind: 'task',
        id: `stored-${index}`,
        at: '',
        text: message.text,
        mode: CLOUD_CODE_DEFAULT_TURN_MODE,
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
  if (turn.diff) steps.push(diffStep(turn.diff, steps.length));
  if (steps.length > 0) {
    items.push({ kind: 'steps', id: 'live-steps', at: '', steps });
  }
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

export function localApprovalPrompts(
  approval: { turnId: string; requestId: string; summary: string; detail: string } | null,
): CodeApprovalPrompt[] {
  if (!approval) return [];
  return [
    {
      turnId: approval.turnId,
      stepIndex: 0,
      command: approval.detail || approval.summary,
      reason: approval.summary,
      goal: '',
    },
  ];
}

export function localGroupsHaveSessions(groups: readonly DeveloperSessionGroup[]): boolean {
  return groups.some((group) => group.sessions.length > 0);
}

export interface LocalFolderChoice {
  rootId: string;
  name: string;
  branch: string | null;
  unavailable: string | null;
}

export function localFolderChoices(groups: readonly DeveloperSessionGroup[]): LocalFolderChoice[] {
  return groups.map((group) => ({
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
  const ranked = groups
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
  const messages = groups.map((group) => group.unavailable).filter((value) => value !== undefined);
  if (messages.length === 0 || messages.length !== groups.length) return null;
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
