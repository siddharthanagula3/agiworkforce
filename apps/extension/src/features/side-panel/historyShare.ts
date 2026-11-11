import type { ConversationEntry } from '../background/conversation-history';
import type { ChromeShareLink, ChromeShareLinkRequest } from '../cloud-bridge/shareClient';
import {
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

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
  | { status: 'retired' };

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

  const link = await dependencies.createLink(auth.token, {
    title: stored.title,
    messages: stored.messages.filter((message) => message.content.trim().length > 0),
    ...(stored.cloudSync?.conversationId
      ? { conversationId: stored.cloudSync.conversationId }
      : {}),
  });
  return isLive() ? { status: 'created', link } : { status: 'retired' };
}
