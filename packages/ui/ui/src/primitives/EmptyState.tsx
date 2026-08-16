import * as React from 'react';
import { cn } from '../cn';

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
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 px-6 text-center',
        className,
      )}
      role="status"
      aria-label={title}
    >
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
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
