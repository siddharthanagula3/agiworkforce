'use client';

import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import { WaitlistModalProvider } from '@/features/marketing/components/WaitlistModal';
import { ThemeProvider } from '@shared/components/ThemeProvider';
import { SonnerToaster } from '@agiworkforce/ui/sonner';

export default function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <ThemeProvider nonce={nonce}>
      <I18nextProvider i18n={i18n}>
        <WaitlistModalProvider>
          {children}
          <SonnerToaster position="top-center" richColors closeButton />
        </WaitlistModalProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}
