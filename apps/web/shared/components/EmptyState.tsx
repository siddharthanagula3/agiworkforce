'use client';

/**
 * EmptyState — consistent empty state for list and grid views on the web app.
 *
 * Matches the glassmorphism surface style used across the web dashboard.
 *
 * Usage:
 *   <EmptyState
 *     icon={MessageSquare}
 *     title="No conversations yet"
 *     description="Start a new chat to get going."
 *     action={{ label: 'Start Chat', onClick: () => router.push('/chat') }}
 *   />
 */

import React from 'react';
import { ArrowRight } from 'lucide-react';

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
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 py-14 px-6 text-center',
        className ?? '',
      ].join(' ')}
      role="status"
      aria-label={title}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
          <Icon className="h-6 w-6 text-muted-foreground/30" />
        </div>
      )}
      <div className="max-w-xs space-y-1">
        <p className="text-sm font-medium text-muted-foreground/70">{title}</p>
        {description && <p className="text-xs text-muted-foreground/50">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {action.icon ? <action.icon className="h-3.5 w-3.5" /> : null}
          {action.label}
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default EmptyState;
