/**
 * ChatNotificationBadge
 *
 * A small circular badge used on sidebar conversation items and nav icons to
 * surface unread counts and agent completion alerts.
 *
 * Rendering rules:
 *  - count === 0 → nothing rendered (null)
 *  - count === 1 → dot only (no number), sized to 18 × 18 px
 *  - count  >= 2 → number inside badge, capped at "99+" for three-digit counts
 *
 * Color variants:
 *  - 'alert'   → red-500   (needs approval / agent blocked)
 *  - 'info'    → blue-500  (regular update)
 *  - 'success' → green-500 (agent task completed)
 *
 * Entrance animation: scale from 0 → 1 via framer-motion so the badge pops
 * into existence rather than appearing abruptly.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

export type BadgeNotificationType = 'alert' | 'info' | 'success';

export interface ChatNotificationBadgeProps {
  /** Number of unread items. Badge is hidden when 0. */
  count: number;
  /** Visual variant controlling badge colour. */
  type?: BadgeNotificationType;
  /** Additional class names applied to the badge wrapper. */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/** Map notification type → Tailwind background class. */
const BG_CLASS: Record<BadgeNotificationType, string> = {
  alert: 'bg-red-500',
  info: 'bg-blue-500',
  success: 'bg-green-500',
};

/**
 * Format count for display. Returns an empty string for 1 (dot-only mode),
 * "99+" for anything above 99, or the raw number string otherwise.
 */
function formatCount(count: number): string {
  if (count <= 1) return '';
  if (count > 99) return '99+';
  return String(count);
}

// =============================================================================
// Component
// =============================================================================

export function ChatNotificationBadge({
  count,
  type = 'info',
  className,
}: ChatNotificationBadgeProps) {
  const label = formatCount(count);
  const bgClass = BG_CLASS[type];

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key="badge"
          role="status"
          aria-label={`${count} unread`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={cn(
            'absolute -top-1 -right-1 flex items-center justify-center',
            'min-w-[18px] h-[18px] rounded-full',
            'text-[10px] text-white font-bold leading-none',
            'ring-2 ring-[hsl(var(--card))]',
            bgClass,
            /* When showing a dot only (count === 1) tighten to a perfect circle */
            label === '' && 'min-w-[10px] h-[10px] -top-0.5 -right-0.5',
            className,
          )}
        >
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
