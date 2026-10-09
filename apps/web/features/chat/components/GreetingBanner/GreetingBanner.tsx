'use client';

import { BrandedGreeting } from '@agiworkforce/unified-chat';
import { NewChatWorkspace } from './NewChatWorkspace';
import { useGreeting } from './useGreeting';

interface GreetingBannerProps {
  showWorkspace?: boolean;
}

export function GreetingBanner({ showWorkspace = false }: GreetingBannerProps) {
  const { headline } = useGreeting();

  if (!showWorkspace) return <BrandedGreeting headline={headline} />;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <BrandedGreeting headline={headline} />
      <NewChatWorkspace />
    </div>
  );
}
