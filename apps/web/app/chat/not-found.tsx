export default function ChatNotFound() {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '60vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-5)',
      }}
    >
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 600,
            margin: '0 0 var(--space-2)',
            color: 'var(--text-1)',
          }}
        >
          Conversation not found
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '0 0 var(--space-5)' }}>
          This conversation is no longer available. It may have been deleted, or you may not have
          access to it.
        </p>
        <a
          href="/chat"
          style={{
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--settings-border)',
            color: 'var(--text-2)',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Start a new chat
        </a>
      </div>
    </div>
  );
}
