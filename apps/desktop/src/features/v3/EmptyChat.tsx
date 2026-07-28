/**
 * v3 empty-chat surface.
 *
 * Renders the centered, time-aware branded greeting in the empty chat content
 * area. Mirrors the Claude web empty-state structure (a centered greeting block
 * above the composer — ref: claude_reference/015_web-free__home-composer.png)
 * while keeping AGI's own brand styling. Height is deliberately intrinsic, not
 * `h-full`: ChatInterface centres the greeting + composer as one group in the
 * empty state, and an `h-full` slot would re-open the dead gap between them.
 */
import { BrandedGreeting } from '../chat/BrandedGreeting';

export function EmptyChat() {
  return (
    <div className="flex w-full flex-col items-center justify-center px-6 pb-6">
      <BrandedGreeting />
    </div>
  );
}
