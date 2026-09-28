'use client';

import type { ReactNode } from 'react';
import { CapabilityProvider } from '@agiworkforce/unified-chat/capabilities';
import { SettingsModalProvider } from '@/features/settings/components/SettingsModalProvider';
import { QueryProvider } from '@shared/stores/query-client';
import { useBillingStore } from '@shared/stores/web-auth-store';
import AppRuntimeMounts from './AppRuntimeMounts';

export default function ProductRuntimeProviders({ children }: { children: ReactNode }) {
  const capabilityDocument = useBillingStore((state) => state.capabilityDocument);
  return (
    <CapabilityProvider platform="web" document={capabilityDocument}>
      <QueryProvider>
        <AppRuntimeMounts />
        <SettingsModalProvider>{children}</SettingsModalProvider>
      </QueryProvider>
    </CapabilityProvider>
  );
}
