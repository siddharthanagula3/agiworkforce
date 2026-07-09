import type { HTMLAttributes } from 'react';
import { Badge } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';

/**
 * Thin wrapper over @agiworkforce/ui Badge that adds the chat package's
 * domain variants (result/script/file/byok/local), styled with the live
 * --chat-badge-* tokens from @agiworkforce/design-tokens/chat.css.
 *
 * Uses the pkg Badge's `outline` variant as a base (no fill, no hover tint)
 * so only color is overridden per domain variant — `border-transparent`
 * cancels the outline variant's visible border.
 */
interface ChatBadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'result' | 'script' | 'file' | 'byok' | 'local';
}

export function ChatBadge({ className, variant = 'default', ...props }: ChatBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent px-2 py-0.5 text-[11px] font-medium',
        {
          'bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)]': variant === 'default',
          'bg-[var(--chat-badge-result)]/20 text-[var(--chat-badge-result)]': variant === 'result',
          'bg-[var(--chat-surface-hover)] text-[var(--chat-badge-neutral)]':
            variant === 'script' || variant === 'file',
          'bg-[var(--chat-accent-secondary)]/15 text-[var(--chat-accent-secondary)]':
            variant === 'byok',
          'bg-[var(--chat-info)]/15 text-[var(--chat-info)]': variant === 'local',
        },
        className,
      )}
      {...props}
    />
  );
}
