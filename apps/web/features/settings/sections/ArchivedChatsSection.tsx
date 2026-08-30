'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@agiworkforce/ui';
import { useChatStore } from '@shared/stores/web-chat-store';
import {
  applyBulkConversationAction,
  deleteManagedConversation,
  listArchivedConversations,
  restoreArchivedConversation,
  type ArchivedConversationSummary,
} from '../services/conversation-data-service';
import { SettingsSectionLink } from '../components/SettingsSectionLink';
import { toUserMessage } from '@/lib/user-error-message';

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated date unavailable';
  return `Updated ${date.toLocaleDateString(undefined, {
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

export function ArchivedChatsSection() {
  const router = useRouter();
  // Destructive-action confirmation (shell-nav-ia-gap-01 remainder) — same
  // shared AlertDialog wrapper as PrivacySection and WebChatPage, replacing
  // native `window.confirm()` for both the single-chat and delete-all-archived
  // actions below.
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirm();
  const [conversations, setConversations] = useState<ArchivedConversationSummary[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const updateConversationInStore = useChatStore((state) => state.updateConversation);
  const deleteConversationFromStore = useChatStore((state) => state.deleteConversation);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const streamingConversationIds = useChatStore((state) => state.streamingConversationIds);

  const loadFirstPage = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listArchivedConversations(0, signal);
      setConversations(page.conversations);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(toUserMessage(caught, 'Failed to load archived chats'));
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
      const page = await listArchivedConversations(nextOffset);
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
      setError(toUserMessage(caught, 'Failed to load more archived chats'));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRestore = async (conversation: ArchivedConversationSummary) => {
    setActionId(conversation.id);
    setError(null);
    setNotice(null);
    try {
      await restoreArchivedConversation(conversation.id);
      setConversations((current) => current.filter(({ id }) => id !== conversation.id));
      updateConversationInStore(conversation.id, { isArchived: false });
      setNotice(`Restored “${conversation.title}”.`);
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to restore archived chat'));
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (conversation: ArchivedConversationSummary) => {
    const label = conversation.title ? `“${conversation.title}”` : 'this archived chat';
    const confirmed = await confirmDestructive({
      title: 'Delete archived chat?',
      description: `${label.charAt(0).toUpperCase()}${label.slice(1)} moves to Deleted chats and leaves your history. You can restore it from Settings > Deleted chats until it is purged.`,
      confirmText: 'Delete chat',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setActionId(conversation.id);
    setError(null);
    setNotice(null);
    try {
      await deleteManagedConversation(conversation.id);
      setConversations((current) => current.filter(({ id }) => id !== conversation.id));
      deleteConversationFromStore(conversation.id);
      if (activeConversationId === conversation.id) router.replace('/chat');
      setNotice(`Deleted “${conversation.title}”.`);
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to delete archived chat'));
    } finally {
      setActionId(null);
    }
  };

  const handleDeleteAll = async () => {
    const scope = hasMore
      ? 'Every archived chat'
      : `All ${conversations.length} archived chat${conversations.length === 1 ? '' : 's'}`;
    const confirmed = await confirmDestructive({
      title: 'Delete all archived chats?',
      description: `${scope} will be removed from your history. Chats that are not archived are not affected. You can restore them from Settings > Deleted chats until they are purged.`,
      confirmText: 'Delete all archived',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setActionId('all');
    setError(null);
    setNotice(null);
    try {
      const affectedCount = await applyBulkConversationAction('delete_archived');
      for (const conversation of conversations) {
        deleteConversationFromStore(conversation.id);
      }
      if (activeConversationId && conversations.some(({ id }) => id === activeConversationId)) {
        router.replace('/chat');
      }
      setConversations([]);
      setHasMore(false);
      setNotice(
        affectedCount === 1
          ? 'Deleted 1 archived chat.'
          : `Deleted ${affectedCount} archived chats.`,
      );
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to delete archived chats'));
    } finally {
      setActionId(null);
    }
  };

  const hasStreamingChat = streamingConversationIds.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {destructiveConfirmDialog}
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
          Archived chats
        </h1>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 14 }}>
          Restore chats to the sidebar or permanently delete them.
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
        aria-label="Archived chat list"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <p style={{ margin: 0, padding: 20, color: 'var(--text-3)', fontSize: 13 }}>
            Loading archived chats…
          </p>
        ) : error ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              Archived chats could not be loaded
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              This is not the same as having no archived chats. Retry above to load them.
            </p>
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              No archived chats
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              Chats you archive will appear here.
            </p>
          </div>
        ) : (
          conversations.map((conversation, index) => {
            const busy = actionId === conversation.id || actionId === 'all';
            const streaming = streamingConversationIds.includes(conversation.id);
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
                    {streaming ? ' · Reply in progress' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => void handleRestore(conversation)}
                    disabled={busy}
                    style={{ ...actionButtonStyle, cursor: busy ? 'not-allowed' : 'pointer' }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(conversation)}
                    disabled={busy || streaming}
                    style={{
                      ...actionButtonStyle,
                      color: 'var(--chat-accent-primary-text, #8b5f1d)',
                      cursor: busy || streaming ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
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
          style={{ ...actionButtonStyle, alignSelf: 'center' }}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}

      {!loading && conversations.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => void handleDeleteAll()}
            disabled={actionId !== null || hasStreamingChat}
            style={{
              ...actionButtonStyle,
              color: 'var(--chat-accent-primary-text, #8b5f1d)',
              cursor: actionId !== null || hasStreamingChat ? 'not-allowed' : 'pointer',
            }}
          >
            {actionId === 'all' ? 'Deleting…' : 'Delete all archived'}
          </button>
          {hasStreamingChat ? (
            <p style={{ margin: '7px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              Finish or stop active replies before deleting archived chats.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
