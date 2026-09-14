'use client';

import { AppearancePreferences } from '@shared/components/AppearancePreferences';
import { TelemetryConsentSync } from '@shared/components/TelemetryConsentSync';
import { CloudSettingsSync } from '@/features/settings/components/CloudSettingsSync';
import { CommandPaletteProvider } from '@shared/components/CommandPalette/CommandPaletteProvider';
import { SessionTimeoutGuard } from '@shared/components/SessionTimeoutGuard';
import { ConnectorOutcomeAnnouncer } from '@/features/connectors/components/ConnectorOutcomeAnnouncer';
import { DesktopHostMount } from '@/features/desktop-host';
import { OfflineIndicator } from '@shared/components/OfflineIndicator';

export default function AppRuntimeMounts() {
  return (
    <>
      <AppearancePreferences />
      <TelemetryConsentSync />
      <CloudSettingsSync />
      <CommandPaletteProvider />
      <SessionTimeoutGuard />
      <ConnectorOutcomeAnnouncer />
      <DesktopHostMount />
      <OfflineIndicator position="bottom" />
    </>
  );
}
