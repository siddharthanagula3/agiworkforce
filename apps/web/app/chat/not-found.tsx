/**
 * GOV-25: segment-scoped 404 for chat.
 *
 * Without it, `notFound()` from anywhere under /chat rendered the global
 * marketing 404, dropping the user out of the app shell entirely.
 */
export default function ChatNotFound() {
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '60vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px', color: 'var(--text-1)' }}>
          Conversation not found
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '0 0 20px' }}>
          This conversation is no longer available. It may have been deleted, or you may not have
          access to it.
        </p>
        <a
          href="/chat"
          style={{
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--settings-border)',
            color: 'var(--text-2)',
            padding: '8px 16px',
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
