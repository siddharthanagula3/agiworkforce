'use client';

import { cn } from '@shared/lib/utils';
import { MessageBubbleSkeleton } from './MessageBubbleSkeleton';

interface ChatLoadingStateProps {
  count?: number;
  animation?: 'pulse' | 'wave' | 'none';
  className?: string;
}

export function ChatLoadingState({
  count = 4,
  animation = 'pulse',
  className,
}: ChatLoadingStateProps) {
  const skeletons = Array.from({ length: count }, (_, index) => {
    const isUser = index % 2 === 0;
    const lines = isUser ? 1 : index % 4 === 1 ? 3 : 2;
    return { isUser, lines };
  });

  return (
    <div
      className={cn('flex h-full flex-col overflow-y-auto', className)}
      aria-label="Loading conversation history"
      aria-live="polite"
    >
      {/* Spacer that pushes the skeletons toward the bottom, matching MessageListNew */}
      <div className="flex-1" />

      <div>
        {skeletons.map(({ isUser, lines }, index) => (
          <MessageBubbleSkeleton key={index} isUser={isUser} lines={lines} animation={animation} />
        ))}
      </div>
    </div>
  );
}

ChatLoadingState.displayName = 'ChatLoadingState';
