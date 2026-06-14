/**
 * Connectors — service integrations with categorized toggle list.
 *
 * Pattern: Perplexity-style toggle list.
 * - Connected services show a toggle switch (teal when enabled).
 * - Available services show a "Connect" outline button.
 * - Grouped by category: Cloud Storage, Productivity, Communication, Email & Calendar.
 */

import { useCallback, useMemo, useState } from 'react';
import { View, SectionList, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Cloud, Link2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { InviteCodeModal } from '@/src/features/cloud-bridge';
import type { InviteCodeTab } from '@/src/features/cloud-bridge/types';
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState<InviteCodeTab>('invite');
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

  const openCloudAccess = useCallback((tab: InviteCodeTab) => {
    setDefaultTab(tab);
    setInviteOpen(true);
  }, []);

  const handleConnect = useCallback(
    (connectorId: string) => {
      const connector = CONNECTORS.find((c) => c.id === connectorId);
      const name = connector?.name ?? connectorId;

      Alert.alert(`Connect ${name}?`, `${name} connectors require AGI Cloud access.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open AGI Cloud',
          onPress: () => openCloudAccess('invite'),
        },
      ]);
    },
    [openCloudAccess],
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

  if (!FEATURES.connectors) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View
          style={{
            minHeight: 52,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Pressable
            onPress={handleBack}
            style={{ padding: 8, marginLeft: -8, borderRadius: 12 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={{ color: colors.textPrimary, fontSize: 21, fontWeight: '700' }}>
            Connectors
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            paddingHorizontal: 24,
            justifyContent: 'center',
            paddingBottom: 72,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 18,
            }}
          >
            <Cloud size={25} color={colors.textSecondary} strokeWidth={1.8} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 28, fontWeight: '700' }}>
            AGI Cloud connectors
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 16,
              lineHeight: 23,
              marginTop: 10,
            }}
          >
            Connectors are available with AGI Cloud. Local Mode remains private and separate.
          </Text>

          <View style={{ gap: 10, marginTop: 30 }}>
            <Pressable
              onPress={() => openCloudAccess('invite')}
              accessibilityRole="button"
              accessibilityLabel="Enter invite code"
              style={{
                minHeight: 52,
                borderRadius: 16,
                backgroundColor: colors.teal,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 18,
              }}
            >
              <Text style={{ color: colors.accentText, fontSize: 16, fontWeight: '700' }}>
                Enter invite code
              </Text>
            </Pressable>
            <Pressable
              onPress={() => openCloudAccess('waitlist')}
              accessibilityRole="button"
              accessibilityLabel="Join waitlist"
              style={{
                minHeight: 52,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 18,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>
                Join waitlist
              </Text>
            </Pressable>
          </View>
        </View>

        <InviteCodeModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          source="connectors"
          defaultTab={defaultTab}
        />
      </SafeAreaView>
    );
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
      <InviteCodeModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        source="connectors"
        defaultTab={defaultTab}
      />
    </SafeAreaView>
  );
}
