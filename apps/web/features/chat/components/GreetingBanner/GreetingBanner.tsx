'use client';

import { useTranslation } from 'react-i18next';
import { BrandedGreeting } from '@agiworkforce/unified-chat';
import { NewChatWorkspace } from './NewChatWorkspace';
import { useGreeting } from './useGreeting';

interface GreetingBannerProps {
  showWorkspace?: boolean;
  agiWork?: boolean;
}

export function GreetingBanner({ showWorkspace = false, agiWork = false }: GreetingBannerProps) {
  const { headline: greeting } = useGreeting();
  const { t } = useTranslation('v3');
  const headline = agiWork ? t('agiWork.home.headline') : greeting;

  if (!showWorkspace) return <BrandedGreeting headline={headline} />;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <BrandedGreeting headline={headline} />
      <NewChatWorkspace />
    </div>
  );
}
