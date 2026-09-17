/**
 * The one cold-load skeleton for the chat surface.
 *
 * There were two byte-identical copies of this, one inside `WebChatRoot` and
 * one as the route-level `app/chat/loading.tsx`, each wrapped in its own
 * `dynamic()` call with its own `loading` fallback. Nothing made them agree,
 * so the next edit to either would have produced two different spinners for
 * the same wait.
 */
import { Spinner } from '@agiworkforce/ui';

export function ChatLoadingSkeleton() {
  return (
    <div aria-busy="true" className="fixed inset-0 flex items-center justify-center">
      <Spinner
        size="lg"
        aria-label="Loading chat"
        className="text-[var(--chat-loading-indicator)]"
      />
    </div>
  );
}
