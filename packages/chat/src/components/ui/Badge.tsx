import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'result' | 'script' | 'file' | 'byok' | 'local';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
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
