import { useCallback, useRef, useState } from 'react';
import {
  View,
  Pressable,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import BottomSheet from '@gorhom/bottom-sheet';
import {
  ArrowLeft,
  Calendar,
  Users,
  Heart,
  CheckCircle,
  XCircle,
  HelpCircle,
  ExternalLink,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import {
  requestCalendarPermission,
  requestContactsPermission,
  getCalendarPermissionStatus,
  getContactsPermissionStatus,
  type PermissionStatus,
} from '@/src/features/integrations/services/deviceIntegrations';
import {
  isHealthAvailable,
  getHealthPermissionStatus,
  requestHealthPermission,
  type HealthPermissionStatus,
} from '@/src/features/integrations/services/healthData';
import { PlatformCard } from '@/src/features/integrations/components/PlatformCard';
import { DeviceIntegrationStatus } from '@/src/features/integrations/components/DeviceIntegrationStatus';
import { useIntegrationStore } from '@/src/features/integrations/store';
import { PlatformSetupSheet } from '@/src/features/messaging/components/PlatformSetupSheet';
import type { MessagingPlatform } from '@/src/features/messaging/store';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';

// ---------------------------------------------------------------------------
// Helpers (unchanged from original)
// ---------------------------------------------------------------------------

function statusLabel(status: PermissionStatus): string {
  switch (status) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'undetermined':
      return 'Not Asked';
  }
}

function statusBadgeColor(status: PermissionStatus): 'green' | 'red' | 'gray' {
  switch (status) {
    case 'granted':
      return 'green';
    case 'denied':
      return 'red';
    case 'undetermined':
      return 'gray';
  }
}

function StatusIcon({ status, colors }: { status: PermissionStatus; colors: ColorScheme }) {
  switch (status) {
    case 'granted':
      return <CheckCircle size={16} color={colors.agentSuccess} />;
    case 'denied':
      return <XCircle size={16} color={colors.agentError} />;
    case 'undetermined':
      return <HelpCircle size={16} color={colors.textMuted} />;
  }
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  count,
  colors,
}: {
  title: string;
  count?: number;
  colors: ColorScheme;
}) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: colors.textMuted }}
      >
        {title}
      </Text>
      {count !== undefined && (
        <Badge label={`${count} connected`} color={count > 0 ? 'teal' : 'gray'} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function IntegrationsScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  // -- Legacy permission state (Calendar / Contacts / Health) ---------------
  const [calendarStatus, setCalendarStatus] = useState<PermissionStatus>('undetermined');
  const [contactsStatus, setContactsStatus] = useState<PermissionStatus>('undetermined');
  const [healthStatus, setHealthStatus] = useState<HealthPermissionStatus>('undetermined');
  const healthAvailable = isHealthAvailable();
  const [isChecking, setIsChecking] = useState(true);

  // -- Messaging platform store ---------------------------------------------
  const { platforms, platformsLoading, connectPlatform, disconnectPlatform } =
    useIntegrationStore();

  // Bottom sheet for platform setup (reuses existing PlatformSetupSheet)
  const setupSheetRef = useRef<BottomSheet>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);

  // The PlatformSetupSheet expects a MessagingPlatform shape (whatsapp/telegram/slack only).
  // For the extended platforms we show a generic OAuth/Coming-soon alert.
  const legacyPlatformIds = new Set(['whatsapp', 'telegram', 'slack']);

  const selectedLegacyPlatform: MessagingPlatform | null = selectedPlatformId
    ? legacyPlatformIds.has(selectedPlatformId)
      ? {
          id: selectedPlatformId as MessagingPlatform['id'],
          name: platforms.find((p) => p.id === selectedPlatformId)?.name ?? selectedPlatformId,
          connected: false,
          connectedAt: null,
          config: {},
          stats: { messagesSent: 0, messagesReceived: 0, lastActive: null },
        }
      : null
    : null;

  const refreshPermissionStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const [calStat, conStat] = await Promise.allSettled([
        getCalendarPermissionStatus(),
        getContactsPermissionStatus(),
      ]);
      setCalendarStatus(calStat.status === 'fulfilled' ? calStat.value : 'undetermined');
      setContactsStatus(conStat.status === 'fulfilled' ? conStat.value : 'undetermined');

      if (!isHealthAvailable()) {
        setHealthStatus('unavailable');
        return;
      }

      const hStat = await getHealthPermissionStatus();
      setHealthStatus(hStat);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void refreshPermissionStatus().finally(() => {
        if (!active) setIsChecking(false);
      });
      return () => {
        active = false;
      };
    }, [refreshPermissionStatus]),
  );

  const openSystemSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  const handleCalendarToggle = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        Alert.alert(
          'Revoke Calendar Access',
          'To revoke calendar access, go to your device Settings and disable calendar permissions for this app.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: openSystemSettings },
          ],
        );
        return;
      }

      if (calendarStatus === 'denied') {
        Alert.alert(
          'Calendar Access Denied',
          'Calendar access was previously denied. Please enable it in your device Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: openSystemSettings },
          ],
        );
        return;
      }

      const granted = await requestCalendarPermission();
      setCalendarStatus(granted ? 'granted' : 'denied');
    },
    [calendarStatus, openSystemSettings],
  );

  const handleContactsToggle = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        Alert.alert(
          'Revoke Contacts Access',
          'To revoke contacts access, go to your device Settings and disable contacts permissions for this app.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: openSystemSettings },
          ],
        );
        return;
      }

      if (contactsStatus === 'denied') {
        Alert.alert(
          'Contacts Access Denied',
          'Contacts access was previously denied. Please enable it in your device Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: openSystemSettings },
          ],
        );
        return;
      }

      const granted = await requestContactsPermission();
      setContactsStatus(granted ? 'granted' : 'denied');
    },
    [contactsStatus, openSystemSettings],
  );

  // -- Messaging handlers ---------------------------------------------------

  const handleConnect = useCallback((platformId: string) => {
    if (legacyPlatformIds.has(platformId)) {
      setSelectedPlatformId(platformId);
      setupSheetRef.current?.expand();
    } else {
      Alert.alert(
        'Coming Soon',
        `${platformId.charAt(0).toUpperCase() + platformId.slice(1)} integration will be available in the next update. OAuth flow will open in your browser.`,
        [{ text: 'OK' }],
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = useCallback(
    (platformId: string) => {
      const platform = platforms.find((p) => p.id === platformId);
      Alert.alert(
        'Disconnect Platform',
        `Are you sure you want to disconnect ${platform?.name ?? platformId}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => disconnectPlatform(platformId),
          },
        ],
      );
    },
    [platforms, disconnectPlatform],
  );

  if (!FEATURES.connectors) return <FeatureUnavailable feature="Connectors" />;

  const connectedCount = platforms.filter((p) => p.connected).length;

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-4 h-12">
        <Pressable
          onPress={() => router.back()}
          className="p-2 -ml-2 rounded-lg"
          style={({ pressed }) => ({ backgroundColor: pressed ? colors.surfaceHover : undefined })}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1">
          Integrations
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Description */}
        <Text className="text-sm leading-5 mt-2" style={{ color: colors.textMuted }}>
          Connect messaging platforms and device features to give AI assistants the context they
          need. Data stays on your device and is only shared when you start a chat.
        </Text>

        {/* ------------------------------------------------------------------ */}
        {/* SECTION 1: Messaging Platforms                                       */}
        {/* ------------------------------------------------------------------ */}
        <View>
          <SectionHeader title="Messaging" count={connectedCount} colors={colors} />

          {platformsLoading && (
            <View className="flex-row items-center justify-center py-4">
              <ActivityIndicator size="small" color={colors.teal} />
              <Text className="text-sm ml-3" style={{ color: colors.textMuted }}>
                Loading platforms...
              </Text>
            </View>
          )}

          {!platformsLoading &&
            platforms.map((p) => (
              <PlatformCard
                key={p.id}
                platform={{
                  name: p.name,
                  icon: p.id,
                  connected: p.connected,
                  accountName: p.accountName,
                  lastSynced: p.lastSynced,
                  messageCount: p.messageCount,
                }}
                onConnect={() => handleConnect(p.id)}
                onDisconnect={() => handleDisconnect(p.id)}
              />
            ))}
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* SECTION 2: Device Integrations (new component)                       */}
        {/* ------------------------------------------------------------------ */}
        <View>
          <SectionHeader title="Device" colors={colors} />
          <DeviceIntegrationStatus />
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* SECTION 3: Legacy permission toggles (Calendar / Contacts / Health)  */}
        {/* ------------------------------------------------------------------ */}
        <View>
          <SectionHeader title="Permissions" colors={colors} />

          <Text className="text-xs leading-4 mb-4" style={{ color: colors.textMuted }}>
            Fine-grained permission controls for device features used in AI context injection.
          </Text>

          {isChecking && (
            <View className="flex-row items-center justify-center py-6">
              <ActivityIndicator size="small" color={colors.teal} />
              <Text className="text-sm ml-3" style={{ color: colors.textMuted }}>
                Checking permissions...
              </Text>
            </View>
          )}

          {!isChecking && (
            <View className="gap-4">
              {/* Calendar */}
              <Card>
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="w-9 h-9 rounded-lg items-center justify-center"
                      style={{ backgroundColor: colors.accentSurface }}
                    >
                      <Calendar size={18} color={colors.agentActive} />
                    </View>
                    <View>
                      <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                        Calendar
                      </Text>
                      <View className="flex-row items-center gap-1.5 mt-0.5">
                        <StatusIcon status={calendarStatus} colors={colors} />
                        <Badge
                          label={statusLabel(calendarStatus)}
                          color={statusBadgeColor(calendarStatus)}
                        />
                      </View>
                    </View>
                  </View>
                  <Switch
                    value={calendarStatus === 'granted'}
                    onValueChange={handleCalendarToggle}
                  />
                </View>
                <Separator className="mb-3" />
                <Text className="text-xs leading-4" style={{ color: colors.textMuted }}>
                  Calendar is used to provide context about your schedule to AI assistants. Upcoming
                  events help the AI understand your availability and suggest better times for
                  tasks.
                </Text>
              </Card>

              {/* Contacts */}
              <Card>
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="w-9 h-9 rounded-lg items-center justify-center"
                      style={{ backgroundColor: colors.purpleSurface }}
                    >
                      <Users size={18} color={colors.purple} />
                    </View>
                    <View>
                      <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                        Contacts
                      </Text>
                      <View className="flex-row items-center gap-1.5 mt-0.5">
                        <StatusIcon status={contactsStatus} colors={colors} />
                        <Badge
                          label={statusLabel(contactsStatus)}
                          color={statusBadgeColor(contactsStatus)}
                        />
                      </View>
                    </View>
                  </View>
                  <Switch
                    value={contactsStatus === 'granted'}
                    onValueChange={handleContactsToggle}
                  />
                </View>
                <Separator className="mb-3" />
                <Text className="text-xs leading-4" style={{ color: colors.textMuted }}>
                  Contacts helps AI find and reference people you know. When you mention someone by
                  name, the AI can look up their details to help draft messages or schedule
                  meetings.
                </Text>
              </Card>

              {/* Health Data (iOS only) */}
              {healthAvailable && (
                <Card>
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center gap-3">
                      <View
                        className="w-9 h-9 rounded-lg items-center justify-center"
                        style={{ backgroundColor: colors.dangerSurface }}
                      >
                        <Heart size={18} color={colors.agentError} />
                      </View>
                      <View>
                        <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                          Health Data
                        </Text>
                        <View className="flex-row items-center gap-1.5 mt-0.5">
                          <StatusIcon
                            colors={colors}
                            status={
                              healthStatus === 'granted'
                                ? 'granted'
                                : healthStatus === 'denied'
                                  ? 'denied'
                                  : 'undetermined'
                            }
                          />
                          <Badge
                            label={
                              healthStatus === 'granted'
                                ? 'Granted'
                                : healthStatus === 'unavailable'
                                  ? 'Unavailable'
                                  : healthStatus === 'denied'
                                    ? 'Denied'
                                    : 'Not Asked'
                            }
                            color={
                              healthStatus === 'granted'
                                ? 'green'
                                : healthStatus === 'denied'
                                  ? 'red'
                                  : 'gray'
                            }
                          />
                        </View>
                      </View>
                    </View>
                    <Switch
                      value={healthStatus === 'granted'}
                      onValueChange={async (enabled) => {
                        if (!enabled) {
                          Alert.alert(
                            'Health Data',
                            'Health data is provided by the HxF companion app. Uninstall HxF to revoke access.',
                            [{ text: 'OK' }],
                          );
                          return;
                        }
                        const granted = await requestHealthPermission();
                        setHealthStatus(granted ? 'granted' : 'unavailable');
                      }}
                    />
                  </View>
                  <Separator className="mb-3" />
                  <Text className="text-xs leading-4" style={{ color: colors.textMuted }}>
                    Health data is read from the HxF companion app (HealthKit bridge). Steps, heart
                    rate, sleep, and more can be shared with AI assistants for personalized
                    insights.
                  </Text>
                </Card>
              )}
            </View>
          )}
        </View>

        {/* System settings link */}
        <Pressable
          onPress={openSystemSettings}
          className="flex-row items-center justify-center gap-2 py-3 active:opacity-70"
          accessibilityLabel="Open device settings"
        >
          <ExternalLink size={14} color={colors.teal} />
          <Text className="text-sm" style={{ color: colors.teal }}>
            Open Device Settings
          </Text>
        </Pressable>
      </ScrollView>

      {/* Bottom sheet for legacy platform setup (Slack / Telegram / WhatsApp) */}
      {selectedLegacyPlatform && (
        <PlatformSetupSheet
          sheetRef={setupSheetRef}
          platform={selectedLegacyPlatform}
          onConnect={async (config) => {
            if (selectedPlatformId) {
              await connectPlatform(selectedPlatformId, config);
            }
            setSelectedPlatformId(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}
