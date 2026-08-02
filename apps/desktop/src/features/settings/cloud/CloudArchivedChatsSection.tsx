/**
 * Archived Cloud chats, rendered inline from Desktop's own Cloud session.
 *
 * `/api/chat/conversations` authenticates through `requireCurrentUserId` ->
 * `getClerkAuthUser`, which accepts the device bearer, so restore and delete
 * work here without the cookie-gated child window.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteCloudConversation,
  listCloudArchivedConversations,
  restoreCloudArchivedConversation,
  type CloudArchivedConversation,
} from '../../../api/cloudAccountSettings';
import {
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  SectionEmpty,
  SectionError,
  SectionHeading,
  SectionLoading,
  formatSettingsDate,
} from './sectionChrome';

export function CloudArchivedChatsSection() {
  const [conversations, setConversations] = useState<CloudArchivedConversation[] | null>(null);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const generation = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const page = await listCloudArchivedConversations(0);
      if (generation.current !== current) return;
      setConversations(page.conversations);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (caught) {
      if (generation.current === current) {
        setError(caught instanceof Error ? caught.message : 'Could not load your archived chats.');
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirstPage();
    return () => {
      generation.current += 1;
    };
  }, [loadFirstPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listCloudArchivedConversations(nextOffset);
      setConversations((current) => [...(current ?? []), ...page.conversations]);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load more archived chats.');
    } finally {
      setLoadingMore(false);
    }
  };

  const runAction = async (
    conversation: CloudArchivedConversation,
    action: (id: string) => Promise<void>,
    successNotice: string,
    failureMessage: string,
  ) => {
    setPendingId(conversation.id);
    setError(null);
    setNotice(null);
    try {
      await action(conversation.id);
      setConversations((current) =>
        (current ?? []).filter((entry) => entry.id !== conversation.id),
      );
      setNotice(successNotice);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : failureMessage);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="cloud-archived-chats">
      <SectionHeading
        title="Archived chats"
        description="Cloud conversations you have archived. Restore one to bring it back into your history, or delete it permanently."
      />

      {loading ? <SectionLoading label="Loading archived chats…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void loadFirstPage()} /> : null}
      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {!loading && conversations !== null && conversations.length === 0 ? (
        <SectionEmpty>You have no archived Cloud chats.</SectionEmpty>
      ) : null}

      {!loading && conversations !== null && conversations.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-border bg-card/40">
          {conversations.map((conversation, index) => (
            <li
              key={conversation.id}
              className={`flex items-center justify-between gap-4 p-5 ${
                index > 0 ? 'border-t border-border/60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{conversation.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Updated {formatSettingsDate(conversation.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  disabled={pendingId === conversation.id}
                  onClick={() =>
                    void runAction(
                      conversation,
                      restoreCloudArchivedConversation,
                      `Restored “${conversation.title}”.`,
                      'Could not restore this chat.',
                    )
                  }
                >
                  Restore
                </button>
                <button
                  type="button"
                  className={`${SMALL_BUTTON} text-destructive`}
                  disabled={pendingId === conversation.id}
                  onClick={() =>
                    void runAction(
                      conversation,
                      deleteCloudConversation,
                      `Deleted “${conversation.title}”.`,
                      'Could not delete this chat.',
                    )
                  }
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {hasMore ? (
        <div>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={loadingMore}
            aria-busy={loadingMore || undefined}
            onClick={() => void loadMore()}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
