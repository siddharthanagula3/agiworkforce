/**
 * The one cold-load skeleton for the chat surface.
 *
 * There were two byte-identical copies of this — one inside `WebChatRoot` and
 * one as the route-level `app/chat/loading.tsx` — each wrapped in its own
 * `dynamic()` call with its own `loading` fallback. Nothing made them agree,
 * so the next edit to either would have produced two different spinners for
 * the same wait.
 */
export function ChatLoadingSkeleton() {
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
