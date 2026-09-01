'use client';

import { useCallback, useEffect, useState } from 'react';

import { useChatStore } from '@shared/stores/web-chat-store';
import { toWebConversation } from '@/lib/hooks/useConversations';
import {
  listDeletedConversations,
  restoreDeletedConversation,
  type ArchivedConversationSummary,
} from '../services/conversation-data-service';
import { SettingsSectionLink } from '../components/SettingsSectionLink';
import { toUserMessage } from '@/lib/user-error-message';

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
      setError(toUserMessage(caught, 'Failed to load deleted chats'));
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
      setError(toUserMessage(caught, 'Failed to load more deleted chats'));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRestore = async (conversation: ArchivedConversationSummary) => {
    setActionId(conversation.id);
    setError(null);
    setNotice(null);
    try {
      const restored = await restoreDeletedConversation(conversation.id);
      setConversations((current) => current.filter(({ id }) => id !== conversation.id));
      addConversationToStore(toWebConversation(restored));
      setNotice(`Restored “${conversation.title}”.`);
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to restore deleted chat'));
    } finally {
      setActionId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <SettingsSectionLink
          section="privacy"
          style={{
            color: 'var(--text-3)',
            fontSize: 12,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 24,
          }}
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
        <div
          role="alert"
          style={{ color: 'var(--chat-accent-primary-text, #8b5f1d)', fontSize: 13 }}
        >
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
        ) : error ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              Deleted chats could not be loaded
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              This is not the same as having no deleted chats. Retry above to load them.
            </p>
          </div>
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
