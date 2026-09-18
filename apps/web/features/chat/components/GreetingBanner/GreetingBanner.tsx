'use client';

import { BrandedGreeting } from '@agiworkforce/unified-chat';
import { useGreeting } from './useGreeting';

interface GreetingBannerProps {
  busy?: boolean;
}

export function GreetingBanner({ busy = false }: GreetingBannerProps) {
  const { headline } = useGreeting();

  return <BrandedGreeting headline={headline} busy={busy} />;
}
