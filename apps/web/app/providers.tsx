'use client';

import { I18nextProvider } from 'react-i18next';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import i18n from './i18n';
import { QueryProvider } from '@shared/stores/query-client';
import { CommandPaletteProvider } from '@shared/components/CommandPalette/CommandPaletteProvider';
import { WaitlistModalProvider } from '@/features/marketing/components/WaitlistModal';
import { SettingsModalProvider } from '@/features/settings/components/SettingsModalProvider';
import { ThemeProvider } from '@shared/components/ThemeProvider';
import { CapabilityProvider } from '@agiworkforce/unified-chat';
import { OfflineIndicator } from '@shared/components/OfflineIndicator';
import { SessionTimeoutGuard } from '@shared/components/SessionTimeoutGuard';
import { SupportWidgetMount } from '@/features/support/components/SupportWidgetMount';
import { seoService } from '@/lib/seo/seo-optimizer';

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
    <ThemeProvider nonce={nonce}>
      <CapabilityProvider platform="web">
        <QueryProvider>
          <I18nextProvider i18n={i18n}>
            <WaitlistModalProvider>
              <SettingsModalProvider>{children}</SettingsModalProvider>
              <CommandPaletteProvider />
              <OfflineIndicator position="bottom" />
              <SessionTimeoutGuard />
              {/* Global support widget. Renders nothing unless
                  NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED === '1'. */}
              <SupportWidgetMount />
              <Toaster position="top-center" richColors closeButton />
            </WaitlistModalProvider>
          </I18nextProvider>
        </QueryProvider>
      </CapabilityProvider>
    </ThemeProvider>
  );
}
