import {
  AgentEventEnvelopeSchema,
  ManagedCloudAgentRunReferenceSchema,
  type ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import type { Effort, RoutingTaskType } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  normalizeManagedCloudOwner,
  managedCloudOwnerKey,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

const BROWSER_STORE_KEY = 'agi_browser_conversations_v2';
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
}

export interface ConversationEntry {
  id: string;
  /** Exact account/session incarnation allowed to read or mutate this entry. */
  owner: ManagedCloudOwner;
  title: string;
  messages: HistoryMessage[];
  savedAt: number;
  routing: ConversationRoutingState;
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
  const normalized = {
    id: entry['id'],
    owner,
    title,
    messages,
    savedAt: entry['savedAt'],
    routing: normalizeRoutingState(entry['routing']),
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
  const appended: HistoryMessage[] = [
    {
      role: 'user',
      content: turn.prompt,
      timestamp: at,
      ...(turn.deliveryId ? { backgroundDeliveryId: turn.deliveryId } : {}),
    },
    {
      role: 'assistant',
      content: answer,
      timestamp: at + 1,
      ...(turn.deliveryId ? { backgroundDeliveryId: turn.deliveryId } : {}),
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
    const messages = normalizeMessages([...retainedMessages, ...appended]).slice(
      -MAX_BACKGROUND_MESSAGES,
    );
    const entry: ConversationEntry = {
      id: conversationId,
      owner: { ...owner },
      title: normalizeConversationTitle(title) ?? deriveTitle(messages),
      messages,
      savedAt: Date.now(),
      routing: normalizeRoutingState(routing),
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

/** Save an independent archived browser conversation. */
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
    const entry: ConversationEntry = existing
      ? {
          ...existing,
          title: deriveTitle(normalizedMessages),
          messages: normalizedMessages,
          savedAt: Date.now(),
          routing: normalizeRoutingState(routing),
        }
      : createConversation(owner, normalizedMessages, routing, conversationId);
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

/** Persist the current Chrome conversation, updating its existing record in place. */
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

export async function deleteConversation(owner: ManagedCloudOwner, id: string): Promise<void> {
  assertManagedCloudOwner(owner);
  await mutateStore(async (store) => {
    const ownsTarget = store.conversations.some(
      (entry) => entry.id === id && sameManagedCloudOwner(entry.owner, owner),
    );
    if (!ownsTarget) return;
    store.conversations = store.conversations.filter(
      (entry) => entry.id !== id || !sameManagedCloudOwner(entry.owner, owner),
    );
    if (store.activeConversationId === id && sameManagedCloudOwner(store.activeOwner, owner)) {
      store.activeConversationId = null;
      store.activeOwner = null;
    }
    await writeStore(store);
  });
}
