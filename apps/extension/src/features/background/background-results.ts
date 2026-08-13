/**
 * Delivery of background-initiated chat answers.
 *
 * Scheduled tasks and prompt shortcuts dispatch through the same Managed Cloud
 * chat path an interactive turn uses, but with a fixed `clientInstanceId`
 * (`scheduled-task` / `shortcut-replay`). The side panel filters `CHAT_CHUNK`
 * on its own per-panel UUID, so nothing ever consumed those streams: the run
 * completed, the account was billed, and the answer was dropped.
 *
 * These helpers route that answer to the same sink an interactive answer lands
 * in — the browser conversation store the panel's History drawer reads — under
 * a stable, task-scoped conversation id so repeated runs accumulate in one
 * thread.
 */
import {
  appendBackgroundTurn,
  type ConversationEntry,
  type ConversationRoutingState,
} from './conversation-history';
import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import type { ChromeManagedRoutingMetadata } from '../../types';
import { logger } from '../../utils';
// Worker-only import. `conversation-history.ts` deliberately stays free of it
// so the storage seam remains safe to import from the side panel too.
import { scheduleConversationSync } from '../cloud-bridge/conversationSync';
import {
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

/** Key holding the conversation the side panel should open on its next load. */
export const PENDING_RESULT_KEY = 'agi_pending_background_result_v1';

/** Session-storage key prefix mapping a notification id to its result. */
export const NOTIFICATION_CONVERSATION_PREFIX = 'agi_notif_conv_';

/** Runtime message telling an already-open side panel to show a result. */
export const OPEN_BROWSER_CONVERSATION_MESSAGE = 'OPEN_BROWSER_CONVERSATION';

/**
 * `clientInstanceId` values used by background-initiated runs. These are the
 * literals the schedulers pass to `handleChatMessage`; no side panel ever
 * listens for them.
 */
export const SCHEDULED_TASK_CLIENT_ID = 'scheduled-task';
export const SHORTCUT_REPLAY_CLIENT_ID = 'shortcut-replay';

/** Characters allowed in the id segment of a background conversation id. */
const ID_SEGMENT_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;

/** How much of the answer the completion notification previews. */
const NOTIFICATION_SNIPPET_CHARS = 180;

export type BackgroundRunKind = 'task' | 'shortcut';

/** Everything the delivery needs to file a background answer. */
export interface BackgroundChatDelivery {
  kind: BackgroundRunKind;
  /** Stable conversation id — repeated runs append to the same thread. */
  conversationId: string;
  /** Task or shortcut name; becomes the history entry's title. */
  label: string;
  /** The prompt that was executed. */
  prompt: string;
  /** Stable Managed Cloud/billing identity used when this run must be retried. */
  requestId?: string;
  /** Stable local write identity used to suppress duplicate recovered turns. */
  deliveryId?: string;
  /** Persist concrete routing before streaming starts. */
  onRouting?: (routing: ChromeManagedRoutingMetadata) => void | Promise<void>;
  /** Persist the server-owned run as soon as its handle is available. */
  onRunReference?: (run: ManagedCloudAgentRunReference) => void | Promise<void>;
  /**
   * Invoked once — and only once the answer is safely in the store — with the
   * text that was filed. Lets the dispatching caller quote the result in its
   * completion notification without buffering the stream itself.
   */
  onDelivered?: (answer: string, owner: ManagedCloudOwner) => void;
}

/**
 * Stable conversation id for a background run.
 *
 * Returns `undefined` for an id that would not survive the conversation
 * store's validation — the caller must then skip delivery rather than write a
 * record the store would reject.
 */
export function backgroundConversationId(
  kind: BackgroundRunKind,
  recordId: string,
): string | undefined {
  if (!ID_SEGMENT_PATTERN.test(recordId)) return undefined;
  return `bg-${kind}-${recordId}`;
}

/**
 * Build the delivery descriptor for a background run, or `undefined` when the
 * run cannot be filed (unusable record id).
 */
export function createBackgroundChatDelivery(
  kind: BackgroundRunKind,
  recordId: string,
  label: string,
  prompt: string,
): BackgroundChatDelivery | undefined {
  const conversationId = backgroundConversationId(kind, recordId);
  if (!conversationId) return undefined;
  return { kind, conversationId, label, prompt };
}

/**
 * File a completed background answer into the conversation store.
 *
 * Returns the stored entry, or `undefined` when there was no answer text to
 * keep (an empty stream, or a run that failed before producing output).
 */
export async function recordBackgroundChatResult(
  delivery: BackgroundChatDelivery,
  owner: ManagedCloudOwner,
  answer: string,
  routing?: ConversationRoutingState,
): Promise<ConversationEntry | undefined> {
  const entry = await appendBackgroundTurn(
    owner,
    delivery.conversationId,
    delivery.label,
    {
      prompt: delivery.prompt,
      answer,
      ...(delivery.deliveryId ? { deliveryId: delivery.deliveryId } : {}),
      // Provenance, not a guess: every background run reaching this function
      // was executed by `executeChromeManagedChat` against Managed Cloud.
      runtime: 'managed-cloud',
    },
    routing,
  );
  if (!entry) return undefined;
  if (entry.status !== 'unchanged') {
    // Delivery callbacks fire on LOCAL persistence proof only. A cloud-mirror
    // failure must never suppress the user's completion notification.
    delivery.onDelivered?.(entry.persistedAnswer, owner);
    // Reuse the existing `deliveryId` idempotency rather than inventing a
    // second one: an 'unchanged' result means the store already holds this
    // turn, so there is nothing new to mirror.
    scheduleConversationSync(owner, delivery.conversationId);
  }
  return entry.entry;
}

/**
 * A short preview of the answer for the completion notification, so the
 * notification itself carries some of the result instead of only announcing
 * that a run happened.
 */
export function notificationSnippet(answer: string): string {
  const collapsed = answer.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return '';
  return collapsed.length > NOTIFICATION_SNIPPET_CHARS
    ? `${collapsed.slice(0, NOTIFICATION_SNIPPET_CHARS - 1)}…`
    : collapsed;
}

/**
 * How many notification→result links are retained. An hourly task on 50 tasks
 * would otherwise accumulate thousands of session-storage keys that are only
 * ever read if the user clicks the notification.
 */
const MAX_NOTIFICATION_LINKS = 20;

interface NotificationLink {
  conversationId: string;
  owner: ManagedCloudOwner;
  at: number;
}

/**
 * Strictly increasing link stamp. Several tasks can fire inside the same
 * millisecond, and `Date.now()` ties would make the prune order arbitrary —
 * which risks dropping the link the user is about to click.
 */
let lastLinkStamp = 0;
function nextLinkStamp(): number {
  const now = Date.now();
  lastLinkStamp = now > lastLinkStamp ? now : lastLinkStamp + 1;
  return lastLinkStamp;
}

function isNotificationLink(value: unknown): value is NotificationLink {
  if (!value || typeof value !== 'object') return false;
  const link = value as Record<string, unknown>;
  const owner = normalizeManagedCloudOwner(link['owner']);
  return (
    owner != null &&
    typeof link['conversationId'] === 'string' &&
    link['conversationId'].length > 0 &&
    typeof link['at'] === 'number' &&
    Number.isFinite(link['at'])
  );
}

/**
 * Remember which result a given completion notification refers to, so clicking
 * it opens that conversation instead of just opening the panel.
 *
 * Notifications that are never clicked leave their link behind, so the oldest
 * links are pruned on every write.
 */
export async function linkNotificationToConversation(
  notificationId: string,
  owner: ManagedCloudOwner,
  conversationId: string,
): Promise<void> {
  try {
    await chrome.storage.session.set({
      [`${NOTIFICATION_CONVERSATION_PREFIX}${notificationId}`]: {
        conversationId,
        owner,
        at: nextLinkStamp(),
      } satisfies NotificationLink,
    });
    await pruneNotificationLinks();
  } catch (error) {
    logger.debug('Failed to link notification to background result', error);
  }
}

async function pruneNotificationLinks(): Promise<void> {
  const all = await chrome.storage.session.get(null);
  const links = Object.entries(all)
    .filter(([key]) => key.startsWith(NOTIFICATION_CONVERSATION_PREFIX))
    .map(([key, value]) => ({ key, at: isNotificationLink(value) ? value.at : 0 }));
  if (links.length <= MAX_NOTIFICATION_LINKS) return;
  const stale = links
    .sort((left, right) => right.at - left.at)
    .slice(MAX_NOTIFICATION_LINKS)
    .map((link) => link.key);
  await chrome.storage.session.remove(stale);
}

/** Read and clear the conversation a notification points at. */
export async function takeNotificationConversation(
  notificationId: string,
  owner: ManagedCloudOwner,
): Promise<string | undefined> {
  const key = `${NOTIFICATION_CONVERSATION_PREFIX}${notificationId}`;
  try {
    const stored = await chrome.storage.session.get(key);
    const link = stored?.[key];
    if (!isNotificationLink(link)) return undefined;
    await chrome.storage.session.remove(key);
    return sameManagedCloudOwner(link.owner, owner) ? link.conversationId : undefined;
  } catch (error) {
    logger.debug('Failed to read notification background result link', error);
    return undefined;
  }
}

/**
 * Park the conversation the side panel should open on its next load.
 *
 * `chrome.sidePanel.open()` cannot pass a payload, and a panel that is being
 * opened by the click is not yet listening for runtime messages, so the
 * pointer goes through session storage and is consumed by the panel on load.
 */
export async function setPendingResultConversation(
  owner: ManagedCloudOwner,
  conversationId: string,
): Promise<void> {
  try {
    await chrome.storage.session.set({
      [PENDING_RESULT_KEY]: { conversationId, owner },
    });
  } catch (error) {
    logger.debug('Failed to park pending background result pointer', error);
  }
}

/** Read and clear the pending pointer. Returns `undefined` when unset. */
export async function takePendingResultConversation(
  owner: ManagedCloudOwner,
): Promise<string | undefined> {
  try {
    const stored = await chrome.storage.session.get(PENDING_RESULT_KEY);
    const pending = stored?.[PENDING_RESULT_KEY];
    if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return undefined;
    const record = pending as Record<string, unknown>;
    const conversationId = record['conversationId'];
    const pendingOwner = normalizeManagedCloudOwner(record['owner']);
    if (
      typeof conversationId !== 'string' ||
      conversationId.length === 0 ||
      !sameManagedCloudOwner(pendingOwner, owner)
    ) {
      await chrome.storage.session.remove(PENDING_RESULT_KEY);
      return undefined;
    }
    await chrome.storage.session.remove(PENDING_RESULT_KEY);
    return conversationId;
  } catch (error) {
    logger.debug('Failed to read pending background result pointer', error);
    return undefined;
  }
}
