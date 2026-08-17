import { useCallback, useState } from 'react';
import { View, Alert, Linking, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
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
  getCalendarPermissionStatus,
  type PermissionStatus,
} from '@/src/features/integrations/services/deviceIntegrations';
import { DeviceIntegrationStatus } from '@/src/features/integrations/components/DeviceIntegrationStatus';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';

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

function SectionHeader({ title, colors }: { title: string; colors: ColorScheme }) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: colors.textMuted }}
      >
        {title}
      </Text>
    </View>
  );
}

export default function IntegrationsScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  const [calendarStatus, setCalendarStatus] = useState<PermissionStatus>('undetermined');
  const [isChecking, setIsChecking] = useState(true);

  const refreshPermissionStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const [calStat] = await Promise.allSettled([getCalendarPermissionStatus()]);
      setCalendarStatus(calStat.status === 'fulfilled' ? calStat.value : 'undetermined');
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

  if (!FEATURES.connectors) return <FeatureUnavailable feature="Connectors" />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
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
          Manage device features that can provide context to AI assistants. Data stays on your
          device and is only shared when you start a chat.
        </Text>

        {/* ------------------------------------------------------------------ */}
        {/* SECTION 1: Device Integrations                                       */}
        {/* ------------------------------------------------------------------ */}
        <View>
          <SectionHeader title="Device" colors={colors} />
          <DeviceIntegrationStatus />
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* SECTION 2: Permission toggles (Calendar)                             */}
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

              {/* STB-21: the Health Data card was removed with the health-context
                  service. It read from GET /api/health-context, a route that has
                  never existed on any of our backends, and swallowed the 404 so
                  the card rendered as a blank "no data yet" state. */}
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
    </SafeAreaView>
  );
}
