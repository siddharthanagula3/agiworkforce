/**
 * Account-backed conversation mirroring — orchestrator.
 *
 * Shape of the feature, so the rules below read as consequences rather than
 * arbitrary choices:
 *
 *   • `chrome.storage.local` stays authoritative. The account copy is a
 *     one-way, append-only REPLICA. Server transcript data is never applied to
 *     Chrome, which is what lets the feature exist without a merge/conflict
 *     policy. A legacy binding may perform one active-workspace-scoped detail
 *     read solely to recover `organization_id`; returned messages are discarded.
 *   • Provenance gates persistence. A thread is mirrored only when EVERY turn
 *     in it was inferred in Managed Cloud, and the disqualification is sticky.
 *   • Eligible signed-in Chrome chats are mirrored automatically so they are
 *     available in the shared Web/Mobile/Desktop Cloud conversation history.
 *   • Cloud persistence can never break local chat. Nothing on the chat path
 *     awaits anything in this file; the only coupling is a fire-and-forget
 *     `chrome.runtime.sendMessage` nudge from the panel plus a sweep alarm.
 *
 * SERVICE WORKER ONLY. The side panel must never import this module — see the
 * CORS note in `conversationSyncClient.ts`.
 */
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

/** Durable cloud-DELETE queue, so a user deletion survives a failed attempt. */
export const CLOUD_SYNC_TOMBSTONE_KEY = 'agi_cloud_sync_tombstones_v1';
/** Sweep alarm name. Registered by `background.ts`. */
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
  /** Missing only on legacy tombstones, which fail closed and remain queued. */
  organizationId?: string | null;
  queuedAt: number;
}

interface ScheduledFlush {
  owner: ManagedCloudOwner;
  conversationId: string;
  timer: ReturnType<typeof setTimeout>;
  /** Last known "a stream is writing into this thread right now" signal. */
  streaming: boolean;
}

const scheduledFlushes = new Map<string, ScheduledFlush>();
const inFlightFlushes = new Map<string, AbortController>();

function flushKey(owner: ManagedCloudOwner, conversationId: string): string {
  return `${managedCloudOwnerKey(owner)}:${conversationId}`;
}

// ─── Scheduling ────────────────────────────────────────────────────────────

/**
 * Debounced nudge. Safe to call on every persist: the side panel calls
 * `saveMessages()` per display-safe agent event and per routing update, so a
 * single streamed turn produces dozens of calls that must collapse into one
 * flush per conversation.
 */
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
 * Durable catch-up.
 *
 * An MV3 worker can be evicted mid-debounce, which would silently strand every
 * pending mirror. This runs on worker startup and on a 1-minute alarm and
 * re-derives the work from stored state rather than from memory.
 */
export async function sweepConversationSync(): Promise<void> {
  try {
    const context = await getManagedCloudAuthContext();
    if (!context) return;
    // Deletions drain first so an explicit delete is not delayed behind a
    // backlog of ordinary conversation writes.
    await drainCloudDeletionTombstones(context.owner);
    const entries = await listConversationsNeedingCloudSync(context.owner);
    for (const entry of entries) {
      // Sequential: parallel flushes would race the shared `chat-message`
      // rate-limit bucket and the conversation-store lock.
      await flushConversation(context.owner, entry.id, false);
    }
  } catch (error) {
    logger.debug('Conversation sync sweep failed', error);
  }
}

/**
 * Cancel every in-flight and debounced task and clear module state.
 *
 * This is the authoritative owner fence. The transport-boundary owner check in
 * `conversationSyncClient` is the backstop; this is the one that stops work
 * before it starts.
 */
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

// ─── Flush ─────────────────────────────────────────────────────────────────

function combineTimeoutSignal(controller: AbortController): AbortSignal {
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

/**
 * Mirror one conversation. NEVER rejects and NEVER throws — every branch is
 * caught and every local write on the failure path swallows its own error. The
 * chat path does not await this and must not be able to fail because of it.
 */
export async function flushConversation(
  owner: ManagedCloudOwner,
  conversationId: string,
  streaming = false,
): Promise<void> {
  const key = flushKey(owner, conversationId);
  if (inFlightFlushes.has(key)) return;

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
      // A Local/BYOK turn landed in this thread. Stop mirroring permanently;
      // the existing account copy is left in place, never deleted.
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

/** Messages this pass will send, after the live-stream and batch bounds. */
function selectFlushableMessages(entry: ConversationEntry, streaming: boolean): HistoryMessage[] {
  const pending = pendingCloudMessages(entry);
  if (pending.length === 0) return [];
  // Write-amplification fix: while a stream is live the trailing assistant turn
  // grows on every chunk. Sending it now guarantees a second, superseding write
  // moments later. Skipping it means a normal turn costs exactly two POSTs
  // (the user message, then the settled assistant message).
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
          // `auto` is a local routing sentinel, not a model id. Omitting it lets
          // the contract's registry-derived default apply; a model id is never
          // invented here.
          ...(entry.routing.currentModelKey && entry.routing.currentModelKey !== 'auto'
            ? { model: entry.routing.currentModelKey }
            : {}),
        },
        { signal },
      );
      if (created.organizationId === undefined) {
        // The create was acknowledged, so it must never be retried as though
        // the row did not exist. An older server that omits workspace scope is
        // safe to read locally but cannot support stable background mutation.
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
      // Forward-compatible stored binding: the server-confirmed scope is the
      // important invariant, so normalize its acknowledgement bit locally.
      await recordCloudSyncState(owner, conversationId, {
        state: 'pending',
        createAcknowledged: true,
        lastAttemptAt: Date.now(),
      });
    } else {
      // Legacy bindings predate persisted workspace scope. Recovery is read
      // only and remains confined to the account's current workspace. A miss
      // is ambiguous (deleted vs another workspace), so it is terminal and we
      // never attempt a create that could resurrect or partially re-home it.
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
          // `id` is MANDATORY. The shared client retries 5xx/network failures,
          // and that is only non-duplicating because the server upserts on this
          // id (`on conflict (id) do update`).
          id: cloudMessageId,
          role: message.role,
          content: message.content,
          metadata: buildExtensionCloudMessageMetadata({
            localConversationId: conversationId,
            runtime: 'managed-cloud',
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
          // Per-message route only. The conversation continuation may have
          // advanced since this pending turn was produced, so using it here
          // would relabel older answers with the wrong model.
          ...(message.role === 'assistant' && message.model ? { model: message.model } : {}),
        },
        { signal, organizationId },
      );
    } catch (error) {
      await handleFlushError(owner, conversationId, error);
      return;
    }
    // Commit after EACH message, not once at the end: a mid-batch failure must
    // not cause already-accepted messages to be re-sent on the next pass.
    await recordCloudMessagesSynced(owner, conversationId, [
      { cloudMessageId, syncedChars, syncedFingerprint },
    ]).catch(() => undefined);
  }

  // The retry-splice in the panel can rewrite the first user message, which
  // changes the derived title. Only send it once at least one message exists
  // server-side, so the title write cannot be the thing that creates the row.
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

/**
 * Translate a transport failure into local bookkeeping.
 *
 * The shared client already retried 5xx/network three times with linear
 * backoff, and it deliberately does NOT retry 4xx — so the backoff recorded
 * here is the only thing standing between a 429 and a hot loop.
 */
async function handleFlushError(
  owner: ManagedCloudOwner,
  conversationId: string,
  error: unknown,
): Promise<void> {
  // A stale account must never write under the new identity — not even an
  // error record. Fail silently and let the owner fence do its job.
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
    // The binding remains intact and terminal. Clearing it used to let the
    // next sweep create a new row, resurrecting a conversation intentionally
    // deleted on another surface and re-uploading only the still-dirty suffix.
    await recordCloudSyncState(owner, conversationId, {
      state: 'blocked',
      blockedReason: 'not-found',
      lastError: 'Removed from Cloud — no longer syncing.',
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

// ─── Deletion tombstones ───────────────────────────────────────────────────

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

/**
 * Queue a cloud DELETE that must survive a failed attempt or a worker eviction.
 *
 * This is reached from exactly one place: an explicit user deletion in the
 * history drawer. Local TTL/quota eviction never calls it — see the note on
 * `boundConversationStoreForWrite`.
 */
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
      // Local deletion must not proceed when durability cannot be guaranteed.
      // The caller keeps the visible conversation so the user can retry after
      // earlier tombstones drain; no pending delete is silently evicted.
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

/** Issue queued DELETEs for this account. Scoped 404 means already absent. */
export async function drainCloudDeletionTombstones(owner: ManagedCloudOwner): Promise<void> {
  const tombstones = await readTombstones();
  const mine = tombstones.filter((candidate) => candidate.accountId === owner.accountId);
  if (mine.length === 0) return;

  const client = createExtensionCloudChatClient(owner);
  const settled = new Set<string>();
  for (const tombstone of mine) {
    if (tombstone.organizationId === undefined) {
      // A legacy unscoped delete cannot distinguish "already gone" from "the
      // account switched workspaces". Retain it rather than falsely settling.
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
      // Stop on the first hard failure: the remaining entries stay queued and
      // a retry storm against a failing endpoint helps nobody.
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
