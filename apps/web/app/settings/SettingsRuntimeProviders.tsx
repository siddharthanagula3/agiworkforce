'use client';

import type { ReactNode } from 'react';
import { CapabilityProvider } from '@agiworkforce/unified-chat/capabilities';
import { AppearancePreferences } from '@shared/components/AppearancePreferences';
import { OfflineIndicator } from '@shared/components/OfflineIndicator';
import { SessionTimeoutGuard } from '@shared/components/SessionTimeoutGuard';
import { TelemetryConsentSync } from '@shared/components/TelemetryConsentSync';
import { useEmbeddedAccountPage } from '@shared/components/layout/EmbeddedPage';
import { QueryProvider } from '@shared/stores/query-client';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { CloudSettingsSync } from '@/features/settings/components/CloudSettingsSync';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

/**
 * The account page the phone app opens mounts none of the product runtime that
 * can lead to a purchase: no command palette, no settings dialog behind a
 * hash, no checkout confirmation and no product notices. What stays is what
 * the account and security sections need to work and stay secure.
 */
function EmbeddedAccountRuntimeProviders({ children }: { children: ReactNode }) {
  const capabilityDocument = useBillingStore((state) => state.capabilityDocument);
  return (
    <CapabilityProvider platform="web" document={capabilityDocument}>
      <QueryProvider>
        <AppearancePreferences />
        <TelemetryConsentSync />
        <CloudSettingsSync />
        <SessionTimeoutGuard />
        <OfflineIndicator />
        {children}
      </QueryProvider>
    </CapabilityProvider>
  );
}

export function SettingsRuntimeProviders({ children }: { children: ReactNode }) {
  return useEmbeddedAccountPage() ? (
    <EmbeddedAccountRuntimeProviders>{children}</EmbeddedAccountRuntimeProviders>
  ) : (
    <ProductRuntimeProviders>{children}</ProductRuntimeProviders>
  );
}
