
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../lib/utils';

export type BadgeNotificationType = 'alert' | 'info' | 'success';

export interface ChatNotificationBadgeProps {
  count: number;
  type?: BadgeNotificationType;
  className?: string;
}

const BG_CLASS: Record<BadgeNotificationType, string> = {
  alert: 'bg-red-500',
  info: 'bg-blue-500',
  success: 'bg-green-500',
};

function formatCount(count: number): string {
  if (count <= 1) return '';
  if (count > 99) return '99+';
  return String(count);
}

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
