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
import { useThemeColors } from '@/hooks/useTheme';
import { useIntegrationStore } from '@/stores/integrationStore';
import { ConnectorItem } from '@/components/connectors/ConnectorItem';
import {
  CONNECTORS,
  CONNECTOR_CATEGORIES,
  type Connector,
  type ConnectorCategory,
} from '@/components/connectors/connectorData';

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
  const connectConnector = useIntegrationStore((s) => s.connectConnector);
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

  const handleConnect = useCallback(
    (connectorId: string) => {
      const connector = CONNECTORS.find((c) => c.id === connectorId);
      const name = connector?.name ?? connectorId;

      Alert.alert(`Connect ${name}?`, `This will open ${name} to authorize access.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Connect',
          onPress: () => connectConnector(connectorId),
        },
      ]);
    },
    [connectConnector],
  );

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

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 h-12">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
            }}
            className="p-2 -ml-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={20} color={colors.textSecondary} />
          </Pressable>
          <Link2 size={20} color={colors.teal} />
          <Text variant="subheading" className="text-white">
            Connectors
          </Text>
        </View>
        {activeCount > 0 && (
          <View className="bg-teal-500/15 px-2.5 py-1 rounded-full">
            <Text className="text-[12px] font-medium" style={{ color: colors.teal }}>
              {activeCount} active
            </Text>
          </View>
        )}
      </View>

      {/* Description */}
      <View className="px-4 pb-2">
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
          <View className="px-4 pt-5 pb-1">
            <View className="flex-row items-center gap-2 mb-1">
              <Text
                className="text-[12px] font-semibold uppercase tracking-wider"
                style={{ color: colors.textMuted }}
              >
                {section.title}
              </Text>
            </View>
            <View className="h-px bg-white/8" />
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
          <View className="flex-1 items-center justify-center px-8 py-20">
            <Text className="text-[15px] text-center" style={{ color: colors.textMuted }}>
              No connectors available.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
