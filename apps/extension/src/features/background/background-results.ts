import {
  appendBackgroundTurn,
  type ConversationEntry,
  type ConversationRoutingState,
} from './conversation-history';
import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import type { ChromeManagedRoutingMetadata } from '../../types';
import { logger } from '../../utils';
import { scheduleConversationSync } from '../cloud-bridge/conversationSync';
import {
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

export const PENDING_RESULT_KEY = 'agi_pending_background_result_v1';

export const NOTIFICATION_CONVERSATION_PREFIX = 'agi_notif_conv_';

export const OPEN_BROWSER_CONVERSATION_MESSAGE = 'OPEN_BROWSER_CONVERSATION';

export const SCHEDULED_TASK_CLIENT_ID = 'scheduled-task';
export const SHORTCUT_REPLAY_CLIENT_ID = 'shortcut-replay';

const ID_SEGMENT_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;

const NOTIFICATION_SNIPPET_CHARS = 180;

export type BackgroundRunKind = 'task' | 'shortcut';

export interface BackgroundChatDelivery {
  kind: BackgroundRunKind;
  conversationId: string;
  label: string;
  prompt: string;
  requestId?: string;
  deliveryId?: string;
  onRouting?: (routing: ChromeManagedRoutingMetadata) => void | Promise<void>;
  onRunReference?: (run: ManagedCloudAgentRunReference) => void | Promise<void>;
  onDelivered?: (answer: string, owner: ManagedCloudOwner) => void;
}

export function backgroundConversationId(
  kind: BackgroundRunKind,
  recordId: string,
): string | undefined {
  if (!ID_SEGMENT_PATTERN.test(recordId)) return undefined;
  return `bg-${kind}-${recordId}`;
}

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
      runtime: 'managed-cloud',
    },
    routing,
  );
  if (!entry) return undefined;
  if (entry.status !== 'unchanged') {
    delivery.onDelivered?.(entry.persistedAnswer, owner);
    scheduleConversationSync(owner, delivery.conversationId);
  }
  return entry.entry;
}

export function notificationSnippet(answer: string): string {
  const collapsed = answer.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return '';
  return collapsed.length > NOTIFICATION_SNIPPET_CHARS
    ? `${collapsed.slice(0, NOTIFICATION_SNIPPET_CHARS - 1)}…`
    : collapsed;
}

const MAX_NOTIFICATION_LINKS = 20;

interface NotificationLink {
  conversationId: string;
  owner: ManagedCloudOwner;
  at: number;
}

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
