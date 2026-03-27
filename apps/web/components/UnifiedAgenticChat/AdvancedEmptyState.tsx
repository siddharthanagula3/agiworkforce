/**
 * Advanced Empty State
 *
 * Keeps the landing view disciplined: one headline, one composer.
 */
import React from 'react';
import { cn } from '@/lib/utils';

interface AdvancedEmptyStateProps {
  onSuggestionClick?: (text: string) => void;
  className?: string;
}

export const AdvancedEmptyState: React.FC<AdvancedEmptyStateProps> = ({ className }) => {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none flex min-h-[56vh] items-center justify-center px-6 pb-44 pt-10 text-center',
        className,
      )}
    >
      <h1 className="max-w-3xl text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
        What’s on your mind today?
      </h1>
    </div>
  );
};

export default AdvancedEmptyState;
