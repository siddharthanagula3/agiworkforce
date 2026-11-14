'use client';

import { useManagedChatList } from '../hooks/useManagedChatList';
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
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
} as const;

export function DeletedChatsSection() {
  const manager = useManagedChatList('deleted');
  const { conversations, hasMore, loading, loadingMore, actionId, error, loadFailed, notice } =
    manager;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
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
          Recently deleted
        </h1>
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
          Deleted chats stay here for 30 days. Restoring puts one back where it was.
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
        aria-label="Deleted chat list"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <p style={{ margin: 0, padding: 'var(--space-5)', color: 'var(--text-3)', fontSize: 13 }}>
            Loading deleted chats…
          </p>
        ) : loadFailed ? (
          <div style={{ padding: 'var(--space-6) var(--space-5)', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              Deleted chats could not be loaded
            </div>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              This is not the same as having no deleted chats. Retry above to load them.
            </p>
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: 'var(--space-6) var(--space-5)', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
              No deleted chats
            </div>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-3)', fontSize: 12 }}>
              Chats you delete will appear here so you can put them back.
            </p>
          </div>
        ) : (
          conversations.map((conversation, index) => {
            const busy = !manager.ready;
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
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => manager.restore(conversation)}
                  disabled={busy}
                  style={{
                    ...actionButtonStyle,
                    flexShrink: 0,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {actionId === conversation.id ? 'Restoring…' : 'Restore'}
                </button>
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
