'use client';

import { I18nextProvider } from 'react-i18next';
import { Toaster } from 'sonner';
import i18n from './i18n';
import { QueryProvider } from '@shared/stores/query-client';
import { CommandPaletteProvider } from '@shared/components/CommandPalette/CommandPaletteProvider';
import { WaitlistModalProvider } from '@/features/marketing/components/WaitlistModal';
import { SettingsModalProvider } from '@/features/settings/components/SettingsModalProvider';
import { DirectoryModalProvider } from '@/features/directory';
import { ThemeProvider } from '@shared/components/ThemeProvider';
import { CapabilityProvider } from '@agiworkforce/unified-chat';
import { OfflineIndicator } from '@shared/components/OfflineIndicator';
import { AppearancePreferences } from '@shared/components/AppearancePreferences';
import { TelemetryConsentSync } from '@shared/components/TelemetryConsentSync';
import { SessionTimeoutGuard } from '@shared/components/SessionTimeoutGuard';
import { SupportWidgetMount } from '@/features/support/components/SupportWidgetMount';
import { ConnectorOutcomeAnnouncer } from '@/features/connectors/components/ConnectorOutcomeAnnouncer';

export default function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <ThemeProvider nonce={nonce}>
      <CapabilityProvider platform="web">
        <QueryProvider>
          <I18nextProvider i18n={i18n}>
            <WaitlistModalProvider>
              <AppearancePreferences />
              <TelemetryConsentSync />
              <SettingsModalProvider>
                <DirectoryModalProvider>{children}</DirectoryModalProvider>
              </SettingsModalProvider>
              <CommandPaletteProvider />
              <OfflineIndicator position="bottom" />
              <SessionTimeoutGuard />
              {/* Global support widget. Renders nothing unless
                  NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED === '1'. */}
              <SupportWidgetMount />
              <Toaster position="top-center" richColors closeButton />
              <ConnectorOutcomeAnnouncer />
            </WaitlistModalProvider>
          </I18nextProvider>
        </QueryProvider>
      </CapabilityProvider>
    </ThemeProvider>
  );
}
