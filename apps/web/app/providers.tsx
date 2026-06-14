'use client';

import { I18nextProvider } from 'react-i18next';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import i18n from './i18n';
import { QueryProvider } from '@shared/stores/query-client';
import { CommandPaletteProvider } from '@/components/CommandPalette/CommandPaletteProvider';
import { WaitlistModalProvider } from '@/components/marketing/WaitlistModal';
import { ThemeProvider } from '@shared/components/ThemeProvider';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { seoService } from '@core/monitoring/seo-optimizer';

// i18n is initialized synchronously at module import time (see app/i18n/index.ts).
// No async gate needed · rendering immediately prevents the blank-screen flash
// that occurred when this component returned null on its first render cycle.
export default function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  // Initialize SEO service for marketing pages (structured data, meta tags)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      seoService.initialize();
    }
  }, []);

  return (
    <QueryProvider>
      <ThemeProvider nonce={nonce}>
        <I18nextProvider i18n={i18n}>
          <WaitlistModalProvider>
            {children}
            <CommandPaletteProvider />
            <OfflineIndicator position="bottom" />
            <Toaster position="top-center" richColors closeButton />
          </WaitlistModalProvider>
        </I18nextProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
