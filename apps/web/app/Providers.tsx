'use client';

import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import { WaitlistModalProvider } from '@/features/marketing/components/WaitlistModal';
import { ThemeProvider } from '@shared/components/ThemeProvider';
import { SonnerToaster } from '@agiworkforce/ui/sonner';
import { configureArtifactSandboxOrigin } from '@agiworkforce/unified-chat/artifact-sandbox';
import { getSandboxOrigin } from '@/lib/artifact-sandbox';

const TOASTS_CLEAR_OF_APP_HEADER = { top: 56 } as const;

export default function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  configureArtifactSandboxOrigin(getSandboxOrigin());
  return (
    <ThemeProvider nonce={nonce}>
      <I18nextProvider i18n={i18n}>
        <WaitlistModalProvider>
          {children}
          <SonnerToaster
            position="top-center"
            offset={TOASTS_CLEAR_OF_APP_HEADER}
            mobileOffset={TOASTS_CLEAR_OF_APP_HEADER}
            richColors
            closeButton
          />
        </WaitlistModalProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}
