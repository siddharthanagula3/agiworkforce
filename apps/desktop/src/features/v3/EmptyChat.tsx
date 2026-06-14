/**
 * v3 empty-chat surface.
 *
 * Per founder request (2026-06-13), the welcome greeting and mode badge are
 * intentionally not rendered — the empty chat is composer-only. Kept as a
 * mount point (wired via ChatInterface `emptyStateSlot`) so a future
 * empty-state treatment can be reintroduced without re-threading the slot.
 */
export function EmptyChat() {
  return null;
}
