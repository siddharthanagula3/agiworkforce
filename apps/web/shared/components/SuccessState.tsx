'use client';

import React from 'react';
import { ArrowRight, Check } from 'lucide-react';

interface SuccessStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ElementType;
}

interface SuccessStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: SuccessStateAction;
  className?: string;
}

/**
 * The settled counterpart to {@link EmptyState}: an outcome that already
 * happened and needs no dismissing, as opposed to a toast, which disappears
 * before a screen-reader user or anyone who looked away has read it.
 *
 * `role="status"` rather than `role="alert"` so it is announced politely, at
 * the next pause, instead of interrupting whatever is being read.
 */
export function SuccessState({
  icon: Icon = Check,
  title,
  description,
  action,
  className,
}: SuccessStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 py-14 px-6 text-center',
        className ?? '',
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
        <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>
      <div className="max-w-xs space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground/70">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          {action.icon ? <action.icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          {action.label}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default SuccessState;
