import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-[var(--chat-radius-md)] font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
          'disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-[var(--chat-accent-primary)] text-white hover:opacity-90': variant === 'default',
            'hover:bg-[var(--chat-surface-hover)]': variant === 'ghost',
            'border border-[var(--chat-border)] hover:bg-[var(--chat-surface-hover)]':
              variant === 'outline',
            'bg-[var(--chat-destructive)] text-white hover:opacity-90': variant === 'destructive',
          },
          {
            'h-8 px-3 text-sm': size === 'sm',
            'h-9 px-4 text-sm': size === 'md',
            'h-10 px-6': size === 'lg',
            'h-8 w-8 p-0': size === 'icon',
          },
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
