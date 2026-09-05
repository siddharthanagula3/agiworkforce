import { ManagedCloudChatHttpError } from '@agiworkforce/cloud-contracts';
import {
  blockCloudPersistence,
  claimCloudConversationBinding,
  cloudMessageSyncFingerprint,
  getConversation,
  isCloudPersistenceEligible,
  listConversationsNeedingCloudSync,
  pendingCloudMessages,
  recordCloudMessagesSynced,
  recordCloudSyncState,
  type ConversationEntry,
  type HistoryMessage,
} from '../background/conversation-history';
import { logger } from '../../utils';
import { readCloudMirroringEnabled } from '../privacy/cloudMirroring';
import { getManagedCloudAuthContext } from './freeTrialClient';
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

const SYNC_DEBOUNCE_MS = 2_500;
const MAX_MESSAGES_PER_FLUSH = 25;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_AFTER_RATE_LIMIT_MS = 60_000;
const RETRY_AFTER_SERVER_ERROR_MS = 5 * 60_000;
const MAX_TOMBSTONES = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CloudSyncTombstone {
  accountId: string;
  cloudConversationId: string;
  organizationId?: string | null;
  queuedAt: number;
}

interface ScheduledFlush {
  owner: ManagedCloudOwner;
  conversationId: string;
  timer: ReturnType<typeof setTimeout>;
  streaming: boolean;
}

const scheduledFlushes = new Map<string, ScheduledFlush>();
const inFlightFlushes = new Map<string, AbortController>();

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
 * @returns whether any conversation still needs mirroring after the pass. The
 *   caller uses it to decide whether the service worker has to be woken again;
 *   a sweep that finds nothing must not keep a periodic alarm alive.
 */
export async function sweepConversationSync(): Promise<boolean> {
  try {
    const context = await getManagedCloudAuthContext();
    if (!context) return false;
    await drainCloudDeletionTombstones(context.owner);
    const entries = await listConversationsNeedingCloudSync(context.owner);
    for (const entry of entries) {
      await flushConversation(context.owner, entry.id, false);
    }
    return (await listConversationsNeedingCloudSync(context.owner)).length > 0;
  } catch (error) {
    logger.debug('Conversation sync sweep failed', error);
    return true;
  }
}

export function abortConversationSyncForOwnerChange(): void {
  for (const pending of scheduledFlushes.values()) clearTimeout(pending.timer);
  scheduledFlushes.clear();
  for (const controller of inFlightFlushes.values()) {
    try {
      controller.abort();
    } catch {
      // An already-aborted controller is fine.
    }
  }
  inFlightFlushes.clear();
}

function combineTimeoutSignal(controller: AbortController): AbortSignal {
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

export async function flushConversation(
  owner: ManagedCloudOwner,
  conversationId: string,
  streaming = false,
): Promise<void> {
  const key = flushKey(owner, conversationId);
  if (inFlightFlushes.has(key)) return;
  if (!(await readCloudMirroringEnabled())) return;

  const controller = new AbortController();
  inFlightFlushes.set(key, controller);
  try {
    const context = await getManagedCloudAuthContext();
    if (!context) {
      await recordCloudSyncState(owner, conversationId, {
        state: 'blocked',
        blockedReason: 'auth',
        lastError: 'Sign in to save chats to your account.',
        lastAttemptAt: Date.now(),
      });
      return;
    }
    if (!sameManagedCloudOwner(context.owner, owner)) return;

    const entry = await getConversation(owner, conversationId);
    if (!entry) return;

    if (!isCloudPersistenceEligible(entry)) {
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
  } finally {
    inFlightFlushes.delete(key);
    controller.abort();
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
  const needsTitleUpdate =
    candidate.cloudSync?.conversationId !== undefined &&
    candidate.cloudSync.syncedTitle !== candidate.title;
  const needsWorkspaceRecovery =
    candidate.cloudSync?.conversationId !== undefined &&
    (candidate.cloudSync.organizationId === undefined ||
      candidate.cloudSync.createAcknowledged !== true);
  if (
    selectFlushableMessages(candidate, streaming).length === 0 &&
    !needsTitleUpdate &&
    !needsWorkspaceRecovery
  ) {
    return;
  }

  const entry = await claimCloudConversationBinding(owner, conversationId, () =>
    crypto.randomUUID(),
  );
  const cloudConversationId = entry?.cloudSync?.conversationId;
  if (!entry || !cloudConversationId) return;

  const client = createExtensionCloudChatClient(owner);
  let organizationId = entry.cloudSync?.organizationId;
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
      await recordCloudSyncState(owner, conversationId, {
        state: 'pending',
        createAcknowledged: true,
        organizationId,
        lastAttemptAt: Date.now(),
      });
    } catch (error) {
      await handleFlushError(owner, conversationId, error);
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
          await handleFlushError(owner, conversationId, error);
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
            ...(message.error ? { error: true } : {}),
            ...(message.managedQuickMode ? { managedQuickMode: true } : {}),
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
      await handleFlushError(owner, conversationId, error);
      return;
    }
    await recordCloudMessagesSynced(owner, conversationId, [
      { cloudMessageId, syncedChars, syncedFingerprint },
    ]).catch(() => undefined);
  }

  if (entry.title !== entry.cloudSync?.syncedTitle && messages.length > 0) {
    try {
      await client.updateConversation(
        cloudConversationId,
        { title: entry.title },
        { signal, organizationId },
      );
      await recordCloudMessagesSynced(owner, conversationId, [], entry.title).catch(
        () => undefined,
      );
    } catch (error) {
      await handleFlushError(owner, conversationId, error);
    }
  }
}

async function handleFlushError(
  owner: ManagedCloudOwner,
  conversationId: string,
  error: unknown,
): Promise<void> {
  if (error instanceof ManagedCloudOwnerChangedError) return;

  const now = Date.now();
  if (error instanceof ManagedCloudSignedOutError) {
    await recordCloudSyncState(owner, conversationId, {
      state: 'blocked',
      blockedReason: 'auth',
      lastError: 'Sign in to save chats to your account.',
      lastAttemptAt: now,
    });
    return;
  }

  const status = error instanceof ManagedCloudChatHttpError ? error.status : null;
  const message = error instanceof Error ? error.message : 'Cloud sync failed.';

  if (status === 401 || status === 403) {
    await recordCloudSyncState(owner, conversationId, {
      state: 'blocked',
      blockedReason: 'auth',
      lastError: message,
      lastAttemptAt: now,
    });
    return;
  }

  if (status === 429) {
    await recordCloudSyncState(owner, conversationId, {
      state: 'error',
      lastError: message,
      lastAttemptAt: now,
      retryAfter: now + RETRY_AFTER_RATE_LIMIT_MS,
    });
    return;
  }

  if (status === 404) {
    await recordCloudSyncState(owner, conversationId, {
      state: 'blocked',
      blockedReason: 'not-found',
      lastError: 'Removed from Cloud, no longer syncing.',
      lastAttemptAt: now,
    });
    return;
  }

  await recordCloudSyncState(owner, conversationId, {
    state: 'error',
    lastError: message,
    lastAttemptAt: now,
    retryAfter: now + RETRY_AFTER_SERVER_ERROR_MS,
  });
}

async function readTombstones(): Promise<CloudSyncTombstone[]> {
  try {
    const stored = await chrome.storage.local.get([CLOUD_SYNC_TOMBSTONE_KEY]);
    const raw = stored[CLOUD_SYNC_TOMBSTONE_KEY];
    if (!Array.isArray(raw)) return [];
    const records: CloudSyncTombstone[] = [];
    for (const candidate of raw) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
      const record = candidate as Record<string, unknown>;
      const accountId = record['accountId'];
      const cloudConversationId = record['cloudConversationId'];
      const rawOrganizationId = record['organizationId'];
      const queuedAt = record['queuedAt'];
      if (typeof accountId !== 'string' || accountId.length === 0) continue;
      if (typeof cloudConversationId !== 'string' || !UUID_PATTERN.test(cloudConversationId)) {
        continue;
      }
      if (
        rawOrganizationId !== undefined &&
        rawOrganizationId !== null &&
        (typeof rawOrganizationId !== 'string' || !UUID_PATTERN.test(rawOrganizationId))
      ) {
        continue;
      }
      if (typeof queuedAt !== 'number' || !Number.isFinite(queuedAt) || queuedAt < 0) continue;
      records.push({
        accountId,
        cloudConversationId,
        ...(rawOrganizationId !== undefined ? { organizationId: rawOrganizationId } : {}),
        queuedAt,
      });
    }
    return records;
  } catch (error) {
    logger.debug('Failed to read cloud sync tombstones', error);
    return [];
  }
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
    };
    if (existingIndex >= 0) next[existingIndex] = tombstone;
    else next.push(tombstone);
    await chrome.storage.local.set({ [CLOUD_SYNC_TOMBSTONE_KEY]: next });
  } catch (error) {
    logger.debug('Failed to queue cloud conversation deletion', error);
    return false;
  }
  void drainCloudDeletionTombstones(owner);
  return true;
}

export async function drainCloudDeletionTombstones(owner: ManagedCloudOwner): Promise<void> {
  const tombstones = await readTombstones();
  const mine = tombstones.filter((candidate) => candidate.accountId === owner.accountId);
  if (mine.length === 0) return;

  const client = createExtensionCloudChatClient(owner);
  const settled = new Set<string>();
  for (const tombstone of mine) {
    if (tombstone.organizationId === undefined) {
      logger.debug('Legacy cloud deletion is waiting for a proven workspace binding');
      continue;
    }
    const controller = new AbortController();
    try {
      await client.deleteConversation(tombstone.cloudConversationId, {
        signal: combineTimeoutSignal(controller),
        organizationId: tombstone.organizationId,
      });
      settled.add(tombstone.cloudConversationId);
    } catch (error) {
      if (error instanceof ManagedCloudChatHttpError && error.status === 404) {
        settled.add(tombstone.cloudConversationId);
        continue;
      }
      if (error instanceof ManagedCloudOwnerChangedError) return;
      logger.debug('Cloud conversation deletion failed; will retry on the next sweep', error);
      break;
    } finally {
      controller.abort();
    }
  }
  if (settled.size === 0) return;
  try {
    const remaining = (await readTombstones()).filter(
      (candidate) =>
        candidate.accountId !== owner.accountId || !settled.has(candidate.cloudConversationId),
    );
    await chrome.storage.local.set({ [CLOUD_SYNC_TOMBSTONE_KEY]: remaining });
  } catch (error) {
    logger.debug('Failed to clear drained cloud sync tombstones', error);
  }
}
