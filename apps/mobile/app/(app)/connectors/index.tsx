/**
 * Connectors — service integrations with categorized toggle list.
 *
 * Pattern: Perplexity-style toggle list.
 * - Connected services show a toggle switch (teal when enabled).
 * - Available services show a "Connect" outline button.
 * - Grouped by category: Cloud Storage, Productivity, Communication, Email & Calendar.
 */

import { useCallback, useMemo } from 'react';
import { View, SectionList, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Link2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useThemeColors } from '@/src/ui/theme';
import { useIntegrationStore } from '@/src/features/integrations/store';
import { ConnectorItem } from '@/src/features/connectors/components/ConnectorItem';
import {
  CONNECTORS,
  CONNECTOR_CATEGORIES,
  type Connector,
  type ConnectorCategory,
} from '@/src/features/connectors/components/connectorData';

// ---------------------------------------------------------------------------
// Section type for SectionList
// ---------------------------------------------------------------------------

interface ConnectorSection {
  key: ConnectorCategory;
  title: string;
  data: Connector[];
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ConnectorsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const connectedConnectors = useIntegrationStore((s) => s.connectedConnectors);
  const enabledConnectors = useIntegrationStore((s) => s.enabledConnectors);
  const disconnectConnector = useIntegrationStore((s) => s.disconnectConnector);
  const toggleConnector = useIntegrationStore((s) => s.toggleConnector);

  // Build SectionList data from static connector list + categories
  const sections = useMemo<ConnectorSection[]>(() => {
    return CONNECTOR_CATEGORIES.map((cat) => ({
      key: cat.key,
      title: cat.title,
      data: CONNECTORS.filter((c) => c.category === cat.key),
    }));
  }, []);

  // Count of connected + enabled connectors
  const activeCount = useMemo(() => {
    return Object.entries(enabledConnectors).filter(
      ([id, enabled]) => enabled && connectedConnectors[id],
    ).length;
  }, [connectedConnectors, enabledConnectors]);

  // -- Handlers ---------------------------------------------------------------

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleConnect = useCallback((connectorId: string) => {
    // Unreachable while !FEATURES.connectors — the catalog this screen renders
    // only appears when the flag is on. Kept as a defensive fallback with
    // accurate copy: connectors are gated by the feature flag (not built for
    // mobile yet), not by AGI Cloud sign-in — matching the pattern already
    // fixed in settings/cloud-connectors/index.tsx's WaitlistPlaceholder.
    const connector = CONNECTORS.find((c) => c.id === connectorId);
    const name = connector?.name ?? connectorId;

    Alert.alert(
      `Connect ${name}`,
      'OAuth flow will open in your browser when AGI Cloud connectors are active.',
      [{ text: 'OK' }],
    );
  }, []);

  const handleToggle = useCallback(
    (connectorId: string, enabled: boolean) => {
      if (!enabled) {
        const connector = CONNECTORS.find((c) => c.id === connectorId);
        const name = connector?.name ?? connectorId;

        Alert.alert(
          `Disconnect ${name}?`,
          `${name} will no longer be available to AI assistants.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Disconnect',
              style: 'destructive',
              onPress: () => disconnectConnector(connectorId),
            },
          ],
        );
      } else {
        toggleConnector(connectorId, true);
      }
    },
    [disconnectConnector, toggleConnector],
  );

  // -- Render -----------------------------------------------------------------

  // Connectors are gated by the feature flag (not built for mobile yet), not
  // by AGI Cloud sign-in — a signed-in Pro/Max user would otherwise see a
  // misleading "Enter invite code / Join waitlist" screen implying AGI Cloud
  // itself is invite-gated, which hasn't been true since public alpha opened
  // (founder decision, 2026-06-27). Matches the honest, no-false-affordance
  // pattern already used by Schedules/Companion (FeatureUnavailable).
  if (!FEATURES.connectors) {
    return <FeatureUnavailable feature="Connectors" />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          minHeight: 52,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={handleBack}
            style={{ padding: 8, marginLeft: -8, borderRadius: 12 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={20} color={colors.textSecondary} />
          </Pressable>
          <Link2 size={20} color={colors.teal} />
          <Text variant="subheading" style={{ color: colors.textPrimary }}>
            Connectors
          </Text>
        </View>
        {activeCount > 0 && (
          <View
            style={{
              backgroundColor: colors.accentSurface,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
            }}
          >
            <Text className="text-[12px] font-medium" style={{ color: colors.teal }}>
              {activeCount} active
            </Text>
          </View>
        )}
      </View>

      {/* Description */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text className="text-[13px] leading-[18px]" style={{ color: colors.textMuted }}>
          Connect your tools and services. AI assistants use these to search, create, and manage
          content on your behalf.
        </Text>
      </View>

      {/* Connector list */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderSectionHeader={({ section }) => (
          <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text
                className="text-[12px] font-semibold uppercase tracking-wider"
                style={{ color: colors.textMuted }}
              >
                {section.title}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.borderLight }} />
          </View>
        )}
        renderItem={({ item }) => (
          <ConnectorItem
            id={item.id}
            name={item.name}
            description={item.description}
            isConnected={!!connectedConnectors[item.id]}
            isEnabled={!!enabledConnectors[item.id]}
            onToggle={handleToggle}
            onConnect={handleConnect}
          />
        )}
        renderSectionFooter={() => <View className="h-1" />}
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 32,
              paddingVertical: 80,
            }}
          >
            <Text className="text-[15px] text-center" style={{ color: colors.textMuted }}>
              No connectors available.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
