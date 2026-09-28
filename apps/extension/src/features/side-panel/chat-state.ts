import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';
import type {
  GeneratedFileWire,
  ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventSource, InteractiveCard } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { normalizeSourceUrlKey } from '@agiworkforce/utils/source-url';
import type { ManagedCodeExecution, ManagedQuotaRecovery } from '../cloud-bridge/freeTrialClient';
import { t, tPlural } from '../../i18n';

export interface SidePanelMessageAttachment {
  kind: 'image' | 'file';
  name: string;
  mimeType: string;
  assetId?: string;
}

export interface SidePanelPageReference {
  url: string;
  title: string;
}

export interface SidePanelSource extends AgentEventSource {
  publishedDate?: string;
}

export const MAX_MESSAGE_SOURCES = 40;

export interface SidePanelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  /**
   * Hydrated from a message that was still `streaming` the last time it was
   * saved, and never reached a `streaming: false` save afterward, so the
   * turn that started it is gone (a reload, a closed tab, a crash), not
   * paused. Distinct from `error`: nothing failed, the reply just never
   * finished; the panel offers Retry the same way, not a fresh streaming
   * cursor that will never move again.
   */
  interrupted?: boolean;
  stopping?: boolean;
  reconnecting?: boolean;
  error?: boolean;
  agentActivity?: AgentActivityState;
  agentEvents?: AgentEventEnvelope[];
  cloudAgentRun?: ManagedCloudAgentRunReference;
  cloudApprovalDecisions?: Record<string, 'approved' | 'rejected'>;
  cloudApprovalError?: string;
  managedQuickMode?: boolean;
  agiWorkPlanDeclined?: boolean;
  model?: string;
  provider?: string;
  autoRouteReason?: string;
  movedFromModel?: string;
  generatedFiles?: GeneratedFileWire[];
  interactiveCards?: InteractiveCard[];
  codeExecution?: ManagedCodeExecution;
  attachments?: SidePanelMessageAttachment[];
  pages?: SidePanelPageReference[];
  sources?: SidePanelSource[];
  citations?: SidePanelSource[];
  durationMs?: number;
  runtime?: 'managed-cloud' | 'local';
  errorText?: string;
  errorAction?: 'switch-model';
  errorRecovery?: ManagedQuotaRecovery;
  /**
   * Client-generated UUID reused as the server's `assistant_message_id` and the
   * cloud sync's message id, so a server-persisted turn and the extension's own
   * terminal sync converge on ONE row instead of duplicating.
   */
  cloudMessageId?: string;
  timestamp: number;
}

export interface StoredSidePanelChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Still mid-reply as of the last save; see `SidePanelChatMessage.interrupted`. */
  streaming?: boolean;
  agentEvents?: AgentEventEnvelope[];
  cloudAgentRun?: ManagedCloudAgentRunReference;
  cloudApprovalDecisions?: Record<string, 'approved' | 'rejected'>;
  cloudApprovalError?: string;
  managedQuickMode?: boolean;
  agiWorkPlanDeclined?: boolean;
  model?: string;
  provider?: string;
  autoRouteReason?: string;
  movedFromModel?: string;
  generatedFiles?: GeneratedFileWire[];
  interactiveCards?: InteractiveCard[];
  codeExecution?: ManagedCodeExecution;
  attachments?: SidePanelMessageAttachment[];
  pages?: SidePanelPageReference[];
  sources?: SidePanelSource[];
  citations?: SidePanelSource[];
  durationMs?: number;
  runtime?: 'managed-cloud' | 'local';
  error?: boolean;
  cloudMessageId?: string;
}

const MAX_PERSISTED_ACTIVITY_EVENTS = 1_000;

function isDisplaySafeActivityEvent(envelope: AgentEventEnvelope): boolean {
  switch (envelope.event.type) {
    case 'lifecycle':
    case 'progress-update':
    case 'tool-execution-queued':
    case 'tool-execution-start':
    case 'command-started':
    case 'file-changed':
    case 'turn-diff':
    case 'tool-execution-end':
    case 'source-list':
    case 'approval-requested':
    case 'approval-resolved':
    case 'input-requested':
    case 'input-resolved':
    case 'device-step-requested':
    case 'device-step-resolved':
    case 'artifact-produced':
    case 'context-compacted':
    case 'task-state-changed':
    case 'error':
    case 'stop':
      return true;
    case 'text-delta':
    case 'reasoning-delta':
    case 'tool-use-start':
    case 'tool-use-delta':
    case 'tool-use-end':
    case 'server-tool-use':
    case 'server-tool-result':
    case 'usage':
      return false;
  }
}

export function projectCanonicalAgentActivity(
  envelopes: readonly AgentEventEnvelope[] | undefined,
): AgentActivityState | undefined {
  let activity: AgentActivityState | undefined;
  for (const envelope of envelopes ?? []) {
    activity = applyAgentActivityEvent(activity, envelope);
  }
  return activity;
}

export function hydrateStoredChatMessage(
  message: StoredSidePanelChatMessage,
  id: string,
): SidePanelChatMessage {
  const agentEvents = message.agentEvents?.map((event) => ({
    ...event,
    event: { ...event.event },
  })) as AgentEventEnvelope[] | undefined;

  return {
    id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    ...(agentEvents
      ? {
          agentEvents,
          agentActivity: projectCanonicalAgentActivity(agentEvents),
        }
      : {}),
    ...(message.cloudAgentRun ? { cloudAgentRun: { ...message.cloudAgentRun } } : {}),
    ...(message.cloudApprovalDecisions
      ? { cloudApprovalDecisions: { ...message.cloudApprovalDecisions } }
      : {}),
    ...(message.cloudApprovalError ? { cloudApprovalError: message.cloudApprovalError } : {}),
    ...(message.managedQuickMode ? { managedQuickMode: true } : {}),
    ...(message.agiWorkPlanDeclined ? { agiWorkPlanDeclined: true } : {}),
    ...(message.model ? { model: message.model } : {}),
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.autoRouteReason ? { autoRouteReason: message.autoRouteReason } : {}),
    ...(message.movedFromModel ? { movedFromModel: message.movedFromModel } : {}),
    ...(message.generatedFiles
      ? { generatedFiles: message.generatedFiles.map((file) => ({ ...file })) }
      : {}),
    ...(message.interactiveCards
      ? { interactiveCards: message.interactiveCards.map((card) => ({ ...card })) }
      : {}),
    ...(message.codeExecution ? { codeExecution: { ...message.codeExecution } } : {}),
    ...(message.attachments
      ? { attachments: message.attachments.map((attachment) => ({ ...attachment })) }
      : {}),
    ...(message.pages ? { pages: message.pages.map((page) => ({ ...page })) } : {}),
    ...(message.sources ? { sources: message.sources.map((source) => ({ ...source })) } : {}),
    ...(message.citations
      ? { citations: message.citations.map((citation) => ({ ...citation })) }
      : {}),
    ...(message.durationMs !== undefined ? { durationMs: message.durationMs } : {}),
    ...(message.runtime ? { runtime: message.runtime } : {}),
    ...(message.error ? { error: true } : {}),
    ...(message.streaming ? { interrupted: true } : {}),
    ...(message.cloudMessageId ? { cloudMessageId: message.cloudMessageId } : {}),
  };
}

function isWebSourceUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function mergeMessageSources(
  existing: readonly SidePanelSource[] | undefined,
  incoming: readonly SidePanelSource[],
): SidePanelSource[] {
  const merged = (existing ?? []).map((source) => ({ ...source }));
  const byKey = new Map(merged.map((source) => [normalizeSourceUrlKey(source.url), source]));
  for (const source of incoming) {
    if (!isWebSourceUrl(source.url)) continue;
    const key = normalizeSourceUrlKey(source.url);
    const known = byKey.get(key);
    if (known) {
      if (!known.title && source.title) known.title = source.title;
      if (!known.snippet && source.snippet) known.snippet = source.snippet;
      if (!known.publishedDate && source.publishedDate) known.publishedDate = source.publishedDate;
      continue;
    }
    if (merged.length >= MAX_MESSAGE_SOURCES) break;
    const copy = { ...source };
    merged.push(copy);
    byKey.set(key, copy);
  }
  return merged;
}

export function answerSourceLists(message: SidePanelChatMessage): {
  markers: SidePanelSource[];
  all: SidePanelSource[];
} {
  const activitySources: SidePanelSource[] = (message.agentActivity?.entries ?? []).flatMap(
    (entry) =>
      entry.kind === 'sources' || entry.kind === 'tool'
        ? (entry.sources ?? []).map((source) => ({
            url: source.url,
            title: source.title,
            ...(source.snippet ? { snippet: source.snippet } : {}),
          }))
        : [],
  );
  const searched = mergeMessageSources(message.sources, activitySources);
  const markers = message.citations?.length
    ? mergeMessageSources(undefined, message.citations)
    : searched;
  return { markers, all: mergeMessageSources(markers, searched) };
}

export function isEmptyAssistantTurn(message: SidePanelChatMessage): boolean {
  if (message.role !== 'assistant' || message.error || message.interrupted) return false;
  if (message.content.trim().length > 0) return false;
  if (message.generatedFiles?.length || message.interactiveCards?.length) return false;
  if (message.codeExecution) return false;
  const activity = message.agentActivity;
  if (activity?.status === 'cancelled' || activity?.status === 'paused') return false;
  return !activity?.entries.some(
    (entry) =>
      entry.kind === 'artifact' ||
      (entry.kind === 'tool' &&
        (entry.status === 'awaiting-approval' || Boolean(entry.inputRequest))),
  );
}

export function applyCanonicalAgentEvent(
  messages: SidePanelChatMessage[],
  streamId: string,
  envelope: AgentEventEnvelope,
  timestamp = Date.now(),
): SidePanelChatMessage {
  let assistant = messages.find((message) => message.id === streamId);
  if (!assistant) {
    assistant = {
      id: streamId,
      role: 'assistant',
      content: '',
      streaming: true,
      timestamp,
    };
    messages.push(assistant);
  }
  const previous = assistant.agentActivity;
  const next = applyAgentActivityEvent(previous, envelope);
  assistant.agentActivity = next;
  if (next !== previous && isDisplaySafeActivityEvent(envelope)) {
    assistant.agentEvents = [...(assistant.agentEvents ?? []), envelope].slice(
      -MAX_PERSISTED_ACTIVITY_EVENTS,
    );
  }
  return assistant;
}

export function resolveComposerPrompt(
  text: string,
  attachmentCount: number,
  attachmentKind: 'image' | 'file' = 'image',
): string | null {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  if (attachmentCount <= 0) return null;
  return attachmentCount === 1
    ? `Please analyze the attached ${attachmentKind}.`
    : `Please analyze the attached ${attachmentKind}s.`;
}

export function trimChatMessages(messages: SidePanelChatMessage[], maximum: number): number {
  const overflow = Math.max(0, messages.length - Math.max(1, maximum));
  if (overflow > 0) messages.splice(0, overflow);
  return overflow;
}

/**
 * A day is the longest wait this panel repeats. Past it the figure is a
 * provider's clock skew or a header we misread, and a reader who waits out an
 * invented number and fails again stops believing the next one.
 */
const MAX_STATED_RETRY_AFTER_SECONDS = 86_400;

export function statedWait(retryAfterSeconds: unknown): string | undefined {
  if (typeof retryAfterSeconds !== 'number' || !Number.isFinite(retryAfterSeconds))
    return undefined;
  const seconds = Math.round(retryAfterSeconds);
  if (seconds < 1 || seconds > MAX_STATED_RETRY_AFTER_SECONDS) return undefined;
  if (seconds < 90) return tPlural('spWaitSeconds', seconds);
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return tPlural('spWaitMinutes', minutes);
  return tPlural('spWaitHours', Math.round(seconds / 3600));
}

export interface StreamFailureDetail {
  retryAfterSeconds?: number;
  requestId?: string;
  resetLabel?: string;
}

/**
 * The sentence a failed turn ends on.
 *
 * The gateway already inlines a wait whenever a provider supplied one, so a
 * figure is added only to a sentence that states none, and the id is appended
 * only when the gateway logged one. Both used to be dropped at the wire, which
 * left a reader with no idea when the window reopens and support with nothing
 * to search for.
 */
export function streamFailureText(errorText: string, detail: StreamFailureDetail = {}): string {
  const wait = statedWait(detail.retryAfterSeconds);
  const withWait =
    wait && !/\d/.test(errorText) ? t('spStreamTryAgainIn', [errorText, wait]) : errorText;
  const withReset = detail.resetLabel ? `${withWait} ${detail.resetLabel}.` : withWait;
  return detail.requestId ? t('spStreamReference', [withReset, detail.requestId]) : withReset;
}

export function applyStreamFailure(
  messages: SidePanelChatMessage[],
  streamId: string,
  errorText: string,
  timestamp = Date.now(),
  errorAction?: 'switch-model',
  errorRecovery?: ManagedQuotaRecovery,
): void {
  const existing = messages.find((message) => message.id === streamId);
  if (existing) {
    existing.streaming = false;
    existing.error = true;
    existing.errorText = errorText;
    if (errorAction) existing.errorAction = errorAction;
    if (errorRecovery) existing.errorRecovery = errorRecovery;
    return;
  }
  messages.push({
    id: streamId,
    role: 'assistant',
    content: '',
    error: true,
    errorText,
    ...(errorAction ? { errorAction } : {}),
    ...(errorRecovery ? { errorRecovery } : {}),
    timestamp,
  });
}

export function selectModelHistory(
  messages: readonly SidePanelChatMessage[],
  excludedMessageId?: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message) => !message.error && message.id !== excludedMessageId)
    .map((message) => ({ role: message.role, content: message.content }));
}

export function shouldRebuildMessageDom(input: {
  forceRebuild: boolean;
  renderedCount: number;
  messageCount: number;
}): boolean {
  return input.forceRebuild || input.renderedCount > input.messageCount;
}

/**
 * Whether an assistant message should render a text bubble element.
 *
 * A bubble is needed when there is text to show and, critically, while the
 * message is still streaming even if its text is momentarily empty. An agentic
 * (tool-using) run creates the assistant message from a tool/agent event with
 * empty content (see {@link applyCanonicalAgentEvent}, `streaming: true`) and
 * only later streams the answer in. Without the streaming case the bubble is
 * never built, so the in-place streaming updater has no `sp-bubble-<id>` target
 * and the streamed reply silently fails to paint, the user sees the activity
 * timeline but no answer.
 */
export function shouldRenderTextBubble(input: {
  text: string;
  streaming: boolean;
  interrupted?: boolean;
}): boolean {
  return input.text.trim().length > 0 || input.streaming === true || input.interrupted === true;
}

/** Which page the composer's attached text was read from. */
export interface PageContextSource {
  tabId?: number;
  url: string;
  title?: string;
  chosen?: boolean;
}

/**
 * Whether attached page text still describes what the user is looking at.
 *
 * The attachment is a snapshot of one page in one tab. A tab switch, a reload
 * that lands elsewhere, and an in-page navigation on a single-page app all end
 * that page without the composer hearing anything, which is why the URL is
 * compared and not just the tab.
 */
export function pageContextStillDescribes(
  source: PageContextSource | null,
  tabId: number | undefined,
  url: string,
): boolean {
  if (!source || source.chosen) return true;
  if (typeof tabId !== 'number') return false;
  return source.tabId === tabId && source.url === url;
}
