import {
  AgentEventEnvelopeSchema,
  ManagedCloudAgentRunReferenceSchema,
  type ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import type { RoutingTaskType } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

const BROWSER_STORE_KEY = 'agi_browser_conversations_v2';
const LEGACY_BROWSER_STORE_KEY = 'agi_browser_conversations_v1';
const LEGACY_HISTORY_KEY = 'agi_conversation_history';
const LEGACY_ACTIVE_MESSAGES_KEY = 'agi_side_panel_messages';
const MAX_CONVERSATIONS = 100;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONVERSATION_STORE_LOCK = 'agi-browser-conversation-store-v2';
const MAX_STORED_AGENT_EVENTS = 1_000;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  agentEvents?: AgentEventEnvelope[];
  cloudAgentRun?: ManagedCloudAgentRunReference;
  cloudApprovalDecisions?: Record<string, 'approved' | 'rejected'>;
  cloudApprovalError?: string;
}

export interface ConversationEntry {
  id: string;
  title: string;
  messages: HistoryMessage[];
  savedAt: number;
  routing: ConversationRoutingState;
}

export interface ConversationRoutingState {
  selectedModel: string;
  currentModelKey?: string;
  previousTaskType?: RoutingTaskType;
}

interface BrowserConversationStore {
  version: 2;
  activeConversationId: string | null;
  conversations: ConversationEntry[];
}

const EMPTY_STORE: BrowserConversationStore = {
  version: 2,
  activeConversationId: null,
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

let mutationQueue: Promise<void> = Promise.resolve();

function normalizeHistoryMessage(value: unknown): HistoryMessage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const message = value as Record<string, unknown>;
  if (
    (message['role'] !== 'user' && message['role'] !== 'assistant') ||
    typeof message['content'] !== 'string' ||
    typeof message['timestamp'] !== 'number' ||
    !Number.isFinite(message['timestamp'])
  ) {
    return undefined;
  }

  const normalized: HistoryMessage = {
    role: message['role'],
    content: message['content'],
    timestamp: message['timestamp'],
  };
  if (
    message['role'] === 'assistant' &&
    Array.isArray(message['agentEvents']) &&
    message['agentEvents'].length <= MAX_STORED_AGENT_EVENTS
  ) {
    const events = message['agentEvents'].map((event) => AgentEventEnvelopeSchema.safeParse(event));
    if (events.every((event) => event.success)) {
      normalized.agentEvents = events.map((event) => event.data);
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
  return normalized;
}

function normalizeConversationEntry(value: unknown): ConversationEntry | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry['id'] !== 'string' ||
    typeof entry['title'] !== 'string' ||
    !Array.isArray(entry['messages']) ||
    typeof entry['savedAt'] !== 'number' ||
    !Number.isFinite(entry['savedAt'])
  ) {
    return undefined;
  }
  const messages = normalizeMessages(entry['messages']);
  if (messages.length !== entry['messages'].length) return undefined;
  return {
    id: entry['id'],
    title: entry['title'],
    messages,
    savedAt: entry['savedAt'],
    routing: normalizeRoutingState(entry['routing']),
  };
}

function normalizeConversationEntries(value: unknown): ConversationEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeConversationEntry)
    .filter((entry): entry is ConversationEntry => entry !== undefined);
}

function normalizeMessages(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeHistoryMessage)
    .filter((message): message is HistoryMessage => message !== undefined);
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

export function createBrowserConversationId(): string {
  return `conv-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function createConversation(
  messages: HistoryMessage[],
  routing: ConversationRoutingState = { selectedModel: 'auto' },
  id = createBrowserConversationId(),
): ConversationEntry {
  const normalizedMessages = normalizeMessages(messages);
  return {
    id,
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
  const activeConversationId =
    typeof activeCandidate === 'string' &&
    conversations.some((entry) => entry.id === activeCandidate)
      ? activeCandidate
      : null;
  return { version: 2, activeConversationId, conversations };
}

function parseLegacyBrowserStore(value: unknown): BrowserConversationStore | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const store = value as Record<string, unknown>;
  if (store['version'] !== 1 || !Array.isArray(store['conversations'])) return undefined;
  const conversations = normalizeConversationEntries(store['conversations']);
  const activeCandidate = store['activeConversationId'];
  const activeConversationId =
    typeof activeCandidate === 'string' &&
    conversations.some((entry) => entry.id === activeCandidate)
      ? activeCandidate
      : null;
  return { version: 2, activeConversationId, conversations };
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
    await storageSet({ [BROWSER_STORE_KEY]: legacyBrowserStore });
    await storageRemove([LEGACY_BROWSER_STORE_KEY]);
    return {
      ...legacyBrowserStore,
      conversations: pruneExpired(legacyBrowserStore.conversations),
    };
  }

  const legacyHistory = Array.isArray(stored[LEGACY_HISTORY_KEY])
    ? normalizeConversationEntries(stored[LEGACY_HISTORY_KEY])
    : [];
  const legacyActiveMessages = normalizeMessages(stored[LEGACY_ACTIVE_MESSAGES_KEY]);
  if (legacyHistory.length === 0 && legacyActiveMessages.length === 0) {
    return { ...EMPTY_STORE, conversations: [] };
  }

  const activeConversation =
    legacyActiveMessages.length > 0 ? createConversation(legacyActiveMessages) : undefined;
  const migrated: BrowserConversationStore = {
    version: 2,
    activeConversationId: activeConversation?.id ?? null,
    conversations: [
      ...(activeConversation ? [activeConversation] : []),
      ...pruneExpired(legacyHistory),
    ].slice(0, MAX_CONVERSATIONS),
  };
  await storageSet({ [BROWSER_STORE_KEY]: migrated });
  await storageRemove([LEGACY_HISTORY_KEY, LEGACY_ACTIVE_MESSAGES_KEY]);
  return migrated;
}

async function writeStore(store: BrowserConversationStore): Promise<void> {
  await storageSet({
    [BROWSER_STORE_KEY]: {
      version: 2,
      activeConversationId: store.activeConversationId,
      conversations: pruneExpired(store.conversations).slice(0, MAX_CONVERSATIONS),
    } satisfies BrowserConversationStore,
  });
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

/** Save an independent archived browser conversation. */
export async function saveConversation(
  messages: HistoryMessage[],
  routing: ConversationRoutingState = { selectedModel: 'auto' },
): Promise<string> {
  if (messages.length === 0) return '';
  return mutateStore(async (store) => {
    const entry = createConversation(messages, routing);
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
  conversationId: string,
  messages: HistoryMessage[],
  routing: ConversationRoutingState = { selectedModel: 'auto' },
): Promise<ConversationEntry | undefined> {
  if (!isSafeConversationId(conversationId)) {
    throw new Error('Invalid browser conversation id');
  }
  if (messages.length === 0) return undefined;

  return mutateStore(async (store) => {
    const normalizedMessages = normalizeMessages(messages);
    const existing = store.conversations.find((entry) => entry.id === conversationId);
    const entry: ConversationEntry = existing
      ? {
          ...existing,
          title: deriveTitle(normalizedMessages),
          messages: normalizedMessages,
          savedAt: Date.now(),
          routing: normalizeRoutingState(routing),
        }
      : createConversation(normalizedMessages, routing, conversationId);
    store.activeConversationId = conversationId;
    store.conversations = [
      entry,
      ...store.conversations.filter((candidate) => candidate.id !== conversationId),
    ].slice(0, MAX_CONVERSATIONS);
    await writeStore(store);
    return entry;
  });
}

/** Persist the current Chrome conversation, updating its existing record in place. */
export async function saveActiveConversation(
  messages: HistoryMessage[],
  routing: ConversationRoutingState = { selectedModel: 'auto' },
): Promise<ConversationEntry | undefined> {
  if (messages.length === 0) return undefined;
  return mutateStore(async (store) => {
    const normalizedMessages = normalizeMessages(messages);
    const existing = store.activeConversationId
      ? store.conversations.find((entry) => entry.id === store.activeConversationId)
      : undefined;
    const entry: ConversationEntry = existing
      ? {
          ...existing,
          title: deriveTitle(normalizedMessages),
          messages: normalizedMessages,
          savedAt: Date.now(),
          routing: normalizeRoutingState(routing),
        }
      : createConversation(normalizedMessages, routing);
    store.activeConversationId = entry.id;
    store.conversations = [
      entry,
      ...store.conversations.filter((candidate) => candidate.id !== entry.id),
    ].slice(0, MAX_CONVERSATIONS);
    await writeStore(store);
    return entry;
  });
}

export async function getActiveConversation(): Promise<ConversationEntry | undefined> {
  const store = await readAfterMutations();
  return store.activeConversationId
    ? store.conversations.find((entry) => entry.id === store.activeConversationId)
    : undefined;
}

export async function startNewConversation(): Promise<void> {
  await mutateStore(async (store) => {
    store.activeConversationId = null;
    await writeStore(store);
  });
}

export async function activateConversation(id: string): Promise<ConversationEntry | undefined> {
  return mutateStore(async (store) => {
    const entry = store.conversations.find((candidate) => candidate.id === id);
    if (!entry) return undefined;
    store.activeConversationId = id;
    await writeStore(store);
    return entry;
  });
}

export async function listConversations(): Promise<ConversationEntry[]> {
  return (await readAfterMutations()).conversations;
}

export async function getConversation(id: string): Promise<ConversationEntry | undefined> {
  return (await readAfterMutations()).conversations.find((entry) => entry.id === id);
}

export async function deleteConversation(id: string): Promise<void> {
  await mutateStore(async (store) => {
    store.conversations = store.conversations.filter((entry) => entry.id !== id);
    if (store.activeConversationId === id) store.activeConversationId = null;
    await writeStore(store);
  });
}
