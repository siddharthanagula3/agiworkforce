export default function ChatLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{
        display: 'flex',
        minHeight: '60vh',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        aria-label="Loading chat"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid var(--settings-border, rgba(255,255,255,0.15))',
          borderTopColor: 'var(--chat-accent-primary, #888)',
          animation: 'spin 0.7s linear infinite',
        }}
      />
    </div>
  );
}
