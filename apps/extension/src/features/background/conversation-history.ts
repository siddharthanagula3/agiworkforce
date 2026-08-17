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
import { cloudMirroringEnabledSnapshot } from '../privacy/cloudMirroring';

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
const MAX_BACKGROUND_MESSAGES = 100;
const MAX_CONVERSATION_TITLE_CHARS = 80;
const BACKGROUND_DELIVERY_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
export const BACKGROUND_ANSWER_TRUNCATION_NOTICE =
  '\n\n[Answer truncated because it exceeded the browser-local history limit.]';

const MAX_CLOUD_SYNC_ERROR_CHARS = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConversationRuntime = 'managed-cloud' | 'local';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  backgroundDeliveryId?: string;
  agentEvents?: AgentEventEnvelope[];
  cloudAgentRun?: ManagedCloudAgentRunReference;
  cloudApprovalDecisions?: Record<string, 'approved' | 'rejected'>;
  cloudApprovalError?: string;
  managedQuickMode?: boolean;
  model?: string;
  provider?: string;
  generatedFiles?: GeneratedFileWire[];
  interactiveCards?: InteractiveCard[];
  runtime?: ConversationRuntime;
  cloudMessageId?: string;
  cloudSyncedAt?: number;
  cloudSyncedChars?: number;
  cloudSyncedFingerprint?: string;
}

export interface ConversationCloudSyncState {
  conversationId?: string;
  organizationId?: string | null;
  createAcknowledged?: boolean;
  syncedTitle?: string;
  state: 'idle' | 'pending' | 'error' | 'blocked';
  blockedReason?: 'non-cloud-runtime' | 'auth' | 'not-found' | 'workspace';
  lastError?: string;
  lastAttemptAt?: number;
  retryAfter?: number;
}

export interface ConversationEntry {
  id: string;
  owner: ManagedCloudOwner;
  title: string;
  messages: HistoryMessage[];
  savedAt: number;
  routing: ConversationRoutingState;
  cloudSync?: ConversationCloudSyncState;
}

export interface ConversationRoutingState {
  selectedModel: string;
  currentModelKey?: string;
  previousTaskType?: RoutingTaskType;
  effort?: Effort;
}

export interface BackgroundTurn {
  prompt: string;
  answer: string;
  timestamp?: number;
  deliveryId?: string;
  runtime?: ConversationRuntime;
}

export interface BackgroundTurnAppendResult {
  entry: ConversationEntry;
  status: 'inserted' | 'updated' | 'unchanged';
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
  for (let index = rawMessages.length - 1; index >= 0; index -= 1) {
    const message = normalizeHistoryMessage(rawMessages[index], budget);
    if (message) normalized.push(message);
  }
  normalized.reverse();
  return normalized;
}

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

function normalizeBackgroundAnswer(value: string): string {
  const answer = value.trim();
  if (answer.length <= MAX_HISTORY_CONTENT_CHARS) return answer;

  const prefixLimit = MAX_HISTORY_CONTENT_CHARS - BACKGROUND_ANSWER_TRUNCATION_NOTICE.length;
  let prefix = answer.slice(0, prefixLimit);
  const lastCodeUnit = prefix.charCodeAt(prefix.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) prefix = prefix.slice(0, -1);
  return `${prefix.trimEnd()}${BACKGROUND_ANSWER_TRUNCATION_NOTICE}`;
}

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
    const carried = existing
      ? carryForwardCloudSyncState(existing.messages, normalizedMessages)
      : normalizedMessages;
    const entry: ConversationEntry = existing
      ? {
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
  cloudConversationId?: string;
  organizationId?: string | null;
}

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

export function isCloudPersistenceEligible(entry: ConversationEntry): boolean {
  if (!cloudMirroringEnabledSnapshot()) return false;
  if (entry.cloudSync?.blockedReason === 'non-cloud-runtime') return false;
  if (entry.messages.length === 0) return false;
  return entry.messages.every((message) => message.runtime === 'managed-cloud');
}

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

export function pendingCloudMessages(entry: ConversationEntry): HistoryMessage[] {
  return entry.messages.filter(
    (message) =>
      message.content.trim().length > 0 &&
      (message.cloudSyncedAt === undefined ||
        message.cloudSyncedChars !== message.content.length ||
        message.cloudSyncedFingerprint !== cloudMessageSyncFingerprint(message)),
  );
}

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

export async function blockCloudPersistence(
  owner: ManagedCloudOwner,
  conversationId: string,
  reason: 'non-cloud-runtime',
): Promise<void> {
  await recordCloudSyncState(owner, conversationId, { state: 'blocked', blockedReason: reason });
}
