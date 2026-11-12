import {
  conversationHasUnsavedCloudChanges,
  type ConversationEntry,
} from '../background/conversation-history';
import {
  ChromeShareError,
  type ChromeShareLink,
  type ChromeShareLinkRequest,
} from '../cloud-bridge/shareClient';
import {
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';
import { UUID_PATTERN } from '../../lib/uuid';

export interface HistoryShareDependencies {
  owner: ManagedCloudOwner;
  entryId: string;
  isLive: () => boolean;
  getAuth: () => Promise<{ token: string; owner: ManagedCloudOwner } | null | undefined>;
  getStored: (owner: ManagedCloudOwner, id: string) => Promise<ConversationEntry | undefined>;
  createLink: (token: string, request: ChromeShareLinkRequest) => Promise<ChromeShareLink>;
}

export type HistoryShareResult =
  | { status: 'created'; link: ChromeShareLink }
  | { status: 'signed-out' }
  | { status: 'not-loaded' }
  | { status: 'local-only'; message?: string }
  | { status: 'out-of-sync'; message: string; unsavedChanges: boolean }
  | { status: 'retired' };

export type HistoryShareAvailability = 'available' | 'local-only';

export function historyShareAvailability(entry: ConversationEntry): HistoryShareAvailability {
  const sync = entry.cloudSync;
  if (
    !sync?.conversationId ||
    !UUID_PATTERN.test(sync.conversationId) ||
    sync.createAcknowledged !== true
  ) {
    return 'local-only';
  }
  if (
    sync.blockedReason === 'non-cloud-runtime' ||
    sync.blockedReason === 'not-found' ||
    sync.blockedReason === 'workspace'
  ) {
    return 'local-only';
  }
  return entry.messages.some((message) => message.runtime === 'local') ? 'local-only' : 'available';
}

export async function createHistoryShareLink(
  dependencies: HistoryShareDependencies,
): Promise<HistoryShareResult> {
  const { owner, entryId, isLive } = dependencies;
  const auth = await dependencies.getAuth();
  if (!auth) return { status: 'signed-out' };
  if (!isLive() || !sameManagedCloudOwner(auth.owner, owner)) return { status: 'retired' };

  const stored = await dependencies.getStored(owner, entryId);
  if (!isLive()) return { status: 'retired' };
  if (!stored || stored.cloudSync?.messagesLoaded === false) return { status: 'not-loaded' };
  const conversationId = stored.cloudSync?.conversationId;
  if (historyShareAvailability(stored) === 'local-only' || !conversationId) {
    return { status: 'local-only' };
  }

  let link: ChromeShareLink;
  try {
    link = await dependencies.createLink(auth.token, {
      title: stored.title,
      messages: stored.messages.filter((message) => message.content.trim().length > 0),
      conversationId,
    });
  } catch (error) {
    if (!(error instanceof ChromeShareError)) throw error;
    if (!isLive()) return { status: 'retired' };
    if (error.kind === 'signed-out') return { status: 'signed-out' };
    if (error.kind === 'not-saved') return { status: 'local-only', message: error.message };
    if (error.kind === 'out-of-sync') {
      return {
        status: 'out-of-sync',
        message: error.message,
        unsavedChanges: conversationHasUnsavedCloudChanges(stored),
      };
    }
    throw error;
  }
  return isLive() ? { status: 'created', link } : { status: 'retired' };
}
