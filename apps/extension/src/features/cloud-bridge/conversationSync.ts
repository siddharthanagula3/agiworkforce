import {
  CHAT_SYNC_CONVERSATIONS_SCOPE,
  ChatSyncPullResponseSchema,
  ManagedCloudChatHttpError,
  chatSyncPullPath,
  type ChatSyncPullResponse,
  type ManagedCloudUpdateConversationRequest,
} from '@agiworkforce/cloud-contracts';
import {
  applyConversationDeltas,
  selectNextCursor,
  type ConversationStorePort,
  type SyncConversationRecord,
} from '@agiworkforce/sync';
import {
  blockCloudPersistence,
  claimCloudConversationBinding,
  cloudMessageSyncFingerprint,
  conversationHasUnsavedCloudChanges,
  conversationFlagsNeedSync,
  conversationMetadataNeedsSync,
  conversationProjectNeedsSync,
  deleteConversation,
  getConversation,
  isCloudMetadataPersistenceEligible,
  listConversations,
  listConversationsNeedingCloudSync,
  pendingCloudMessages,
  recordCloudMessagesSynced,
  recordCloudSyncState,
  updateConversationEntry,
  type ConversationEntry,
  type HistoryMessage,
} from '../background/conversation-history';
import { logger } from '../../utils';
import {
  cloudMirroringEnabledSnapshot,
  readCloudMirroringEnabled,
} from '../privacy/cloudMirroring';
import { FREE_TRIAL_GATEWAY, getManagedCloudAuthContext } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';
import { UUID_PATTERN } from '../../lib/uuid';
import {
  captureCloudRefusals,
  classifyCloudRefusal,
  describeCloudRefusal,
  type CloudRefusal,
} from './cloudRefusal';
import {
  buildExtensionCloudMessageMetadata,
  createExtensionCloudChatClient,
  ManagedCloudOwnerChangedError,
  ManagedCloudSignedOutError,
} from './conversationSyncClient';
import {
  managedCloudOwnerKey,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from './managedCloudAuthority';

export const CLOUD_SYNC_TOMBSTONE_KEY = 'agi_cloud_sync_tombstones_v1';
export const SYNC_SWEEP_ALARM = 'agi-conversation-sync-sweep';
export const CONVERSATION_SYNC_CURSOR_KEY = 'agi_cloud_conversation_cursor_v1';

const INITIAL_SYNC_CURSOR = '0';

const SYNC_DEBOUNCE_MS = 2_500;
const MAX_MESSAGES_PER_FLUSH = 25;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_AFTER_RATE_LIMIT_MS = 60_000;
const RETRY_AFTER_SERVER_ERROR_MS = 5 * 60_000;
const MAX_TOMBSTONES = 100;
const FLAG_PULL_MAX_PAGES = 20;
const MAX_USER_SAVE_ROUNDS = 20;

const SIGN_IN_TO_SAVE_MESSAGE = 'Sign in to save chats to your account.';
const SAVE_FAILED_MESSAGE =
  'This chat could not be saved to your account. Try again in a few minutes.';

interface CloudSyncTombstone {
  accountId: string;
  cloudConversationId: string;
  organizationId: string | null;
  queuedAt: number;
  generation?: string;
}

interface ScheduledFlush {
  owner: ManagedCloudOwner;
  conversationId: string;
  timer: ReturnType<typeof setTimeout>;
  streaming: boolean;
}

interface InFlightFlush {
  controller: AbortController;
  done: Promise<void>;
}

const scheduledFlushes = new Map<string, ScheduledFlush>();
const inFlightFlushes = new Map<string, InFlightFlush>();

function flushKey(owner: ManagedCloudOwner, conversationId: string): string {
  return `${managedCloudOwnerKey(owner)}:${conversationId}`;
}

export function scheduleConversationSync(
  owner: ManagedCloudOwner,
  conversationId: string,
  streaming = false,
): void {
  const key = flushKey(owner, conversationId);
  const pending = scheduledFlushes.get(key);
  if (pending) clearTimeout(pending.timer);
  const timer = setTimeout(() => {
    const entry = scheduledFlushes.get(key);
    scheduledFlushes.delete(key);
    void flushConversation(owner, conversationId, entry?.streaming ?? false);
  }, SYNC_DEBOUNCE_MS);
  scheduledFlushes.set(key, { owner: { ...owner }, conversationId, timer, streaming });
}

/**
 * @returns whether the available account still owes mirroring or deletion. The
 *   caller uses it to decide whether the service worker has to be woken again;
 *   a sweep that finds nothing must not keep a periodic alarm alive.
 */
export async function sweepConversationSync(onAuthUnavailable?: () => void): Promise<boolean> {
  try {
    const context = await getManagedCloudAuthContext();
    if (!context) {
      onAuthUnavailable?.();
      return false;
    }
    await drainCloudDeletionTombstones(context.owner);
    const entries = await listConversationsNeedingCloudSync(context.owner);
    for (const entry of entries) {
      await flushConversation(context.owner, entry.id, false);
    }
    // A switch during network work must not keep the old account awake.
    // Unavailable auth (including a failed non-forced lookup) remains dormant.
    const current = await getManagedCloudAuthContext();
    if (!current) {
      onAuthUnavailable?.();
      return false;
    }
    const retained = await withTombstoneStore(readTombstones);
    return (
      retained.some((row) => row.accountId === current.owner.accountId) ||
      (await listConversationsNeedingCloudSync(current.owner)).length > 0
    );
  } catch (error) {
    logger.debug('Conversation sync sweep failed', error);
    return true;
  }
}

export function abortConversationSyncForOwnerChange(): void {
  for (const pending of scheduledFlushes.values()) clearTimeout(pending.timer);
  scheduledFlushes.clear();
  for (const { controller } of inFlightFlushes.values()) {
    try {
      controller.abort();
    } catch {
      // An already-aborted controller is fine.
    }
  }
  inFlightFlushes.clear();
}

export async function ensureCloudConversation(
  owner: ManagedCloudOwner,
  conversationId: string,
): Promise<string | null> {
  const key = flushKey(owner, conversationId);
  const scheduled = scheduledFlushes.get(key);
  if (scheduled) {
    clearTimeout(scheduled.timer);
    scheduledFlushes.delete(key);
  }
  await flushConversation(owner, conversationId);
  let entry = await getConversation(owner, conversationId);
  if (entry?.cloudSync?.createAcknowledged !== true || conversationProjectNeedsSync(entry)) {
    await flushConversation(owner, conversationId);
    entry = await getConversation(owner, conversationId);
  }
  const cloudConversationId = entry?.cloudSync?.conversationId;
  return entry?.cloudSync?.createAcknowledged === true &&
    cloudConversationId &&
    !conversationProjectNeedsSync(entry)
    ? cloudConversationId
    : null;
}

// The completions route saves the answer under the bound conversation the
// moment it finishes and expects the question to be saved already; a debounced
// flush landed the question after a short answer, so web showed them reversed.
export async function flushQuestionBeforeTurn(
  owner: ManagedCloudOwner,
  conversationId: string,
): Promise<void> {
  const key = flushKey(owner, conversationId);
  const scheduled = scheduledFlushes.get(key);
  if (scheduled) {
    clearTimeout(scheduled.timer);
    scheduledFlushes.delete(key);
  }
  await inFlightFlushes.get(key)?.done;
  await flushConversation(owner, conversationId, true);
}

export type UserConversationSave =
  { status: 'saved' } | { status: 'not-saved'; reason?: string } | { status: 'mirroring-off' };

function hasOutstandingCloudWork(entry: ConversationEntry): boolean {
  return (
    pendingCloudMessages(entry).length > 0 ||
    conversationMetadataNeedsSync(entry) ||
    entry.cloudSync?.createAcknowledged !== true
  );
}

export async function saveConversationNow(
  owner: ManagedCloudOwner,
  conversationId: string,
): Promise<UserConversationSave> {
  const key = flushKey(owner, conversationId);
  const scheduled = scheduledFlushes.get(key);
  if (scheduled) {
    clearTimeout(scheduled.timer);
    scheduledFlushes.delete(key);
  }
  await inFlightFlushes.get(key)?.done;
  if (!(await readCloudMirroringEnabled())) return { status: 'mirroring-off' };
  const initial = await getConversation(owner, conversationId);
  if (!initial) return { status: 'not-saved' };
  if (initial.cloudSync?.retryAfter !== undefined) {
    await recordCloudSyncState(owner, conversationId, { retryAfter: undefined });
  }
  let pendingBefore = Number.POSITIVE_INFINITY;
  for (let round = 0; round < MAX_USER_SAVE_ROUNDS; round += 1) {
    await flushConversation(owner, conversationId);
    const entry = await getConversation(owner, conversationId);
    if (!entry) return { status: 'not-saved' };
    const sync = entry.cloudSync;
    if (sync?.state === 'blocked' || sync?.state === 'error') {
      return { status: 'not-saved', ...(sync.lastError ? { reason: sync.lastError } : {}) };
    }
    if (!hasOutstandingCloudWork(entry)) {
      if (conversationHasUnsavedCloudChanges(entry)) {
        await recordCloudSyncState(owner, conversationId, {
          state: 'idle',
          lastError: undefined,
          retryAfter: undefined,
        });
      }
      return { status: 'saved' };
    }
    const pendingAfter = pendingCloudMessages(entry).length;
    if (pendingAfter >= pendingBefore) return { status: 'not-saved' };
    pendingBefore = pendingAfter;
  }
  return { status: 'not-saved' };
}

function combineTimeoutSignal(controller: AbortController): AbortSignal {
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

export function flushConversation(
  owner: ManagedCloudOwner,
  conversationId: string,
  streaming = false,
): Promise<void> {
  const key = flushKey(owner, conversationId);
  const running = inFlightFlushes.get(key);
  if (running) return running.done;

  const controller = new AbortController();
  const done = runConversationFlush(owner, conversationId, streaming, controller).finally(() => {
    if (inFlightFlushes.get(key)?.controller === controller) inFlightFlushes.delete(key);
    controller.abort();
  });
  inFlightFlushes.set(key, { controller, done });
  return done;
}

async function runConversationFlush(
  owner: ManagedCloudOwner,
  conversationId: string,
  streaming: boolean,
  controller: AbortController,
): Promise<void> {
  try {
    if (!(await readCloudMirroringEnabled())) return;
    const context = await getManagedCloudAuthContext();
    if (!context) {
      await recordCloudSyncState(owner, conversationId, {
        state: 'blocked',
        blockedReason: 'auth',
        lastError: SIGN_IN_TO_SAVE_MESSAGE,
        lastAttemptAt: Date.now(),
      });
      return;
    }
    if (!sameManagedCloudOwner(context.owner, owner)) return;

    const entry = await getConversation(owner, conversationId);
    if (!entry) return;

    if (!isCloudMetadataPersistenceEligible(entry)) {
      await blockCloudPersistence(owner, conversationId, 'non-cloud-runtime');
      return;
    }
    const now = Date.now();
    if (entry.cloudSync?.retryAfter !== undefined && entry.cloudSync.retryAfter > now) return;
    if (
      entry.cloudSync?.blockedReason === 'not-found' ||
      entry.cloudSync?.blockedReason === 'workspace'
    ) {
      return;
    }

    await flushEligibleConversation(owner, entry, streaming, combineTimeoutSignal(controller));
  } catch (error) {
    logger.debug('Conversation cloud sync failed', error);
  }
}

function selectFlushableMessages(entry: ConversationEntry, streaming: boolean): HistoryMessage[] {
  const pending = pendingCloudMessages(entry);
  if (pending.length === 0) return [];
  const last = entry.messages[entry.messages.length - 1];
  const bounded =
    streaming && last !== undefined
      ? pending.filter((message) => message !== last)
      : pending.slice();
  return bounded.slice(0, MAX_MESSAGES_PER_FLUSH);
}

async function flushEligibleConversation(
  owner: ManagedCloudOwner,
  candidate: ConversationEntry,
  streaming: boolean,
  signal: AbortSignal,
): Promise<void> {
  const conversationId = candidate.id;
  const needsMetadataUpdate = conversationMetadataNeedsSync(candidate);
  const needsWorkspaceRecovery =
    candidate.cloudSync?.conversationId !== undefined &&
    (candidate.cloudSync.organizationId === undefined ||
      candidate.cloudSync.createAcknowledged !== true);
  if (
    selectFlushableMessages(candidate, streaming).length === 0 &&
    !needsMetadataUpdate &&
    !needsWorkspaceRecovery
  ) {
    return;
  }

  const entry = await claimCloudConversationBinding(owner, conversationId, () =>
    crypto.randomUUID(),
  );
  const cloudConversationId = entry?.cloudSync?.conversationId;
  if (!entry || !cloudConversationId) return;

  const refusals = captureCloudRefusals();
  const client = createExtensionCloudChatClient(owner, {
    isCurrent: cloudMirroringEnabledSnapshot,
    fetchImpl: refusals.fetch,
  });
  let organizationId = entry.cloudSync?.organizationId;
  // `entry` predates the create, so re-reading it would make an accepted project look unsynced.
  let syncedProjectId = entry.cloudSync?.syncedProjectId ?? null;
  const createAcknowledged = entry.cloudSync?.createAcknowledged;

  if (createAcknowledged === false) {
    try {
      const created = await client.createConversation(
        {
          id: cloudConversationId,
          title: entry.title,
          ...(entry.routing.currentModelKey && entry.routing.currentModelKey !== 'auto'
            ? { model: entry.routing.currentModelKey }
            : {}),
          ...(entry.projectId ? { projectId: entry.projectId } : {}),
        },
        { signal },
      );
      if (created.organizationId === undefined) {
        await recordCloudSyncState(owner, conversationId, {
          state: 'blocked',
          blockedReason: 'workspace',
          createAcknowledged: true,
          lastError: 'Cloud workspace binding was not returned; no longer syncing.',
          lastAttemptAt: Date.now(),
        });
        return;
      }
      organizationId = created.organizationId;
      syncedProjectId = created.projectId;
      await recordCloudSyncState(owner, conversationId, {
        state: 'pending',
        createAcknowledged: true,
        organizationId,
        syncedProjectId,
        syncedPinned: created.pinned,
        syncedStarred: created.starred,
        syncedArchived: created.archived,
        lastAttemptAt: Date.now(),
      });
    } catch (error) {
      await handleFlushError(owner, conversationId, error, refusals.last);
      return;
    }
  } else if (createAcknowledged !== true) {
    if (organizationId !== undefined) {
      await recordCloudSyncState(owner, conversationId, {
        state: 'pending',
        createAcknowledged: true,
        lastAttemptAt: Date.now(),
      });
    } else {
      try {
        const recovered = await client.getConversation(
          cloudConversationId,
          { limit: 1, offset: 0 },
          { signal },
        );
        if (recovered.conversation.organizationId === undefined) {
          throw new Error('Cloud workspace binding is unavailable from this server.');
        }
        organizationId = recovered.conversation.organizationId;
        await recordCloudSyncState(owner, conversationId, {
          state: 'pending',
          createAcknowledged: true,
          organizationId,
          lastAttemptAt: Date.now(),
        });
      } catch (error) {
        const status = error instanceof ManagedCloudChatHttpError ? error.status : null;
        if (status === 404) {
          await recordCloudSyncState(owner, conversationId, {
            state: 'blocked',
            blockedReason: 'workspace',
            lastError: 'Original cloud workspace could not be proven; no longer syncing.',
            lastAttemptAt: Date.now(),
          });
        } else if (
          error instanceof Error &&
          /workspace binding is unavailable/i.test(error.message)
        ) {
          await recordCloudSyncState(owner, conversationId, {
            state: 'blocked',
            blockedReason: 'workspace',
            lastError: error.message,
            lastAttemptAt: Date.now(),
          });
        } else {
          await handleFlushError(owner, conversationId, error, refusals.last);
        }
        return;
      }
    }
  }

  if (organizationId === undefined) {
    await recordCloudSyncState(owner, conversationId, {
      state: 'blocked',
      blockedReason: 'workspace',
      lastError: 'Cloud workspace binding is unavailable; no longer syncing.',
      lastAttemptAt: Date.now(),
    });
    return;
  }

  const messages = selectFlushableMessages(entry, streaming);
  for (const message of messages) {
    if (signal.aborted) return;
    const cloudMessageId = message.cloudMessageId;
    if (!cloudMessageId || !UUID_PATTERN.test(cloudMessageId)) continue;
    const syncedChars = message.content.length;
    const syncedFingerprint = cloudMessageSyncFingerprint(message);
    try {
      await client.saveMessage(
        cloudConversationId,
        {
          id: cloudMessageId,
          role: message.role,
          content: message.content,
          metadata: buildExtensionCloudMessageMetadata({
            localConversationId: conversationId,
            runtime: 'managed-cloud',
            ...(message.error
              ? { error: true, ...(message.errorText ? { errorText: message.errorText } : {}) }
              : {}),
            ...(message.role === 'user' && message.attachments
              ? { attachments: message.attachments }
              : {}),
            ...(message.managedQuickMode ? { managedQuickMode: true } : {}),
            ...(message.role === 'assistant' && message.agiWorkPlanDeclined
              ? { agiWorkPlanDeclined: true }
              : {}),
            ...(message.cloudAgentRun?.runId
              ? { cloudAgentRunId: message.cloudAgentRun.runId }
              : {}),
            ...(message.role === 'assistant' && message.model ? { model: message.model } : {}),
            ...(message.role === 'assistant' && message.provider
              ? { provider: message.provider }
              : {}),
            ...(message.role === 'assistant' && message.generatedFiles
              ? { generatedFiles: message.generatedFiles }
              : {}),
            ...(message.role === 'assistant' && message.interactiveCards
              ? { interactiveCards: message.interactiveCards }
              : {}),
          }),
          ...(message.role === 'assistant' && message.model ? { model: message.model } : {}),
        },
        { signal, organizationId, retryRateLimited: false },
      );
    } catch (error) {
      await handleFlushError(owner, conversationId, error, refusals.last);
      return;
    }
    await recordCloudMessagesSynced(owner, conversationId, [
      { cloudMessageId, syncedChars, syncedFingerprint },
    ]).catch(() => undefined);
  }

  const metadataEntry = await getConversation(owner, conversationId);
  if (!metadataEntry) return;
  const metadata: ManagedCloudUpdateConversationRequest = {
    ...(metadataEntry.title !== metadataEntry.cloudSync?.syncedTitle
      ? { title: metadataEntry.title }
      : {}),
    ...((metadataEntry.projectId ?? null) !== syncedProjectId
      ? { projectId: metadataEntry.projectId ?? null }
      : {}),
    ...(metadataEntry.pinned !== undefined &&
    metadataEntry.pinned !== metadataEntry.cloudSync?.syncedPinned
      ? { pinned: metadataEntry.pinned }
      : {}),
    ...(metadataEntry.starred !== undefined &&
    metadataEntry.starred !== metadataEntry.cloudSync?.syncedStarred
      ? { starred: metadataEntry.starred }
      : {}),
    ...(metadataEntry.archived !== undefined &&
    metadataEntry.archived !== metadataEntry.cloudSync?.syncedArchived
      ? { archived: metadataEntry.archived }
      : {}),
  };
  if (Object.keys(metadata).length > 0) {
    try {
      const updated = await client.updateConversation(cloudConversationId, metadata, {
        signal,
        organizationId,
      });
      await recordCloudSyncState(owner, conversationId, {
        state: 'idle',
        syncedTitle: updated.title,
        syncedProjectId: updated.projectId,
        syncedPinned: updated.pinned,
        syncedStarred: updated.starred,
        syncedArchived: updated.archived,
        blockedReason: undefined,
        lastError: undefined,
        retryAfter: undefined,
      });
    } catch (error) {
      await handleFlushError(owner, conversationId, error, refusals.last);
      return;
    }
  }
}

const SYNC_REFUSAL_COPY = {
  refused: 'This account cannot save chats from the Chrome extension.',
  unavailable: 'Saving to your account is temporarily unavailable.',
  limitUnit: 'requests',
};

function syncRefusal(error: unknown, captured: CloudRefusal | null): CloudRefusal | null {
  if (!(error instanceof ManagedCloudChatHttpError)) return null;
  if (captured?.status === error.status) return captured;
  return classifyCloudRefusal(error.status, {
    error: {
      ...(error.code ? { code: error.code } : {}),
      message: error.message.replace(/^HTTP \d{3}: /u, ''),
    },
  });
}

async function handleFlushError(
  owner: ManagedCloudOwner,
  conversationId: string,
  error: unknown,
  captured: CloudRefusal | null = null,
): Promise<void> {
  if (error instanceof ManagedCloudOwnerChangedError) return;

  const now = Date.now();
  if (error instanceof ManagedCloudSignedOutError) {
    await recordCloudSyncState(owner, conversationId, {
      state: 'blocked',
      blockedReason: 'auth',
      lastError: SIGN_IN_TO_SAVE_MESSAGE,
      lastAttemptAt: now,
    });
    return;
  }

  const refusal = syncRefusal(error, captured);

  if (refusal?.kind === 'auth') {
    await recordCloudSyncState(owner, conversationId, {
      state: 'blocked',
      blockedReason: 'auth',
      lastError: SIGN_IN_TO_SAVE_MESSAGE,
      lastAttemptAt: now,
    });
    return;
  }

  if (
    refusal?.kind === 'policy' ||
    refusal?.kind === 'plan' ||
    refusal?.kind === 'account' ||
    refusal?.kind === 'refused'
  ) {
    await recordCloudSyncState(owner, conversationId, {
      state: 'blocked',
      blockedReason: 'policy',
      lastError: describeCloudRefusal(refusal, SYNC_REFUSAL_COPY),
      lastAttemptAt: now,
      retryAfter: now + RETRY_AFTER_SERVER_ERROR_MS,
    });
    return;
  }

  if (refusal?.kind === 'unavailable' || refusal?.kind === 'rate_limited') {
    const fallbackMs =
      refusal.kind === 'rate_limited' ? RETRY_AFTER_RATE_LIMIT_MS : RETRY_AFTER_SERVER_ERROR_MS;
    await recordCloudSyncState(owner, conversationId, {
      state: 'error',
      lastError: describeCloudRefusal(refusal, SYNC_REFUSAL_COPY),
      lastAttemptAt: now,
      retryAfter:
        now +
        (refusal.retryAfterSeconds !== undefined ? refusal.retryAfterSeconds * 1000 : fallbackMs),
    });
    return;
  }

  if (refusal?.status === 404) {
    await recordCloudSyncState(owner, conversationId, {
      state: 'blocked',
      blockedReason: 'not-found',
      lastError: 'Removed from Cloud, no longer syncing.',
      lastAttemptAt: now,
    });
    return;
  }

  logger.debug('Conversation cloud save failed', error);
  await recordCloudSyncState(owner, conversationId, {
    state: 'error',
    lastError: SAVE_FAILED_MESSAGE,
    lastAttemptAt: now,
    retryAfter: now + RETRY_AFTER_SERVER_ERROR_MS,
  });
}

// Production tombstone writers are background message/sweep handlers. This tail
// serializes their storage operations, not unrelated extension contexts. Network
// requests deliberately run outside it so a slow deletion cannot block enqueue.
let tombstoneMutationTail: Promise<void> = Promise.resolve();

function withTombstoneStore<T>(operation: () => Promise<T>): Promise<T> {
  const result = tombstoneMutationTail.then(operation);
  tombstoneMutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readTombstones(): Promise<CloudSyncTombstone[]> {
  const stored = await chrome.storage.local.get([CLOUD_SYNC_TOMBSTONE_KEY]);
  const raw = stored[CLOUD_SYNC_TOMBSTONE_KEY];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('Invalid cloud deletion queue');
  const records: CloudSyncTombstone[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('Invalid cloud deletion record');
    }
    const record = candidate as Record<string, unknown>;
    const accountId = record['accountId'];
    const cloudConversationId = record['cloudConversationId'];
    const organizationId = record['organizationId'];
    const queuedAt = record['queuedAt'];
    const generation = record['generation'];
    if (
      typeof accountId !== 'string' ||
      accountId.length === 0 ||
      typeof cloudConversationId !== 'string' ||
      !UUID_PATTERN.test(cloudConversationId) ||
      (organizationId !== null &&
        (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId))) ||
      typeof queuedAt !== 'number' ||
      !Number.isFinite(queuedAt) ||
      queuedAt < 0 ||
      (generation !== undefined &&
        (typeof generation !== 'string' || !UUID_PATTERN.test(generation)))
    ) {
      // Do not rewrite a partially understood queue and discard its other rows.
      throw new Error('Invalid cloud deletion record');
    }
    records.push({
      ...record,
      accountId,
      cloudConversationId,
      organizationId,
      queuedAt,
      ...(generation === undefined ? {} : { generation }),
    });
  }
  return records;
}

function sameTombstoneGeneration(left: CloudSyncTombstone, right: CloudSyncTombstone): boolean {
  return (
    left.accountId === right.accountId &&
    left.cloudConversationId === right.cloudConversationId &&
    left.organizationId === right.organizationId &&
    left.generation === right.generation &&
    (left.generation !== undefined || left.queuedAt === right.queuedAt)
  );
}

async function readConversationCursor(owner: ManagedCloudOwner): Promise<string> {
  const stored = await chrome.storage.local.get([CONVERSATION_SYNC_CURSOR_KEY]);
  const cursors = stored[CONVERSATION_SYNC_CURSOR_KEY] as Record<string, unknown> | undefined;
  const value = cursors?.[owner.accountId];
  return typeof value === 'string' && /^\d+$/.test(value) ? value : INITIAL_SYNC_CURSOR;
}

async function writeConversationCursor(owner: ManagedCloudOwner, cursor: string): Promise<void> {
  const stored = await chrome.storage.local.get([CONVERSATION_SYNC_CURSOR_KEY]);
  const cursors =
    (stored[CONVERSATION_SYNC_CURSOR_KEY] as Record<string, unknown> | undefined) ?? {};
  await chrome.storage.local.set({
    [CONVERSATION_SYNC_CURSOR_KEY]: { ...cursors, [owner.accountId]: cursor },
  });
}

async function pullConversationDeltas(
  owner: ManagedCloudOwner,
  since: string,
): Promise<ChatSyncPullResponse> {
  const context = await getManagedCloudAuthContext();
  if (!context) throw new ManagedCloudSignedOutError();
  if (!sameManagedCloudOwner(context.owner, owner)) throw new ManagedCloudOwnerChangedError();
  const response = await fetch(
    `${FREE_TRIAL_GATEWAY}${chatSyncPullPath(since, CHAT_SYNC_CONVERSATIONS_SCOPE)}`,
    {
      headers: {
        Authorization: `Bearer ${context.token}`,
        'X-Requested-With': 'XMLHttpRequest',
        ...platformRequestHeaders(),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok)
    throw new Error(`Reading account chat changes failed (HTTP ${response.status}).`);
  return ChatSyncPullResponseSchema.parse(await response.json());
}

function toSyncRecord(cloudId: string, entry: ConversationEntry): SyncConversationRecord {
  const savedAt = new Date(entry.savedAt).toISOString();
  return {
    id: cloudId,
    title: entry.customTitle ?? entry.title,
    createdAt: savedAt,
    updatedAt: savedAt,
    messageCount: entry.messages.length,
    pinned: entry.pinned === true,
    archived: entry.archived === true,
  };
}

export async function pullCloudConversationFlags(owner: ManagedCloudOwner): Promise<boolean> {
  const bound = new Map<string, ConversationEntry[]>();
  for (const entry of await listConversations(owner)) {
    const cloudId = entry.cloudSync?.conversationId;
    if (cloudId && entry.cloudSync?.createAcknowledged === true)
      bound.set(cloudId, [...(bound.get(cloudId) ?? []), entry]);
  }
  const flags = new Map<string, { pinned: boolean; archived: boolean }>();
  const deleted = new Set<string>();
  const port: ConversationStorePort = {
    get: (cloudId) => {
      const entry = bound.get(cloudId)?.[0];
      return entry ? toSyncRecord(cloudId, entry) : undefined;
    },
    insert: () => {},
    patch: (cloudId, record) => {
      flags.set(cloudId, { pinned: record.pinned === true, archived: record.archived === true });
    },
    remove: (cloudId) => {
      if (bound.has(cloudId)) deleted.add(cloudId);
    },
  };

  let cursor = await readConversationCursor(owner);
  for (let page = 0; page < FLAG_PULL_MAX_PAGES; page += 1) {
    const result = await pullConversationDeltas(owner, cursor);
    applyConversationDeltas(port, result.conversations, []);
    const next = selectNextCursor(cursor, result.cursor);
    const advanced = next !== cursor;
    cursor = next;
    if (!result.hasMore || !advanced) break;
  }

  let changed = false;
  for (const cloudId of deleted) {
    for (const entry of bound.get(cloudId) ?? []) {
      await deleteConversation(owner, entry.id);
      changed = true;
    }
    flags.delete(cloudId);
  }
  for (const [cloudId, conversation] of flags) {
    for (const entry of bound.get(cloudId) ?? []) {
      if (conversationFlagsNeedSync(entry)) continue;
      if (
        (entry.pinned === true) !== conversation.pinned ||
        (entry.archived === true) !== conversation.archived
      ) {
        await updateConversationEntry(owner, entry.id, conversation);
        changed = true;
      }
      if (
        entry.cloudSync?.syncedPinned !== conversation.pinned ||
        entry.cloudSync?.syncedArchived !== conversation.archived
      ) {
        await recordCloudSyncState(owner, entry.id, {
          syncedPinned: conversation.pinned,
          syncedArchived: conversation.archived,
        });
      }
    }
  }
  await writeConversationCursor(owner, cursor);
  return changed;
}

export async function queueCloudConversationDeletion(
  owner: ManagedCloudOwner,
  cloudConversationId: string,
  organizationId: string | null,
): Promise<boolean> {
  if (
    typeof cloudConversationId !== 'string' ||
    !UUID_PATTERN.test(cloudConversationId) ||
    (organizationId !== null &&
      (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)))
  ) {
    return false;
  }
  try {
    const queued = await withTombstoneStore(async () => {
      const existing = await readTombstones();
      const existingIndex = existing.findIndex(
        (candidate) =>
          candidate.accountId === owner.accountId &&
          candidate.cloudConversationId === cloudConversationId,
      );
      if (existingIndex < 0 && existing.length >= MAX_TOMBSTONES) {
        return false;
      }
      const next = existing.slice();
      const tombstone: CloudSyncTombstone = {
        accountId: owner.accountId,
        cloudConversationId,
        organizationId,
        queuedAt: Date.now(),
        generation: crypto.randomUUID(),
      };
      if (existingIndex >= 0) next[existingIndex] = tombstone;
      else next.push(tombstone);
      await chrome.storage.local.set({ [CLOUD_SYNC_TOMBSTONE_KEY]: next });
      return true;
    });
    if (!queued) return false;
  } catch (error) {
    logger.debug('Failed to queue cloud conversation deletion', error);
    return false;
  }
  void drainCloudDeletionTombstones(owner).catch((error) => {
    logger.debug('Failed to read cloud deletion queue for draining', error);
  });
  return true;
}

export async function drainCloudDeletionTombstones(owner: ManagedCloudOwner): Promise<void> {
  const tombstones = await withTombstoneStore(readTombstones);
  const mine = tombstones.filter((candidate) => candidate.accountId === owner.accountId);
  if (mine.length === 0) return;

  const client = createExtensionCloudChatClient(owner);
  const settled: CloudSyncTombstone[] = [];
  for (const tombstone of mine) {
    const controller = new AbortController();
    try {
      await client.deleteConversation(tombstone.cloudConversationId, {
        signal: combineTimeoutSignal(controller),
        organizationId: tombstone.organizationId,
      });
      settled.push(tombstone);
    } catch (error) {
      if (error instanceof ManagedCloudChatHttpError && error.status === 404) {
        settled.push(tombstone);
        continue;
      }
      if (error instanceof ManagedCloudOwnerChangedError) return;
      logger.debug('Cloud conversation deletion failed; will retry on the next sweep', error);
      break;
    } finally {
      controller.abort();
    }
  }
  if (settled.length === 0) return;
  try {
    await withTombstoneStore(async () => {
      const remaining = (await readTombstones()).filter(
        (candidate) => !settled.some((attempted) => sameTombstoneGeneration(candidate, attempted)),
      );
      await chrome.storage.local.set({ [CLOUD_SYNC_TOMBSTONE_KEY]: remaining });
    });
  } catch (error) {
    logger.debug('Failed to clear drained cloud sync tombstones', error);
  }
}
