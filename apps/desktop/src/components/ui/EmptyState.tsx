/**
 * EmptyState — consistent empty state UI for list and grid views.
 *
 * Shows an icon, title, optional description, and an optional action button.
 * Matches the desktop surface's card/border tokens.
 *
 * Usage:
 *   <EmptyState
 *     icon={MessageSquare}
 *     title="No conversations yet"
 *     description="Start a new chat to get going."
 *     action={{ label: 'New Chat', onClick: handleNew }}
 *   />
 */
import React from 'react';
import { cn } from '../../lib/utils';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ElementType;
}

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  /** Extra Tailwind classes for the wrapper */
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 px-6 text-center',
        className,
      )}
      role="status"
      aria-label={title}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
          <Icon className="w-6 h-6 text-muted-foreground/40" />
        </div>
      )}
      <div className="space-y-1 max-w-xs">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium',
            'bg-primary/10 text-primary hover:bg-primary/20 transition-colors',
          )}
        >
          {action.icon && <action.icon className="w-3.5 h-3.5" />}
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
