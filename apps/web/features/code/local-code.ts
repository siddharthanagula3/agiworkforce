import {
  DEVELOPER_SESSION_ORIGIN_LABELS,
  DEVELOPER_SESSION_TRUST_LABELS,
  type DeveloperRuntimeModels,
  type DeveloperSession,
  type DeveloperSessionGroup,
  type DeveloperTurnOutcome,
} from '@agiworkforce/local-runtime-contract';
import type { DeveloperMessage } from '@agiworkforce/types/protocol';
import {
  providerLabels,
  type CloudCodeAgentStep,
  type CloudCodeAgentStopReason,
} from '@agiworkforce/types';
import { getModelMetadata } from '@shared/config/llm';
import type { CodeApprovalPrompt, CodeTranscriptItem } from './code-transcript';

export const LOCAL_CODE_COPY = {
  heading: 'On this device',
  addFolder: 'Add a folder',
  addingFolder: 'Choosing…',
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
  readFailed: 'That session could not be opened.',
  turnFailed: 'That message could not be sent.',
} as const;

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

const PROVIDER_PREFIX = /^\[([A-Za-z0-9_-]+)\]\s*/;
const LOGIN_INSTRUCTION = /\s*Run\s+`?agi\s+login\s+\S+?`?\s+or\s+set\s+\S+?\.?\s*$/i;
const MISSING_KEY = /authentication failed|no api key/i;

/**
 * The CLI's failure line as a sentence a person can act on.
 *
 * The CLI writes for a terminal: a bracketed provider id, then an instruction
 * naming an environment variable. The desktop has Settings, so the same
 * condition is said in the desktop's own words with the provider the catalog
 * names.
 */
export function localTurnFailureSentence(error: string, sessionProvider: string | null): string {
  const prefixed = PROVIDER_PREFIX.exec(error);
  const providerId = prefixed?.[1] ?? sessionProvider;
  const body = (prefixed ? error.slice(prefixed[0].length) : error)
    .replace(LOGIN_INSTRUCTION, '')
    .trim();

  if (providerId && MISSING_KEY.test(body)) {
    return `No ${localProviderLabel(providerId)} key on this computer. Add one in Settings, or run \`agi login ${providerId}\` in a terminal.`;
  }
  return body === '' ? error.trim() : body;
}

export interface LocalModelChoice {
  id: string;
  label: string;
  /** Why this model is offered, which is also how far it has been proven. */
  evidence: 'used-here' | 'installed' | 'configured';
}

const EVIDENCE_ORDER: Record<LocalModelChoice['evidence'], number> = {
  'used-here': 0,
  installed: 1,
  configured: 2,
};

export const LOCAL_MODEL_EVIDENCE_LABELS: Record<LocalModelChoice['evidence'], string> = {
  'used-here': 'Used in this folder',
  installed: 'On this computer',
  configured: 'The CLI default',
};

/**
 * The models offered for a session in one folder, strongest evidence first.
 *
 * Protocol 8 does not say which own-key providers hold a key, so a model this
 * folder's sessions already ran on is the best evidence the CLI can reach it;
 * after that come the models installed on this Mac, and last the configured
 * default, which may be a route that cannot run here.
 */
export function localModelChoices(
  runtime: DeveloperRuntimeModels | null,
  sessions: readonly DeveloperSession[],
): LocalModelChoice[] {
  const byId = new Map<string, LocalModelChoice>();

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
  const configured = runtime?.defaultModelId;
  if (configured && !byId.has(configured)) {
    byId.set(configured, {
      id: configured,
      label: localModelLabel(configured) ?? configured,
      evidence: 'configured',
    });
  }

  return [...byId.values()].sort((a, b) => EVIDENCE_ORDER[a.evidence] - EVIDENCE_ORDER[b.evidence]);
}

/** The model a session started here begins on: the best-evidenced one. */
export function startingModelId(
  runtime: DeveloperRuntimeModels | null,
  sessions: readonly DeveloperSession[],
): string | undefined {
  return localModelChoices(runtime, sessions)[0]?.id;
}

export function newSessionLabel(folderName: string): string {
  return `${LOCAL_CODE_COPY.newSessionPrefix} ${folderName}`;
}

export function localSessionOriginLabel(session: DeveloperSession): string {
  return DEVELOPER_SESSION_ORIGIN_LABELS[session.origin];
}

export function localSessionTrustLabel(session: DeveloperSession): string {
  return DEVELOPER_SESSION_TRUST_LABELS[session.trustMode];
}

/**
 * The line under a session's title: where it lives, then what answered it.
 * A folder with no branch is not in a repository, so the branch is dropped
 * rather than printed as an absence.
 */
export function localSessionContext(
  session: DeveloperSession,
  group: Pick<DeveloperSessionGroup, 'name' | 'branch'>,
): string {
  return [group.name, group.branch, localModelLabel(session.model), localSessionTrustLabel(session)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

export interface LocalToolRun {
  toolCallId: string;
  name: string;
  summary: string;
  output: string;
  isError: boolean;
}

export interface LocalTurn {
  turnId: string | null;
  prompt: string;
  reply: string;
  tools: LocalToolRun[];
  outcome: DeveloperTurnOutcome | null;
  error: string | null;
}

export const EMPTY_LOCAL_TURN: LocalTurn = {
  turnId: null,
  prompt: '',
  reply: '',
  tools: [],
  outcome: null,
  error: null,
};

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
    label: tool.summary,
    output: tool.output,
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
  sessionProvider: string | null = null,
): CodeTranscriptItem[] {
  const items: CodeTranscriptItem[] = [];

  messages.forEach((message, index) => {
    if (message.text.trim() === '') return;
    if (message.role === 'user') {
      items.push({ kind: 'task', id: `stored-${index}`, at: '', text: message.text });
      return;
    }
    items.push({
      kind: 'reply',
      id: `stored-${index}`,
      at: '',
      text: message.text,
      stopReason: null,
      retryGoal: null,
    });
  });

  if (turn.prompt !== '') {
    items.push({ kind: 'task', id: 'live-task', at: '', text: turn.prompt });
  }
  if (turn.tools.length > 0) {
    items.push({ kind: 'steps', id: 'live-steps', at: '', steps: toSteps(turn.tools) });
  }
  const failure =
    turn.error === null ? null : localTurnFailureSentence(turn.error, sessionProvider);
  const reply = [turn.reply, failure].filter(Boolean).join('\n\n');
  if (reply !== '') {
    items.push({
      kind: 'reply',
      id: 'live-reply',
      at: '',
      text: reply,
      stopReason: localTurnStopReason(turn),
      retryGoal: null,
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
