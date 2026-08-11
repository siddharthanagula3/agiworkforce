'use client';

/**
 * Recently deleted chats.
 *
 * `DELETE /api/chat/conversations/[id]` only sets `deleted_at`, and — unlike
 * media, which has `cron/purge-deleted-media` — nothing ever purges those rows.
 * So a deleted conversation was the worst of both: permanently unreachable for
 * the user, and still occupying storage indefinitely. Every read filtered
 * `deleted_at is null`, so a mis-click was unrecoverable.
 *
 * This lists those rows and restores them. The copy deliberately does NOT
 * promise a retention window, because there is no purge job to enforce one —
 * saying "deleted after 30 days" would be the same unenforced claim as the
 * retention control that was removed from Settings → System.
 */

import { useCallback, useEffect, useState } from 'react';

import { useChatStore } from '@shared/stores/web-chat-store';
import { toWebConversation } from '@/lib/hooks/useConversations';
import {
  listDeletedConversations,
  restoreDeletedConversation,
  type ArchivedConversationSummary,
} from '../services/conversation-data-service';
import { SettingsSectionLink } from '../components/SettingsSectionLink';

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return `Last updated ${date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`;
}

const actionButtonStyle = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
} as const;

export function DeletedChatsSection() {
  const [conversations, setConversations] = useState<ArchivedConversationSummary[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const addConversationToStore = useChatStore((state) => state.addConversation);

  const loadFirstPage = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listDeletedConversations(0, signal);
      setConversations(page.conversations);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'Failed to load deleted chats');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadFirstPage(controller.signal);
    return () => controller.abort();
  }, [loadFirstPage]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listDeletedConversations(nextOffset);
      setConversations((current) => {
        const ids = new Set(current.map((conversation) => conversation.id));
        return [
          ...current,
          ...page.conversations.filter((conversation) => !ids.has(conversation.id)),
        ];
      });
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load more deleted chats');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRestore = async (conversation: ArchivedConversationSummary) => {
    setActionId(conversation.id);
    setError(null);
    setNotice(null);
    try {
      // Unlike an archived chat — which is already in the sidebar store and
      // only needs a flag flipped — a deleted one was filtered out of every
      // read, so it must be ADDED back. The server returns the restored row so
      // its real archived/pinned state and original `updated_at` are used
      // rather than reconstructed from this summary.
      const restored = await restoreDeletedConversation(conversation.id);
      setConversations((current) => current.filter(({ id }) => id !== conversation.id));
      addConversationToStore(toWebConversation(restored));
      setNotice(`Restored “${conversation.title}”.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to restore deleted chat');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <SettingsSectionLink
          section="privacy"
          style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}
        >
          ← Privacy
        </SettingsSectionLink>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '10px 0 4px',
          }}
        >
          Recently deleted
        </h1>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 14 }}>
          Chats you deleted. Restoring one puts it back exactly where it was, including whether it
          was archived or pinned.
        </p>
      </div>

      {error ? (
        <div role="alert" style={{ color: 'var(--chat-accent-primary, #c8892a)', fontSize: 13 }}>
          {error}{' '}
          <button type="button" onClick={() => void loadFirstPage()} style={actionButtonStyle}>
            Retry
          </button>
        </div>
      ) : null}
      {notice ? (
        <div role="status" style={{ color: 'var(--text-2)', fontSize: 13 }}>
          {notice}
        </div>
      ) : null}

      <section
        aria-label="Deleted chat list"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <p style={{ margin: 0, padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
            Loading deleted chats…
          </p>
        ) : conversations.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              No deleted chats
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              Chats you delete will appear here so you can put them back.
            </p>
          </div>
        ) : (
          conversations.map((conversation, index) => {
            const busy = actionId === conversation.id;
            return (
              <div
                key={conversation.id}
                style={{
                  padding: '16px 20px',
                  borderTop: index === 0 ? 'none' : '1px solid var(--settings-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: 'var(--text-1)',
                      fontSize: 14,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {conversation.title}
                  </div>
                  <div style={{ marginTop: 3, color: 'var(--text-3)', fontSize: 12 }}>
                    {formatUpdatedAt(conversation.updatedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRestore(conversation)}
                  disabled={busy}
                  style={{
                    ...actionButtonStyle,
                    flexShrink: 0,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {busy ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            );
          })
        )}
      </section>

      {hasMore ? (
        <button
          type="button"
          onClick={() => void handleLoadMore()}
          disabled={loadingMore}
          style={{
            ...actionButtonStyle,
            alignSelf: 'flex-start',
            cursor: loadingMore ? 'not-allowed' : 'pointer',
          }}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}

export default DeletedChatsSection;
