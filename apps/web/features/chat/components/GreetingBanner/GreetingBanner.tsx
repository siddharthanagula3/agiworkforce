'use client';

import { cn } from '@shared/lib/utils';
import { useGreeting } from './useGreeting';

interface GreetingBannerProps {
  visible: boolean;
}

export function GreetingBanner({ visible }: GreetingBannerProps) {
  const { headline, emoji, subtext } = useGreeting();

  return (
    <div
      className={cn(
        'text-center transition-opacity duration-500',
        visible
          ? 'animate-in fade-in slide-in-from-bottom-1 duration-500 motion-reduce:animate-none'
          : 'opacity-0',
      )}
    >
      <h1 className="text-2xl font-semibold text-foreground">
        {headline} <span aria-hidden="true">{emoji}</span>
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtext}</p>
    </div>
  );
}
