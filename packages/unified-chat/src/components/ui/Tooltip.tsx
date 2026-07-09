import type { ReactNode } from 'react';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@agiworkforce/ui';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Thin wrapper over @agiworkforce/ui's compound Tooltip that keeps this
 * package's simple (content, children, side) call-site API.
 *
 * Each instance carries its own TooltipProvider rather than relying on one
 * shared provider up the tree: call sites (Sidebar, ConversationItem,
 * UserProfile, TokenCounter) are mounted in different, non-overlapping
 * subtrees across host apps (e.g. both web and desktop currently render
 * ChatInterface with `sidebarSlot={null}`), so no single ancestor reliably
 * covers all of them. Radix's TooltipTrigger/Content throw if rendered
 * without a Provider ancestor, so this is required, not just defensive.
 * Matches the existing per-instance Tooltip.Provider pattern already used in
 * AgentControl.tsx.
 */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <UiTooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}
