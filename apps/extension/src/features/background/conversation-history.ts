import {
  AgentEventEnvelopeSchema,
  ManagedCloudAgentRunReferenceSchema,
  parseGeneratedFilesDelta,
  readPersistedInteractiveCards,
  type GeneratedFileWire,
  type ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import {
  getModelMetadataById,
  type Effort,
  type InteractiveCard,
  type RoutingTaskType,
} from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  normalizeManagedCloudOwner,
  managedCloudOwnerKey,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

export const BROWSER_STORE_KEY = 'agi_browser_conversations_v2';
const LEGACY_BROWSER_STORE_KEY = 'agi_browser_conversations_v1';
const LEGACY_HISTORY_KEY = 'agi_conversation_history';
const LEGACY_ACTIVE_MESSAGES_KEY = 'agi_side_panel_messages';
const MAX_CONVERSATIONS = 100;
const MAX_CONVERSATION_SCAN = MAX_CONVERSATIONS * 2;
const MAX_MESSAGES_PER_CONVERSATION = 100;
const MAX_HISTORY_CONTENT_CHARS = 64_000;
const MAX_HISTORY_QUERY_CHARS = 200;
const MAX_SEARCHABLE_CHARS_PER_CONVERSATION = 128_000;
export const MAX_CONVERSATION_STORE_BYTES = 4 * 1024 * 1024;
const MAX_CONVERSATION_ENTRY_BYTES = 1024 * 1024;
const MAX_NORMALIZED_STORE_CONTENT_CHARS = 3 * 1024 * 1024;
const MAX_NORMALIZED_CONVERSATION_CONTENT_CHARS = 768 * 1024;
const MAX_STORED_AGENT_EVENTS_PER_MESSAGE = 200;
const MAX_STORED_AGENT_EVENTS_TOTAL = 1_000;
const MAX_STORED_GENERATED_FILES_PER_MESSAGE = 20;
const MAX_AGENT_EVENT_SERIALIZED_CHARS = 32_000;
const MAX_AGENT_EVENT_SERIALIZED_CHARS_TOTAL = 512 * 1024;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONVERSATION_STORE_LOCK = 'agi-browser-conversation-store-v2';
/**
 * Message cap for a task-scoped conversation. A daily task appends two
 * messages per run forever, so the thread has to be bounded or it eventually
 * blows the `chrome.storage.local` quota for every other conversation too.
 */
const MAX_BACKGROUND_MESSAGES = 100;
const MAX_CONVERSATION_TITLE_CHARS = 80;
const BACKGROUND_DELIVERY_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
export const BACKGROUND_ANSWER_TRUNCATION_NOTICE =
  '\n\n[Answer truncated because it exceeded the browser-local history limit.]';

/**
 * Bookkeeping bounds for the account-backed conversation mirror.
 *
 * These are deliberately fixed-size: they must never consume the content
 * budget in `HistoryNormalizationBudget`, or turning cloud sync on would start
 * evicting real messages.
 */
const MAX_CLOUD_SYNC_ERROR_CHARS = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which runtime actually produced a turn.
 *
 * This is provenance, not a preference: it is stamped at the point of dispatch
 * by whichever code path executed the turn. It is the sole gate on account-
 * backed persistence, so it must never be inferred, defaulted, or backfilled.
 * An absent value means "unknown", which fails closed (never synced).
 */
export type ConversationRuntime = 'managed-cloud' | 'local';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Retry-stable marker used to make background result delivery idempotent. */
  backgroundDeliveryId?: string;
  agentEvents?: AgentEventEnvelope[];
  cloudAgentRun?: ManagedCloudAgentRunReference;
  cloudApprovalDecisions?: Record<string, 'approved' | 'rejected'>;
  cloudApprovalError?: string;
  /** The assistant turn used the per-request Quick overlay, not durable routing. */
  managedQuickMode?: boolean;
  /** Exact catalog route that produced this assistant turn. */
  model?: string;
  /** Canonical provider for `model`, re-derived from the catalog on restore. */
  provider?: string;
  /** Validated durable descriptors emitted by `x_generated_files`. */
  generatedFiles?: GeneratedFileWire[];
  /** Validated durable card envelopes emitted by `x_interactive_card`. */
  interactiveCards?: InteractiveCard[];
  /**
   * Runtime that actually produced this turn. Absent = unknown = never eligible
   * for cloud persistence. Messages written before account-backed mirroring
   * shipped therefore stay browser-local forever, by design.
   */
  runtime?: ConversationRuntime;
  /** Server-side `web_messages.id` (UUID). Minted lazily at the first sync attempt. */
  cloudMessageId?: string;
  /** Wall-clock time the cloud accepted this exact content. */
  cloudSyncedAt?: number;
  /** `content.length` at the moment of acceptance; a mismatch means "dirty, re-send". */
  cloudSyncedChars?: number;
  /** Compact change detector for all fields mirrored in the cloud message payload. */
  cloudSyncedFingerprint?: string;
}

/**
 * Per-conversation mirror bookkeeping.
 *
 * The local record stays authoritative; this is only what we know about the
 * replica. `blockedReason: 'non-cloud-runtime'` is STICKY — a Local/BYOK turn
 * permanently disqualifies the thread and can never be cleared, which is what
 * makes the trust-boundary rule enforceable rather than advisory.
 */
export interface ConversationCloudSyncState {
  /** `web_conversations.id` (UUID). Minted when the first create is claimed. */
  conversationId?: string;
  /**
   * Server-confirmed workspace owning the replica. `null` is Personal;
   * `undefined` is an older/unacknowledged binding and must never be used for
   * a mutation whose scope could follow the account's current workspace.
   */
  organizationId?: string | null;
  /** False only while the first idempotent create has not been acknowledged. */
  createAcknowledged?: boolean;
  /** Title last accepted by the server, so an update is only sent when it changed. */
  syncedTitle?: string;
  state: 'idle' | 'pending' | 'error' | 'blocked';
  blockedReason?: 'non-cloud-runtime' | 'auth' | 'not-found' | 'workspace';
  lastError?: string;
  lastAttemptAt?: number;
  /** Local backoff floor for 429/5xx. The shared client does not retry 4xx. */
  retryAfter?: number;
}

export interface ConversationEntry {
  id: string;
  /** Exact account/session incarnation allowed to read or mutate this entry. */
  owner: ManagedCloudOwner;
  title: string;
  messages: HistoryMessage[];
  savedAt: number;
  routing: ConversationRoutingState;
  /** Account-mirror bookkeeping. Absent until the first automatic sync attempt. */
  cloudSync?: ConversationCloudSyncState;
}

export interface ConversationRoutingState {
  selectedModel: string;
  currentModelKey?: string;
  previousTaskType?: RoutingTaskType;
  /** Catalog-validated reasoning preference for this browser-local conversation. */
  effort?: Effort;
}

/** One completed background run: what was asked, and what was generated. */
export interface BackgroundTurn {
  prompt: string;
  answer: string;
  timestamp?: number;
  /** Shared by both messages so a restarted worker cannot append the turn twice. */
  deliveryId?: string;
  /**
   * Runtime that produced `answer`. Required for cloud eligibility; an omitted
   * value means the turn is never mirrored to the account.
   */
  runtime?: ConversationRuntime;
}

export interface BackgroundTurnAppendResult {
  entry: ConversationEntry;
  status: 'inserted' | 'updated' | 'unchanged';
  /** Exact assistant text proven present in the bounded record written to storage. */
  persistedAnswer: string;
}

interface BrowserConversationStore {
  version: 2;
  activeConversationId: string | null;
  activeOwner: ManagedCloudOwner | null;
  conversations: ConversationEntry[];
}

const EMPTY_STORE: BrowserConversationStore = {
  version: 2,
  activeConversationId: null,
  activeOwner: null,
  conversations: [],
};

const ROUTING_TASK_TYPES: ReadonlySet<RoutingTaskType> = new Set([
  'coding',
  'reasoning',
  'general',
  'agentic',
  'multimodal',
  'research',
  'computer-use',
  'image_generation',
  'creative_writing',
  'long_context',
  'simple_chat',
]);
const REASONING_EFFORTS: ReadonlySet<Effort> = new Set([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

let mutationQueue: Promise<void> = Promise.resolve();

interface HistoryNormalizationBudget {
  remainingContentChars: number;
  remainingAgentEvents: number;
  remainingAgentEventChars: number;
}

function createHistoryNormalizationBudget(
  contentChars = MAX_NORMALIZED_CONVERSATION_CONTENT_CHARS,
  agentEvents = MAX_STORED_AGENT_EVENTS_TOTAL,
  agentEventChars = MAX_AGENT_EVENT_SERIALIZED_CHARS_TOTAL,
): HistoryNormalizationBudget {
  return {
    remainingContentChars: contentChars,
    remainingAgentEvents: agentEvents,
    remainingAgentEventChars: agentEventChars,
  };
}

function cloneHistoryNormalizationBudget(
  budget: HistoryNormalizationBudget,
): HistoryNormalizationBudget {
  return { ...budget };
}

function commitHistoryNormalizationBudget(
  target: HistoryNormalizationBudget,
  source: HistoryNormalizationBudget,
): void {
  target.remainingContentChars = source.remainingContentChars;
  target.remainingAgentEvents = source.remainingAgentEvents;
  target.remainingAgentEventChars = source.remainingAgentEventChars;
}

function boundedStructuredChars(value: unknown, maximum: number): number | null {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let estimatedChars = 0;
  let visitedNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    visitedNodes += 1;
    if (visitedNodes > 2_048 || current.depth > 24) return null;
    const candidate = current.value;
    if (candidate === null) {
      estimatedChars += 4;
    } else if (typeof candidate === 'string') {
      estimatedChars += candidate.length + 2;
    } else if (typeof candidate === 'number' || typeof candidate === 'boolean') {
      estimatedChars += 16;
    } else if (typeof candidate === 'object') {
      if (seen.has(candidate)) return null;
      seen.add(candidate);
      if (Array.isArray(candidate)) {
        if (candidate.length > 512) return null;
        estimatedChars += candidate.length + 2;
        for (let index = candidate.length - 1; index >= 0; index -= 1) {
          stack.push({ value: candidate[index], depth: current.depth + 1 });
        }
      } else {
        let propertyCount = 0;
        for (const key in candidate as Record<string, unknown>) {
          if (!Object.prototype.hasOwnProperty.call(candidate, key)) continue;
          propertyCount += 1;
          if (propertyCount > 512) return null;
          estimatedChars += key.length + 3;
          stack.push({
            value: (candidate as Record<string, unknown>)[key],
            depth: current.depth + 1,
          });
        }
      }
    } else {
      return null;
    }
    if (estimatedChars > maximum) return null;
  }
  return estimatedChars;
}

function normalizeHistoryMessage(
  value: unknown,
  budget: HistoryNormalizationBudget,
): HistoryMessage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const message = value as Record<string, unknown>;
  if (
    (message['role'] !== 'user' && message['role'] !== 'assistant') ||
    typeof message['content'] !== 'string' ||
    message['content'].length > MAX_HISTORY_CONTENT_CHARS ||
    typeof message['timestamp'] !== 'number' ||
    !Number.isFinite(message['timestamp'])
  ) {
    return undefined;
  }
  if (message['content'].length > budget.remainingContentChars) return undefined;
  budget.remainingContentChars -= message['content'].length;

  const normalized: HistoryMessage = {
    role: message['role'],
    content: message['content'],
    timestamp: message['timestamp'],
  };
  if (
    typeof message['backgroundDeliveryId'] === 'string' &&
    BACKGROUND_DELIVERY_ID_PATTERN.test(message['backgroundDeliveryId'])
  ) {
    normalized.backgroundDeliveryId = message['backgroundDeliveryId'];
  }
  if (
    message['role'] === 'assistant' &&
    Array.isArray(message['agentEvents']) &&
    budget.remainingAgentEvents > 0 &&
    budget.remainingAgentEventChars > 0
  ) {
    const rawEvents = message['agentEvents'].slice(
      -Math.min(MAX_STORED_AGENT_EVENTS_PER_MESSAGE, budget.remainingAgentEvents),
    );
    const parsedEvents: AgentEventEnvelope[] = [];
    let consumedEventChars = 0;
    for (const rawEvent of rawEvents) {
      const eventChars = boundedStructuredChars(rawEvent, MAX_AGENT_EVENT_SERIALIZED_CHARS);
      if (
        eventChars === null ||
        consumedEventChars + eventChars > budget.remainingAgentEventChars
      ) {
        continue;
      }
      const parsed = AgentEventEnvelopeSchema.safeParse(rawEvent);
      if (!parsed.success) continue;
      parsedEvents.push(parsed.data);
      consumedEventChars += eventChars;
    }
    if (parsedEvents.length > 0) {
      normalized.agentEvents = parsedEvents;
      budget.remainingAgentEvents -= parsedEvents.length;
      budget.remainingAgentEventChars -= consumedEventChars;
    }
  }
  if (message['role'] === 'assistant') {
    const run = ManagedCloudAgentRunReferenceSchema.safeParse(message['cloudAgentRun']);
    if (run.success) normalized.cloudAgentRun = run.data;
    const decisions = message['cloudApprovalDecisions'];
    if (decisions && typeof decisions === 'object' && !Array.isArray(decisions)) {
      const entries = Object.entries(decisions);
      if (
        entries.length <= 32 &&
        entries.every(
          ([toolCallId, decision]) =>
            toolCallId.length > 0 &&
            toolCallId.length <= 128 &&
            !containsControlCharacter(toolCallId) &&
            (decision === 'approved' || decision === 'rejected'),
        )
      ) {
        normalized.cloudApprovalDecisions = Object.fromEntries(entries) as Record<
          string,
          'approved' | 'rejected'
        >;
      }
    }
    if (
      typeof message['cloudApprovalError'] === 'string' &&
      message['cloudApprovalError'].length > 0 &&
      message['cloudApprovalError'].length <= 500 &&
      !containsControlCharacter(message['cloudApprovalError'])
    ) {
      normalized.cloudApprovalError = message['cloudApprovalError'];
    }
    if (message['managedQuickMode'] === true) normalized.managedQuickMode = true;
    if (isSafeModelReference(message['model'])) {
      const modelMetadata = getModelMetadataById(message['model']);
      // Chrome's managed router admits catalog models only. Re-derive the
      // provider from that catalog instead of trusting a mutable storage field.
      if (modelMetadata) {
        normalized.model = message['model'];
        normalized.provider = modelMetadata.provider;
      }
    }
    const rawGeneratedFiles = message['generatedFiles'];
    const generatedFiles = parseGeneratedFilesDelta({
      files: Array.isArray(rawGeneratedFiles)
        ? rawGeneratedFiles.slice(0, MAX_STORED_GENERATED_FILES_PER_MESSAGE)
        : [],
    });
    if (generatedFiles.length > 0) normalized.generatedFiles = generatedFiles;
    const interactiveCards = readPersistedInteractiveCards({
      interactiveCards: message['interactiveCards'],
    });
    if (interactiveCards.length > 0) normalized.interactiveCards = interactiveCards;
  }
  // Cloud-mirror bookkeeping. Every field here is DROPPED on an unrecognized
  // value rather than rejected: `normalizeConversationEntry` discards the whole
  // conversation when any message fails to normalize, so a corrupt
  // `cloudMessageId` must degrade the message to "unsynced" (it will be re-sent
  // under a fresh id) instead of destroying the user's transcript.
  if (message['runtime'] === 'managed-cloud' || message['runtime'] === 'local') {
    normalized.runtime = message['runtime'];
  }
  if (
    typeof message['cloudMessageId'] === 'string' &&
    UUID_PATTERN.test(message['cloudMessageId'])
  ) {
    normalized.cloudMessageId = message['cloudMessageId'];
  }
  if (typeof message['cloudSyncedAt'] === 'number' && Number.isFinite(message['cloudSyncedAt'])) {
    normalized.cloudSyncedAt = message['cloudSyncedAt'];
  }
  if (
    typeof message['cloudSyncedChars'] === 'number' &&
    Number.isFinite(message['cloudSyncedChars'])
  ) {
    normalized.cloudSyncedChars = message['cloudSyncedChars'];
  }
  if (
    typeof message['cloudSyncedFingerprint'] === 'string' &&
    /^[0-9]+:[0-9a-f]{8}:[0-9a-f]{8}$/.test(message['cloudSyncedFingerprint'])
  ) {
    normalized.cloudSyncedFingerprint = message['cloudSyncedFingerprint'];
  }
  return normalized;
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isSafeModelReference(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !containsControlCharacter(value)
  );
}

function isSafeConversationId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !containsControlCharacter(value)
  );
}

function assertManagedCloudOwner(owner: ManagedCloudOwner): void {
  if (!normalizeManagedCloudOwner(owner)) throw new Error('Invalid Managed Cloud owner');
}

function normalizeRoutingState(value: unknown): ConversationRoutingState {
  if (!value || typeof value !== 'object') return { selectedModel: 'auto' };
  const routing = value as Record<string, unknown>;
  if (!isSafeModelReference(routing['selectedModel'])) return { selectedModel: 'auto' };

  const normalized: ConversationRoutingState = {
    selectedModel: routing['selectedModel'],
  };
  if (isSafeModelReference(routing['currentModelKey'])) {
    normalized.currentModelKey = routing['currentModelKey'];
  }
  if (
    typeof routing['previousTaskType'] === 'string' &&
    ROUTING_TASK_TYPES.has(routing['previousTaskType'] as RoutingTaskType)
  ) {
    normalized.previousTaskType = routing['previousTaskType'] as RoutingTaskType;
  }
  if (typeof routing['effort'] === 'string' && REASONING_EFFORTS.has(routing['effort'] as Effort)) {
    normalized.effort = routing['effort'] as Effort;
  }
  return normalized;
}

/**
 * Validate the cloud-mirror bookkeeping attached to a stored conversation.
 *
 * Same discipline as the message normalizer: anything unrecognized is dropped,
 * never rejected. Losing the binding costs one duplicate cloud conversation;
 * rejecting the entry would cost the user their chat.
 */
function normalizeCloudSyncState(value: unknown): ConversationCloudSyncState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const state =
    raw['state'] === 'pending' || raw['state'] === 'error' || raw['state'] === 'blocked'
      ? raw['state']
      : 'idle';
  const normalized: ConversationCloudSyncState = { state };
  if (typeof raw['conversationId'] === 'string' && UUID_PATTERN.test(raw['conversationId'])) {
    normalized.conversationId = raw['conversationId'];
  }
  if (
    raw['organizationId'] === null ||
    (typeof raw['organizationId'] === 'string' && UUID_PATTERN.test(raw['organizationId']))
  ) {
    normalized.organizationId = raw['organizationId'];
  }
  if (typeof raw['createAcknowledged'] === 'boolean') {
    normalized.createAcknowledged = raw['createAcknowledged'];
  }
  if (
    typeof raw['syncedTitle'] === 'string' &&
    raw['syncedTitle'].length > 0 &&
    raw['syncedTitle'].length <= MAX_CONVERSATION_TITLE_CHARS &&
    !containsControlCharacter(raw['syncedTitle'])
  ) {
    normalized.syncedTitle = raw['syncedTitle'];
  }
  if (
    raw['blockedReason'] === 'non-cloud-runtime' ||
    raw['blockedReason'] === 'auth' ||
    raw['blockedReason'] === 'not-found' ||
    raw['blockedReason'] === 'workspace'
  ) {
    normalized.blockedReason = raw['blockedReason'];
  }
  if (typeof raw['lastError'] === 'string' && raw['lastError'].length > 0) {
    const bounded = boundCloudSyncErrorText(raw['lastError']);
    if (bounded) normalized.lastError = bounded;
  }
  if (typeof raw['lastAttemptAt'] === 'number' && Number.isFinite(raw['lastAttemptAt'])) {
    normalized.lastAttemptAt = raw['lastAttemptAt'];
  }
  if (typeof raw['retryAfter'] === 'number' && Number.isFinite(raw['retryAfter'])) {
    normalized.retryAfter = raw['retryAfter'];
  }
  // Nothing worth persisting: an all-defaults record only adds storage bytes.
  const isEmpty =
    normalized.state === 'idle' &&
    normalized.conversationId === undefined &&
    normalized.organizationId === undefined &&
    normalized.createAcknowledged === undefined &&
    normalized.syncedTitle === undefined &&
    normalized.blockedReason === undefined &&
    normalized.lastError === undefined &&
    normalized.lastAttemptAt === undefined &&
    normalized.retryAfter === undefined;
  return isEmpty ? undefined : normalized;
}

/** Strip control characters and bound an error string before it reaches storage. */
function boundCloudSyncErrorText(value: string): string | undefined {
  let stripped = '';
  for (
    let index = 0;
    index < value.length && stripped.length < MAX_CLOUD_SYNC_ERROR_CHARS;
    index += 1
  ) {
    const code = value.charCodeAt(index);
    stripped += code <= 0x1f || code === 0x7f ? ' ' : value[index];
  }
  const trimmed = stripped.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeConversationEntry(
  value: unknown,
  budget: HistoryNormalizationBudget,
): ConversationEntry | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Record<string, unknown>;
  const owner = normalizeManagedCloudOwner(entry['owner']);
  if (
    !owner ||
    !isSafeConversationId(entry['id']) ||
    typeof entry['title'] !== 'string' ||
    entry['title'].length === 0 ||
    entry['title'].length > MAX_CONVERSATION_TITLE_CHARS ||
    containsControlCharacter(entry['title']) ||
    !Array.isArray(entry['messages']) ||
    typeof entry['savedAt'] !== 'number' ||
    !Number.isFinite(entry['savedAt'])
  ) {
    return undefined;
  }
  const entryBudget = cloneHistoryNormalizationBudget(budget);
  const rawMessages = entry['messages'].slice(-MAX_MESSAGES_PER_CONVERSATION);
  const messages = normalizeMessages(rawMessages, entryBudget);
  if (messages.length !== rawMessages.length) return undefined;
  const title = entry['title'].trim();
  if (!title) return undefined;
  const cloudSync = normalizeCloudSyncState(entry['cloudSync']);
  const normalized: ConversationEntry = {
    id: entry['id'],
    owner,
    title,
    messages,
    savedAt: entry['savedAt'],
    routing: normalizeRoutingState(entry['routing']),
    ...(cloudSync ? { cloudSync } : {}),
  };
  commitHistoryNormalizationBudget(budget, entryBudget);
  return normalized;
}

function normalizeConversationEntries(value: unknown): ConversationEntry[] {
  if (!Array.isArray(value)) return [];
  const normalized: ConversationEntry[] = [];
  const ids = new Set<string>();
  const budget = createHistoryNormalizationBudget(
    MAX_NORMALIZED_STORE_CONTENT_CHARS,
    MAX_STORED_AGENT_EVENTS_TOTAL,
    MAX_AGENT_EVENT_SERIALIZED_CHARS_TOTAL,
  );
  for (const valueEntry of value.slice(0, MAX_CONVERSATION_SCAN)) {
    const entry = normalizeConversationEntry(valueEntry, budget);
    const entryIdentity = entry ? `${managedCloudOwnerKey(entry.owner)}:${entry.id}` : undefined;
    if (entry && entryIdentity && !ids.has(entryIdentity)) {
      normalized.push(entry);
      ids.add(entryIdentity);
    }
    if (normalized.length >= MAX_CONVERSATIONS) break;
  }
  return normalized;
}

function normalizeMessages(
  value: unknown,
  budget = createHistoryNormalizationBudget(),
): HistoryMessage[] {
  if (!Array.isArray(value)) return [];
  const rawMessages = value.slice(-MAX_MESSAGES_PER_CONVERSATION);
  const normalized: HistoryMessage[] = [];
  // Consume the aggregate budget newest-first so oversized conversations keep
  // their latest usable turns instead of retaining the oldest prefix.
  for (let index = rawMessages.length - 1; index >= 0; index -= 1) {
    const message = normalizeHistoryMessage(rawMessages[index], budget);
    if (message) normalized.push(message);
  }
  normalized.reverse();
  return normalized;
}

/**
 * Re-attach cloud-sync bookkeeping (and provenance) from the stored entry onto
 * an incoming message array.
 *
 * `upsertConversation` replaces `entry.messages` wholesale from the side
 * panel's 50-message window, and the panel knows nothing about
 * `cloudMessageId`. Without this, every save would look like "nothing has ever
 * been synced" and re-POST the entire thread under fresh ids.
 *
 * Matching is on (role, timestamp): the panel assigns `timestamp` once at push
 * time and never changes it, whereas `content` mutates on every stream chunk —
 * so content cannot be part of the key.
 *
 * `cloudSyncedChars` is carried verbatim on purpose. If the message grew since
 * it was accepted, the recorded length no longer matches the current content
 * and the sync worker re-sends it under the SAME `cloudMessageId`, which the
 * server upserts (`on conflict (id) do update`) instead of duplicating.
 */
function carryForwardCloudSyncState(
  existing: readonly HistoryMessage[],
  incoming: HistoryMessage[],
): HistoryMessage[] {
  if (existing.length === 0) return incoming;
  const byKey = new Map<string, HistoryMessage>();
  for (const message of existing) {
    byKey.set(`${message.role}:${message.timestamp}`, message);
  }
  return incoming.map((message) => {
    const prior = byKey.get(`${message.role}:${message.timestamp}`);
    if (!prior) return message;
    return {
      ...message,
      // Provenance is carried forward when the incoming copy omits it. This is
      // what lets a restored-from-history conversation keep its eligibility
      // instead of failing closed on every restore.
      ...(message.runtime === undefined && prior.runtime !== undefined
        ? { runtime: prior.runtime }
        : {}),
      ...(message.cloudMessageId === undefined && prior.cloudMessageId !== undefined
        ? { cloudMessageId: prior.cloudMessageId }
        : {}),
      ...(message.cloudSyncedAt === undefined && prior.cloudSyncedAt !== undefined
        ? { cloudSyncedAt: prior.cloudSyncedAt }
        : {}),
      ...(message.cloudSyncedChars === undefined && prior.cloudSyncedChars !== undefined
        ? { cloudSyncedChars: prior.cloudSyncedChars }
        : {}),
      ...(message.cloudSyncedFingerprint === undefined && prior.cloudSyncedFingerprint !== undefined
        ? { cloudSyncedFingerprint: prior.cloudSyncedFingerprint }
        : {}),
    };
  });
}

function pruneExpired(entries: ConversationEntry[]): ConversationEntry[] {
  const cutoff = Date.now() - TTL_MS;
  return entries.filter((entry) => entry.savedAt >= cutoff);
}

function deriveTitle(messages: HistoryMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser) return 'Conversation';
  const text = firstUser.content.trim().replace(/\s+/g, ' ');
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/**
 * Accept a caller-supplied conversation title. Task names come from stored
 * task records, so collapse whitespace, strip control characters and bound the
 * length before it reaches the history list.
 */
function normalizeConversationTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0 || containsControlCharacter(collapsed)) return undefined;
  return collapsed.length > MAX_CONVERSATION_TITLE_CHARS
    ? `${collapsed.slice(0, MAX_CONVERSATION_TITLE_CHARS - 3)}...`
    : collapsed;
}

export function createBrowserConversationId(): string {
  return `conv-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function createConversation(
  owner: ManagedCloudOwner,
  messages: HistoryMessage[],
  routing: ConversationRoutingState = { selectedModel: 'auto' },
  id = createBrowserConversationId(),
): ConversationEntry {
  const normalizedMessages = normalizeMessages(messages);
  return {
    id,
    owner: { ...owner },
    title: deriveTitle(normalizedMessages),
    messages: normalizedMessages,
    savedAt: Date.now(),
    routing: normalizeRoutingState(routing),
  };
}

async function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

async function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function parseStore(value: unknown): BrowserConversationStore | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const store = value as Record<string, unknown>;
  if (store['version'] !== 2 || !Array.isArray(store['conversations'])) return undefined;
  const conversations = normalizeConversationEntries(store['conversations']);
  const activeCandidate = store['activeConversationId'];
  const activeOwner = normalizeManagedCloudOwner(store['activeOwner']);
  const hasOwnedActiveConversation =
    typeof activeCandidate === 'string' &&
    activeOwner !== null &&
    conversations.some(
      (entry) => entry.id === activeCandidate && sameManagedCloudOwner(entry.owner, activeOwner),
    );
  return {
    version: 2,
    activeConversationId: hasOwnedActiveConversation ? activeCandidate : null,
    activeOwner: hasOwnedActiveConversation ? activeOwner : null,
    conversations,
  };
}

function parseLegacyBrowserStore(value: unknown): BrowserConversationStore | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const store = value as Record<string, unknown>;
  if (store['version'] !== 1 || !Array.isArray(store['conversations'])) return undefined;
  // Version-one entries predate account/session ownership. Even if a crafted
  // record includes an owner-shaped property, the schema cannot prove who
  // created it, so it must not be adopted into a Managed Cloud identity.
  return { ...EMPTY_STORE, conversations: [] };
}

async function readStore(): Promise<BrowserConversationStore> {
  const stored = await storageGet([
    BROWSER_STORE_KEY,
    LEGACY_BROWSER_STORE_KEY,
    LEGACY_HISTORY_KEY,
    LEGACY_ACTIVE_MESSAGES_KEY,
  ]);
  const current = parseStore(stored[BROWSER_STORE_KEY]);
  if (current) {
    return { ...current, conversations: pruneExpired(current.conversations) };
  }

  const legacyBrowserStore = parseLegacyBrowserStore(stored[LEGACY_BROWSER_STORE_KEY]);
  if (legacyBrowserStore) {
    const boundedLegacyStore = boundConversationStoreForWrite(legacyBrowserStore);
    await storageSet({ [BROWSER_STORE_KEY]: boundedLegacyStore });
    await storageRemove([LEGACY_BROWSER_STORE_KEY]);
    return {
      ...boundedLegacyStore,
      conversations: pruneExpired(boundedLegacyStore.conversations),
    };
  }

  const hasLegacyHistory = stored[LEGACY_HISTORY_KEY] !== undefined;
  const hasLegacyActiveMessages = stored[LEGACY_ACTIVE_MESSAGES_KEY] !== undefined;
  if (!hasLegacyHistory && !hasLegacyActiveMessages) {
    return { ...EMPTY_STORE, conversations: [] };
  }

  // Legacy records predate account/session ownership. They cannot be safely
  // attributed to the currently signed-in user, so remove rather than adopt
  // them into a Managed Cloud identity.
  const boundedMigratedStore: BrowserConversationStore = {
    version: 2,
    activeConversationId: null,
    activeOwner: null,
    conversations: [],
  };
  await storageSet({ [BROWSER_STORE_KEY]: boundedMigratedStore });
  await storageRemove([LEGACY_HISTORY_KEY, LEGACY_ACTIVE_MESSAGES_KEY]);
  return boundedMigratedStore;
}

async function writeStore(store: BrowserConversationStore): Promise<BrowserConversationStore> {
  const bounded = boundConversationStoreForWrite(store);
  await storageSet({
    [BROWSER_STORE_KEY]: bounded,
  });
  return bounded;
}

function serializedByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string'
      ? new TextEncoder().encode(serialized).byteLength
      : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function fitConversationEntryToBudget(entry: ConversationEntry): ConversationEntry | undefined {
  if (serializedByteLength(entry) <= MAX_CONVERSATION_ENTRY_BYTES) return entry;

  // Binary-search the smallest oldest-message prefix to evict. This avoids an
  // O(n²) stringify loop while preserving the most recent durable turns.
  let low = 0;
  let high = entry.messages.length;
  while (low < high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = { ...entry, messages: entry.messages.slice(midpoint) };
    if (serializedByteLength(candidate) <= MAX_CONVERSATION_ENTRY_BYTES) {
      high = midpoint;
    } else {
      low = midpoint + 1;
    }
  }
  const fitted = { ...entry, messages: entry.messages.slice(low) };
  return serializedByteLength(fitted) <= MAX_CONVERSATION_ENTRY_BYTES ? fitted : undefined;
}

/**
 * STORAGE PRESSURE ONLY — NEVER A CLOUD SIGNAL.
 *
 * Everything this function drops (30-day TTL, the 1 MiB per-entry cap, the
 * 4 MiB store cap) is an eviction forced by `chrome.storage.local` quota, not
 * an expression of user intent. Do NOT hang "mirror local state to the cloud"
 * logic off `writeStore` or off this function: doing so silently converts quota
 * pressure into permanent deletion of the account-side replica, which is the
 * longer-lived copy the user is relying on.
 *
 * Cloud DELETEs originate from exactly one place: an explicit user deletion via
 * `deleteConversation`, whose returned `cloudConversationId` is the only handle
 * any caller is given.
 */
function boundConversationStoreForWrite(store: BrowserConversationStore): BrowserConversationStore {
  const candidates = pruneExpired(store.conversations)
    .slice(0, MAX_CONVERSATIONS)
    .map(fitConversationEntryToBudget)
    .filter((entry): entry is ConversationEntry => entry !== undefined);
  const active =
    store.activeConversationId && store.activeOwner
      ? candidates.find(
          (entry) =>
            entry.id === store.activeConversationId &&
            sameManagedCloudOwner(entry.owner, store.activeOwner),
        )
      : undefined;
  const activeKey = active ? `${managedCloudOwnerKey(active.owner)}:${active.id}` : undefined;
  const priority = active
    ? [
        active,
        ...candidates.filter(
          (entry) => `${managedCloudOwnerKey(entry.owner)}:${entry.id}` !== activeKey,
        ),
      ]
    : candidates;
  const selectedEntryKeys = new Set<string>();
  // Reserve framing/headroom for the active id and commas; a final exact check
  // below handles escaped/non-ASCII strings without relying on this estimate.
  let usedBytes = 1_024;
  for (const entry of priority) {
    const entryBytes = serializedByteLength(entry);
    if (!Number.isFinite(entryBytes) || usedBytes + entryBytes + 1 > MAX_CONVERSATION_STORE_BYTES) {
      continue;
    }
    selectedEntryKeys.add(`${managedCloudOwnerKey(entry.owner)}:${entry.id}`);
    usedBytes += entryBytes + 1;
  }

  const bounded: BrowserConversationStore = {
    version: 2,
    activeConversationId: active && selectedEntryKeys.has(activeKey!) ? active.id : null,
    activeOwner: active && selectedEntryKeys.has(activeKey!) ? { ...active.owner } : null,
    conversations: candidates.filter((entry) =>
      selectedEntryKeys.has(`${managedCloudOwnerKey(entry.owner)}:${entry.id}`),
    ),
  };
  while (
    bounded.conversations.length > 0 &&
    serializedByteLength(bounded) > MAX_CONVERSATION_STORE_BYTES
  ) {
    let removableIndex = -1;
    for (let index = bounded.conversations.length - 1; index >= 0; index -= 1) {
      const candidate = bounded.conversations[index];
      if (
        !candidate ||
        candidate.id !== bounded.activeConversationId ||
        !bounded.activeOwner ||
        !sameManagedCloudOwner(candidate.owner, bounded.activeOwner)
      ) {
        removableIndex = index;
        break;
      }
    }
    if (removableIndex < 0) break;
    bounded.conversations.splice(removableIndex, 1);
  }
  return bounded;
}

async function withConversationStoreLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(CONVERSATION_STORE_LOCK, operation);
  }
  return operation();
}

function mutateStore<T>(operation: (store: BrowserConversationStore) => Promise<T>): Promise<T> {
  const result = mutationQueue.then(() =>
    withConversationStoreLock(async () => operation(await readStore())),
  );
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readAfterMutations(): Promise<BrowserConversationStore> {
  await mutationQueue;
  return withConversationStoreLock(readStore);
}

/**
 * Append a completed background turn (scheduled task, shortcut replay) to a
 * task-scoped conversation.
 *
 * Background runs are dispatched with a fixed `clientInstanceId` that no side
 * panel listens for — the panel filters `CHAT_CHUNK` on its own per-panel UUID
 * — so this is the only place their answer is retained. Without it the run is
 * generated, billed, and discarded.
 *
 * Two deliberate differences from `upsertConversation`:
 *  - the caller supplies the title (the task name), because `deriveTitle`
 *    would otherwise label the entry with the raw prompt;
 *  - `activeConversationId` is left alone. A task firing in the background must
 *    never switch the conversation an open side panel is showing.
 *
 * The read-append-write runs inside `mutateStore`, so two tasks completing at
 * once cannot lose each other's turn.
 */
export async function appendBackgroundTurn(
  owner: ManagedCloudOwner,
  conversationId: string,
  title: string,
  turn: BackgroundTurn,
  routing: ConversationRoutingState = { selectedModel: 'auto' },
): Promise<BackgroundTurnAppendResult | undefined> {
  assertManagedCloudOwner(owner);
  if (!isSafeConversationId(conversationId)) {
    throw new Error('Invalid browser conversation id');
  }
  if (turn.deliveryId && !BACKGROUND_DELIVERY_ID_PATTERN.test(turn.deliveryId)) {
    throw new Error('Invalid background delivery id');
  }
  const answer = normalizeBackgroundAnswer(turn.answer);
  if (answer.length === 0) return undefined;

  const at = turn.timestamp ?? Date.now();
  const assistantModel =
    routing.currentModelKey && routing.currentModelKey !== 'auto'
      ? getModelMetadataById(routing.currentModelKey)
      : undefined;
  const appended: HistoryMessage[] = [
    {
      role: 'user',
      content: turn.prompt,
      timestamp: at,
      ...(turn.deliveryId ? { backgroundDeliveryId: turn.deliveryId } : {}),
      ...(turn.runtime ? { runtime: turn.runtime } : {}),
    },
    {
      role: 'assistant',
      content: answer,
      timestamp: at + 1,
      ...(turn.deliveryId ? { backgroundDeliveryId: turn.deliveryId } : {}),
      ...(turn.runtime ? { runtime: turn.runtime } : {}),
      ...(assistantModel ? { model: assistantModel.id, provider: assistantModel.provider } : {}),
    },
  ];

  return mutateStore(async (store) => {
    const existing = store.conversations.find(
      (entry) => entry.id === conversationId && sameManagedCloudOwner(entry.owner, owner),
    );
    const priorDeliveryMessages =
      existing && turn.deliveryId
        ? existing.messages.filter((message) => message.backgroundDeliveryId === turn.deliveryId)
        : [];
    if (
      existing &&
      priorDeliveryMessages.length === 2 &&
      priorDeliveryMessages[0]?.role === 'user' &&
      priorDeliveryMessages[0].content === turn.prompt &&
      priorDeliveryMessages[1]?.role === 'assistant' &&
      priorDeliveryMessages[1].content === answer
    ) {
      return { entry: existing, status: 'unchanged', persistedAnswer: answer };
    }
    const retainedMessages =
      existing && turn.deliveryId
        ? existing.messages.filter((message) => message.backgroundDeliveryId !== turn.deliveryId)
        : (existing?.messages ?? []);
    const normalizedMessages = normalizeMessages([...retainedMessages, ...appended]).slice(
      -MAX_BACKGROUND_MESSAGES,
    );
    // A retried delivery rewrites the same (role, timestamp) pair, so carry the
    // prior `cloudMessageId` forward. Otherwise the retry would mint fresh ids
    // and the account would end up with two copies of one background turn.
    const messages = existing
      ? carryForwardCloudSyncState(existing.messages, normalizedMessages)
      : normalizedMessages;
    const entry: ConversationEntry = {
      id: conversationId,
      owner: { ...owner },
      title: normalizeConversationTitle(title) ?? deriveTitle(messages),
      messages,
      savedAt: Date.now(),
      routing: normalizeRoutingState(routing),
      // Preserve the existing cloud binding: this entry is rebuilt from
      // scratch, so without this the thread would be re-created in the account.
      ...(existing?.cloudSync ? { cloudSync: existing.cloudSync } : {}),
    };
    store.conversations = [
      entry,
      ...store.conversations.filter(
        (candidate) =>
          candidate.id !== conversationId || !sameManagedCloudOwner(candidate.owner, owner),
      ),
    ].slice(0, MAX_CONVERSATIONS);
    const persistedStore = await writeStore(store);
    const persistedEntry = persistedStore.conversations.find(
      (candidate) =>
        candidate.id === conversationId && sameManagedCloudOwner(candidate.owner, owner),
    );
    const persistedAssistant = persistedEntry?.messages[persistedEntry.messages.length - 1];
    if (
      !persistedEntry ||
      persistedAssistant?.role !== 'assistant' ||
      persistedAssistant.content !== answer ||
      (turn.deliveryId && persistedAssistant.backgroundDeliveryId !== turn.deliveryId)
    ) {
      return undefined;
    }
    return {
      entry: persistedEntry,
      status: priorDeliveryMessages.length > 0 ? 'updated' : 'inserted',
      persistedAnswer: persistedAssistant.content,
    };
  });
}

/**
 * Keep a paid background answer renderable in browser-local history instead
 * of letting the generic message normalizer silently drop an oversized turn.
 */
function normalizeBackgroundAnswer(value: string): string {
  const answer = value.trim();
  if (answer.length <= MAX_HISTORY_CONTENT_CHARS) return answer;

  const prefixLimit = MAX_HISTORY_CONTENT_CHARS - BACKGROUND_ANSWER_TRUNCATION_NOTICE.length;
  let prefix = answer.slice(0, prefixLimit);
  // Avoid persisting a lone high surrogate when the UTF-16 boundary bisects a
  // non-BMP character.
  const lastCodeUnit = prefix.charCodeAt(prefix.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) prefix = prefix.slice(0, -1);
  return `${prefix.trimEnd()}${BACKGROUND_ANSWER_TRUNCATION_NOTICE}`;
}

/**
 * Save an independent archived browser conversation.
 *
 * NOT a production path — no caller outside the test suite. It is deliberately
 * left without cloud-mirror semantics (no carry-forward, no binding): teaching
 * it sync would ship a cloud write path that nothing exercises in production.
 */
export async function saveConversation(
  owner: ManagedCloudOwner,
  messages: HistoryMessage[],
  routing: ConversationRoutingState = { selectedModel: 'auto' },
): Promise<string> {
  assertManagedCloudOwner(owner);
  if (messages.length === 0) return '';
  return mutateStore(async (store) => {
    const entry = createConversation(owner, messages, routing);
    store.conversations = [entry, ...store.conversations].slice(0, MAX_CONVERSATIONS);
    await writeStore(store);
    return entry.id;
  });
}

/**
 * Persist a browser conversation using the caller-owned identity.
 *
 * Side panels must use this API instead of inferring ownership from the
 * store-wide active pointer. Multiple Chrome windows can therefore retain
 * distinct conversations even when they save concurrently.
 */
export async function upsertConversation(
  owner: ManagedCloudOwner,
  conversationId: string,
  messages: HistoryMessage[],
  routing: ConversationRoutingState = { selectedModel: 'auto' },
): Promise<ConversationEntry | undefined> {
  assertManagedCloudOwner(owner);
  if (!isSafeConversationId(conversationId)) {
    throw new Error('Invalid browser conversation id');
  }
  if (messages.length === 0) return undefined;

  return mutateStore(async (store) => {
    const normalizedMessages = normalizeMessages(messages);
    const existing = store.conversations.find(
      (entry) => entry.id === conversationId && sameManagedCloudOwner(entry.owner, owner),
    );
    // The panel sends a plain transcript window with no cloud bookkeeping, so
    // re-attach what the stored record already knows before it is overwritten.
    const carried = existing
      ? carryForwardCloudSyncState(existing.messages, normalizedMessages)
      : normalizedMessages;
    const entry: ConversationEntry = existing
      ? {
          // `cloudSync` survives via this spread — the explicit fields below
          // must never shadow it.
          ...existing,
          title: deriveTitle(carried),
          messages: carried,
          savedAt: Date.now(),
          routing: normalizeRoutingState(routing),
        }
      : createConversation(owner, carried, routing, conversationId);
    store.activeConversationId = conversationId;
    store.activeOwner = { ...owner };
    store.conversations = [
      entry,
      ...store.conversations.filter(
        (candidate) =>
          candidate.id !== conversationId || !sameManagedCloudOwner(candidate.owner, owner),
      ),
    ].slice(0, MAX_CONVERSATIONS);
    await writeStore(store);
    return entry;
  });
}

/**
 * Persist a boot-time seed under a newly allocated window owner without
 * changing the store-wide active pointer or overwriting a turn that may have
 * already saved under that owner. This closes the gap where a side panel could
 * hydrate a colliding seed only in memory and lose it when the panel closed.
 */
export async function persistConversationSeed(
  owner: ManagedCloudOwner,
  conversationId: string,
  seed: ConversationEntry,
): Promise<ConversationEntry | undefined> {
  assertManagedCloudOwner(owner);
  if (!isSafeConversationId(conversationId)) {
    throw new Error('Invalid browser conversation id');
  }
  const normalizedSeed = normalizeConversationEntry(
    { ...seed, owner, id: conversationId, savedAt: Date.now() },
    createHistoryNormalizationBudget(MAX_NORMALIZED_STORE_CONTENT_CHARS),
  );
  if (!normalizedSeed) return undefined;

  return mutateStore(async (store) => {
    const existing = store.conversations.find(
      (entry) => entry.id === conversationId && sameManagedCloudOwner(entry.owner, owner),
    );
    if (existing) return existing;
    store.conversations = [normalizedSeed, ...store.conversations].slice(0, MAX_CONVERSATIONS);
    await writeStore(store);
    return normalizedSeed;
  });
}

/**
 * Persist the current Chrome conversation, updating its existing record in
 * place.
 *
 * NOT a production path (see `saveConversation`) — the side panel uses
 * `upsertConversation`, which is the only writer that carries cloud-mirror
 * bookkeeping forward.
 */
export async function saveActiveConversation(
  owner: ManagedCloudOwner,
  messages: HistoryMessage[],
  routing: ConversationRoutingState = { selectedModel: 'auto' },
): Promise<ConversationEntry | undefined> {
  assertManagedCloudOwner(owner);
  if (messages.length === 0) return undefined;
  return mutateStore(async (store) => {
    const normalizedMessages = normalizeMessages(messages);
    const existing =
      store.activeConversationId && sameManagedCloudOwner(store.activeOwner, owner)
        ? store.conversations.find(
            (entry) =>
              entry.id === store.activeConversationId && sameManagedCloudOwner(entry.owner, owner),
          )
        : undefined;
    const entry: ConversationEntry = existing
      ? {
          ...existing,
          title: deriveTitle(normalizedMessages),
          messages: normalizedMessages,
          savedAt: Date.now(),
          routing: normalizeRoutingState(routing),
        }
      : createConversation(owner, normalizedMessages, routing);
    store.activeConversationId = entry.id;
    store.activeOwner = { ...owner };
    store.conversations = [
      entry,
      ...store.conversations.filter(
        (candidate) => candidate.id !== entry.id || !sameManagedCloudOwner(candidate.owner, owner),
      ),
    ].slice(0, MAX_CONVERSATIONS);
    await writeStore(store);
    return entry;
  });
}

export async function getActiveConversation(
  owner: ManagedCloudOwner,
): Promise<ConversationEntry | undefined> {
  assertManagedCloudOwner(owner);
  const store = await readAfterMutations();
  const active =
    store.activeConversationId && sameManagedCloudOwner(store.activeOwner, owner)
      ? store.conversations.find(
          (entry) =>
            entry.id === store.activeConversationId && sameManagedCloudOwner(entry.owner, owner),
        )
      : undefined;
  return active;
}

export async function startNewConversation(owner: ManagedCloudOwner): Promise<void> {
  assertManagedCloudOwner(owner);
  await mutateStore(async (store) => {
    if (
      store.activeConversationId &&
      sameManagedCloudOwner(store.activeOwner, owner) &&
      store.conversations.some(
        (entry) =>
          entry.id === store.activeConversationId && sameManagedCloudOwner(entry.owner, owner),
      )
    ) {
      store.activeConversationId = null;
      store.activeOwner = null;
    }
    await writeStore(store);
  });
}

export async function activateConversation(
  owner: ManagedCloudOwner,
  id: string,
): Promise<ConversationEntry | undefined> {
  assertManagedCloudOwner(owner);
  return mutateStore(async (store) => {
    const entry = store.conversations.find(
      (candidate) => candidate.id === id && sameManagedCloudOwner(candidate.owner, owner),
    );
    if (!entry) return undefined;
    store.activeConversationId = id;
    store.activeOwner = { ...owner };
    await writeStore(store);
    return entry;
  });
}

export async function listConversations(owner: ManagedCloudOwner): Promise<ConversationEntry[]> {
  assertManagedCloudOwner(owner);
  return (await readAfterMutations()).conversations.filter((entry) =>
    sameManagedCloudOwner(entry.owner, owner),
  );
}

/**
 * Search browser-local history without sending titles or message content off
 * device. Every normalized query term must appear somewhere in the title or
 * transcript, allowing useful multi-word searches without inventing ranking.
 */
export function filterConversations(
  entries: readonly ConversationEntry[],
  query: string,
): ConversationEntry[] {
  const terms = query
    .slice(0, MAX_HISTORY_QUERY_CHARS)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const boundedEntries = entries.slice(0, MAX_CONVERSATIONS);
  if (terms.length === 0) return [...boundedEntries];

  return boundedEntries.filter((entry) => {
    let searchable = entry.title.slice(0, MAX_SEARCHABLE_CHARS_PER_CONVERSATION).toLowerCase();
    for (const message of entry.messages) {
      const remaining = MAX_SEARCHABLE_CHARS_PER_CONVERSATION - searchable.length;
      if (remaining <= 0) break;
      searchable += `\n${message.content.slice(0, Math.max(0, remaining - 1)).toLowerCase()}`;
    }
    return terms.every((term) => searchable.includes(term));
  });
}

export async function getConversation(
  owner: ManagedCloudOwner,
  id: string,
): Promise<ConversationEntry | undefined> {
  assertManagedCloudOwner(owner);
  return (await readAfterMutations()).conversations.find(
    (entry) => entry.id === id && sameManagedCloudOwner(entry.owner, owner),
  );
}

export interface ConversationDeletionRecord {
  /**
   * Present only when the deleted thread had a cloud replica the caller must
   * also delete. This is the ONLY handle any code is given for a cloud DELETE —
   * see the note on `boundConversationStoreForWrite` for why quota eviction
   * must never produce one.
   */
  cloudConversationId?: string;
  /** Stable scope for the remote delete; null means Personal. */
  organizationId?: string | null;
}

/**
 * Delete a browser conversation the caller owns.
 *
 * Returns `undefined` when nothing was deleted, preserving the previous no-op
 * behavior for a missing or unowned id.
 */
export async function deleteConversation(
  owner: ManagedCloudOwner,
  id: string,
): Promise<ConversationDeletionRecord | undefined> {
  assertManagedCloudOwner(owner);
  return mutateStore(async (store) => {
    const target = store.conversations.find(
      (entry) => entry.id === id && sameManagedCloudOwner(entry.owner, owner),
    );
    if (!target) return undefined;
    const cloudConversationId = target.cloudSync?.conversationId;
    const organizationId = target.cloudSync?.organizationId;
    store.conversations = store.conversations.filter(
      (entry) => entry.id !== id || !sameManagedCloudOwner(entry.owner, owner),
    );
    if (store.activeConversationId === id && sameManagedCloudOwner(store.activeOwner, owner)) {
      store.activeConversationId = null;
      store.activeOwner = null;
    }
    await writeStore(store);
    return cloudConversationId && organizationId !== undefined
      ? { cloudConversationId, organizationId }
      : {};
  });
}

// ─── Account-backed mirror bookkeeping ─────────────────────────────────────
//
// None of the functions below perform network I/O, and none of them may ever
// start doing so: they all run inside `mutateStore`, which holds the
// `navigator.locks` conversation-store lock. An HTTP round trip taken while
// holding that lock would stall the other extension context's chat writes for
// the duration of the request.

/**
 * True when every message in the thread carries Managed Cloud provenance and
 * the thread has not been stickily disqualified.
 *
 * Fails closed on an empty transcript and on any message with no `runtime`
 * stamp (pre-feature records, and anything a future code path forgets to
 * stamp).
 */
export function isCloudPersistenceEligible(entry: ConversationEntry): boolean {
  if (entry.cloudSync?.blockedReason === 'non-cloud-runtime') return false;
  if (entry.messages.length === 0) return false;
  return entry.messages.every((message) => message.runtime === 'managed-cloud');
}

/**
 * Non-cryptographic, compact change detector for the exact durable projection.
 * Two independent 32-bit accumulators make accidental collisions negligible;
 * this is only dirty-state bookkeeping, never a security or integrity check.
 */
export function cloudMessageSyncFingerprint(message: HistoryMessage): string {
  const serialized = JSON.stringify({
    role: message.role,
    content: message.content,
    managedQuickMode: message.managedQuickMode === true,
    cloudAgentRunId: message.cloudAgentRun?.runId,
    model: message.model,
    provider: message.provider,
    generatedFiles: message.generatedFiles,
    interactiveCards: message.interactiveCards,
  });
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${serialized.length}:${(first >>> 0).toString(16).padStart(8, '0')}:${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

/**
 * Messages that still owe the cloud a write: non-empty content, and either
 * never accepted or accepted with any different mirrored content/metadata.
 */
export function pendingCloudMessages(entry: ConversationEntry): HistoryMessage[] {
  return entry.messages.filter(
    (message) =>
      message.content.trim().length > 0 &&
      (message.cloudSyncedAt === undefined ||
        message.cloudSyncedChars !== message.content.length ||
        message.cloudSyncedFingerprint !== cloudMessageSyncFingerprint(message)),
  );
}

/**
 * Read-only scan backing the worker's catch-up sweep.
 */
export async function listConversationsNeedingCloudSync(
  owner: ManagedCloudOwner,
): Promise<ConversationEntry[]> {
  assertManagedCloudOwner(owner);
  const now = Date.now();
  return (await readAfterMutations()).conversations.filter((entry) => {
    if (!sameManagedCloudOwner(entry.owner, owner)) return false;
    if (!isCloudPersistenceEligible(entry)) return false;
    if (entry.cloudSync?.retryAfter !== undefined && entry.cloudSync.retryAfter > now) return false;
    if (
      entry.cloudSync?.blockedReason === 'not-found' ||
      entry.cloudSync?.blockedReason === 'workspace'
    ) {
      return false;
    }
    return (
      pendingCloudMessages(entry).length > 0 ||
      (entry.cloudSync?.conversationId !== undefined &&
        (entry.cloudSync.syncedTitle !== entry.title ||
          entry.cloudSync.organizationId === undefined ||
          entry.cloudSync.createAcknowledged !== true))
    );
  });
}

/**
 * Bind a local conversation to a cloud UUID and mint a `cloudMessageId` for
 * every message that lacks one.
 *
 * Idempotent by construction: an existing binding is returned unchanged, so two
 * concurrent flushes cannot create two cloud rows for one thread. Minting is
 * lazy, so empty and provenance-ineligible threads do not consume bookkeeping
 * space in the 4 MiB local budget.
 *
 * Returns `undefined` when the thread is missing or not cloud-eligible.
 */
export async function claimCloudConversationBinding(
  owner: ManagedCloudOwner,
  conversationId: string,
  mintCloudConversationId: () => string,
): Promise<ConversationEntry | undefined> {
  assertManagedCloudOwner(owner);
  if (!isSafeConversationId(conversationId)) return undefined;
  return mutateStore(async (store) => {
    const index = store.conversations.findIndex(
      (entry) => entry.id === conversationId && sameManagedCloudOwner(entry.owner, owner),
    );
    const existing = index >= 0 ? store.conversations[index] : undefined;
    if (!existing || index < 0) return undefined;
    if (!isCloudPersistenceEligible(existing)) return undefined;

    const hadBinding = existing.cloudSync?.conversationId !== undefined;
    const minted = existing.cloudSync?.conversationId ?? mintCloudConversationId();
    if (!UUID_PATTERN.test(minted)) return undefined;

    const messages = existing.messages.map((message) =>
      message.cloudMessageId || message.content.trim().length === 0
        ? message
        : { ...message, cloudMessageId: crypto.randomUUID() },
    );
    const cloudSync: ConversationCloudSyncState = {
      ...(existing.cloudSync ?? { state: 'idle' }),
      conversationId: minted,
      ...(!hadBinding ? { createAcknowledged: false } : {}),
      state: 'pending',
      lastAttemptAt: Date.now(),
    };
    const entry: ConversationEntry = { ...existing, messages, cloudSync };
    store.conversations = store.conversations.map((candidate, candidateIndex) =>
      candidateIndex === index ? entry : candidate,
    );
    await writeStore(store);
    return entry;
  });
}

/**
 * Commit acceptance for messages the server confirmed. Unmatched ids are
 * ignored so a stale batch cannot mark a re-minted message as synced.
 */
export async function recordCloudMessagesSynced(
  owner: ManagedCloudOwner,
  conversationId: string,
  results: readonly {
    cloudMessageId: string;
    syncedChars: number;
    syncedFingerprint: string;
  }[],
  syncedTitle?: string,
): Promise<void> {
  assertManagedCloudOwner(owner);
  if (results.length === 0 && syncedTitle === undefined) return;
  const accepted = new Map(results.map((result) => [result.cloudMessageId, result]));
  const at = Date.now();
  await mutateStore(async (store) => {
    const index = store.conversations.findIndex(
      (entry) => entry.id === conversationId && sameManagedCloudOwner(entry.owner, owner),
    );
    const existing = index >= 0 ? store.conversations[index] : undefined;
    if (!existing || index < 0) return;
    const messages = existing.messages.map((message) => {
      if (!message.cloudMessageId) return message;
      const result = accepted.get(message.cloudMessageId);
      if (!result) return message;
      return {
        ...message,
        cloudSyncedAt: at,
        cloudSyncedChars: result.syncedChars,
        cloudSyncedFingerprint: result.syncedFingerprint,
      };
    });
    const cloudSync: ConversationCloudSyncState = {
      ...(existing.cloudSync ?? { state: 'idle' }),
      state: 'idle',
      ...(syncedTitle !== undefined ? { syncedTitle } : {}),
    };
    // A successful write clears transient auth/backoff state, but terminal
    // trust/deletion/workspace blocks are sticky and cannot be revived by a
    // stale completion.
    const hasTerminalBlock =
      cloudSync.blockedReason === 'non-cloud-runtime' ||
      cloudSync.blockedReason === 'not-found' ||
      cloudSync.blockedReason === 'workspace';
    if (hasTerminalBlock) {
      cloudSync.state = 'blocked';
    } else {
      delete cloudSync.lastError;
      delete cloudSync.retryAfter;
      if (cloudSync.blockedReason === 'auth') delete cloudSync.blockedReason;
    }
    store.conversations = store.conversations.map((candidate, candidateIndex) =>
      candidateIndex === index ? { ...existing, messages, cloudSync } : candidate,
    );
    await writeStore(store);
  });
}

/**
 * Record a non-fatal failure, backoff, or block. Never throws: this runs on the
 * failure path of a best-effort mirror, and a storage error here must not turn
 * into an unhandled rejection in the service worker.
 */
export async function recordCloudSyncState(
  owner: ManagedCloudOwner,
  conversationId: string,
  patch: Partial<ConversationCloudSyncState>,
): Promise<void> {
  try {
    assertManagedCloudOwner(owner);
    await mutateStore(async (store) => {
      const index = store.conversations.findIndex(
        (entry) => entry.id === conversationId && sameManagedCloudOwner(entry.owner, owner),
      );
      const existing = index >= 0 ? store.conversations[index] : undefined;
      if (!existing || index < 0) return;
      const merged: ConversationCloudSyncState = {
        ...(existing.cloudSync ?? { state: 'idle' }),
        ...patch,
      };
      // Terminal blocks outrank every later state transition. In particular,
      // a deleted cloud row is never rebound or partially re-created.
      const terminalReason = existing.cloudSync?.blockedReason;
      if (
        terminalReason === 'non-cloud-runtime' ||
        terminalReason === 'not-found' ||
        terminalReason === 'workspace'
      ) {
        merged.state = 'blocked';
        merged.blockedReason = terminalReason;
      }
      const normalized = normalizeCloudSyncState(merged) ?? { state: 'idle' };
      store.conversations = store.conversations.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...existing, cloudSync: normalized } : candidate,
      );
      await writeStore(store);
    });
  } catch {
    // Best-effort bookkeeping only. The sweep alarm retries from stored state.
  }
}

/**
 * Permanently disqualify a thread because a non-Managed-Cloud turn landed in
 * it. Sticky: `normalizeCloudSyncState` round-trips the reason and
 * `recordCloudSyncState` refuses to overwrite it.
 *
 * The existing cloud copy is deliberately left alone — a local turn means "stop
 * mirroring", not "delete what the user already has in their account".
 */
export async function blockCloudPersistence(
  owner: ManagedCloudOwner,
  conversationId: string,
  reason: 'non-cloud-runtime',
): Promise<void> {
  await recordCloudSyncState(owner, conversationId, { state: 'blocked', blockedReason: reason });
}
