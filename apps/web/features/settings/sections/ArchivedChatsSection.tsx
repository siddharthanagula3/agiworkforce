'use client';

import { ConfirmDialog } from '@agiworkforce/ui';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useManagedChatList } from '../hooks/useManagedChatList';
import { SettingsSectionLink } from '../components/SettingsSectionLink';

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
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
} as const;

export function ArchivedChatsSection() {
  const manager = useManagedChatList('archived');
  const { conversations, hasMore, loading, loadingMore, actionId, error, loadFailed, notice } =
    manager;
  const streamingConversationIds = useChatStore((state) => state.streamingConversationIds);
  const confirmation = manager.confirmation;

  const hasStreamingChat = streamingConversationIds.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {confirmation ? (
        <ConfirmDialog
          open
          title={
            confirmation.action === 'delete_archived'
              ? 'Delete all archived chats in this workspace?'
              : 'Delete archived chat?'
          }
          description={
            confirmation.action === 'delete_archived'
              ? 'Every archived chat in this workspace will leave your history. Other chats are not affected. You can restore deleted chats from Recently deleted for 30 days.'
              : `“${confirmation.row!.title}” will leave your history. You can restore it from Recently deleted for 30 days.`
          }
          confirmText={
            confirmation.action === 'delete_archived' ? 'Delete all archived' : 'Delete chat'
          }
          variant="destructive"
          onConfirm={manager.confirm}
          onCancel={manager.cancel}
          onOpenChange={(open) => {
            if (!open) manager.cancel();
          }}
        />
      ) : null}
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
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: 'var(--space-3) 0 var(--space-1)',
          }}
        >
          Archived chats
        </h1>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
          Restore chats to the sidebar or move them to Recently deleted.
        </p>
      </div>

      {error ? (
        <div role="alert" style={{ color: 'var(--chat-accent-primary-text)', fontSize: 13 }}>
          {error}{' '}
          <button type="button" onClick={manager.retry} style={actionButtonStyle}>
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
          <p style={{ margin: 0, padding: 'var(--space-5)', color: 'var(--text-3)', fontSize: 13 }}>
            Loading archived chats…
          </p>
        ) : loadFailed ? (
          <div style={{ padding: 'var(--space-6) var(--space-5)', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              Archived chats could not be loaded
            </div>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              This is not the same as having no archived chats. Retry above to load them.
            </p>
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: 'var(--space-6) var(--space-5)', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              No archived chats
            </div>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              Chats you archive will appear here.
            </p>
          </div>
        ) : (
          conversations.map((conversation, index) => {
            const busy = !manager.ready;
            const streaming = streamingConversationIds.includes(conversation.id);
            return (
              <div
                key={conversation.id}
                style={{
                  padding: 'var(--space-4) var(--space-5)',
                  borderTop: index === 0 ? 'none' : '1px solid var(--settings-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-4)',
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
                  <div
                    style={{ marginTop: 'var(--space-1)', color: 'var(--text-3)', fontSize: 12 }}
                  >
                    {formatUpdatedAt(conversation.updatedAt)}
                    {streaming ? ' · Reply in progress' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => manager.restore(conversation)}
                    disabled={busy}
                    style={{ ...actionButtonStyle, cursor: busy ? 'not-allowed' : 'pointer' }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => manager.remove(conversation)}
                    disabled={busy || streaming}
                    style={{
                      ...actionButtonStyle,
                      color: 'var(--chat-accent-primary-text)',
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
          onClick={manager.loadMore}
          disabled={!manager.ready}
          style={{ ...actionButtonStyle, alignSelf: 'center' }}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}

      {!loading && conversations.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={manager.removeAll}
            disabled={!manager.ready || hasStreamingChat}
            style={{
              ...actionButtonStyle,
              color: 'var(--chat-accent-primary-text)',
              cursor: !manager.ready || hasStreamingChat ? 'not-allowed' : 'pointer',
            }}
          >
            {actionId === 'all' ? 'Deleting…' : 'Delete all archived'}
          </button>
          {hasStreamingChat ? (
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              Finish or stop active replies before deleting archived chats.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
