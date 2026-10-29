import React from 'react';
import { AgiMark } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';

interface TypingIndicatorProps {
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ className }) => {
  return (
    <div
      className={cn('mx-auto w-full max-w-3xl px-gutter-compact py-1.5', className)}
      data-testid="typing-indicator"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AgiMark size={16} spinning className="animate-spin motion-reduce:animate-none" />
        <span>Preparing</span>
      </div>
    </div>
  );
};
