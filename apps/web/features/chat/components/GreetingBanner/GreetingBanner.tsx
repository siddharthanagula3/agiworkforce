'use client';

import { BrandedGreeting } from '@agiworkforce/unified-chat';
import { NewChatWorkspace } from './NewChatWorkspace';
import { useGreeting } from './useGreeting';

interface GreetingBannerProps {
  busy?: boolean;
  showWorkspace?: boolean;
}

export function GreetingBanner({ busy = false, showWorkspace = false }: GreetingBannerProps) {
  const { headline } = useGreeting();

  if (!showWorkspace) return <BrandedGreeting headline={headline} busy={busy} />;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <BrandedGreeting headline={headline} busy={busy} />
      <NewChatWorkspace />
    </div>
  );
}
