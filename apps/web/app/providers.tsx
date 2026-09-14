'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import { QueryProvider } from '@shared/stores/query-client';
import { WaitlistModalProvider } from '@/features/marketing/components/WaitlistModal';
import { SettingsModalProvider } from '@/features/settings/components/SettingsModalProvider';
import { ThemeProvider } from '@shared/components/ThemeProvider';
import { SonnerToaster } from '@agiworkforce/ui';
import { CapabilityProvider } from '@agiworkforce/unified-chat/capabilities';
import { SupportWidgetMount } from '@/features/support/components/SupportWidgetMount';
import { isAppRoutePath } from '@/lib/app-routes';

const AppRuntimeMounts = dynamic(() => import('./AppRuntimeMounts'), { ssr: false });

export default function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  const pathname = usePathname();
  return (
    <ThemeProvider nonce={nonce}>
      <CapabilityProvider platform="web">
        <QueryProvider>
          <I18nextProvider i18n={i18n}>
            <WaitlistModalProvider>
              {isAppRoutePath(pathname) && <AppRuntimeMounts />}
              <SettingsModalProvider>{children}</SettingsModalProvider>
              {/* Global support widget. Renders nothing unless
                  NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED === '1'. */}
              <SupportWidgetMount />
              <SonnerToaster position="top-center" richColors closeButton />
            </WaitlistModalProvider>
          </I18nextProvider>
        </QueryProvider>
      </CapabilityProvider>
    </ThemeProvider>
  );
}
