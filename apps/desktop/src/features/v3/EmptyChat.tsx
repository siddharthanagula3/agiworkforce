/**
 * v3 empty-chat surface.
 *
 * Renders the centered, time-aware branded greeting in the empty chat content
 * area. Mirrors the Claude web empty-state structure (a centered greeting block
 * above the composer — ref: claude_reference/015_web-free__home-composer.png)
 * while keeping AGI's own brand styling. The composer stays pinned at the bottom
 * per the v3 layout (ChatInterface keeps the input area in natural flow); this
 * fills the `emptyStateSlot` so the empty chat is no longer a blank canvas.
 */
import { BrandedGreeting } from '../chat/BrandedGreeting';

export function EmptyChat() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6">
      <BrandedGreeting />
    </div>
  );
}
