'use client';

import type { ReactNode } from 'react';
import { CapabilityProvider } from '@agiworkforce/unified-chat/capabilities';
import { SettingsModalProvider } from '@/features/settings/components/SettingsModalProvider';
import { QueryProvider } from '@shared/stores/query-client';
import AppRuntimeMounts from './AppRuntimeMounts';

export default function ProductRuntimeProviders({ children }: { children: ReactNode }) {
  return (
    <CapabilityProvider platform="web">
      <QueryProvider>
        <AppRuntimeMounts />
        <SettingsModalProvider>{children}</SettingsModalProvider>
      </QueryProvider>
    </CapabilityProvider>
  );
}
