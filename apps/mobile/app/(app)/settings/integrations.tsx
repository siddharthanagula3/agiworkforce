import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Alert, Linking, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  Users,
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
import { colors } from '@/lib/theme';
import {
  requestCalendarPermission,
  requestContactsPermission,
  getCalendarPermissionStatus,
  getContactsPermissionStatus,
  type PermissionStatus,
} from '@/services/deviceIntegrations';

// ---------------------------------------------------------------------------
// Helpers
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

function StatusIcon({ status }: { status: PermissionStatus }) {
  switch (status) {
    case 'granted':
      return <CheckCircle size={16} color="#10b981" />;
    case 'denied':
      return <XCircle size={16} color="#ef4444" />;
    case 'undetermined':
      return <HelpCircle size={16} color={colors.textMuted} />;
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function IntegrationsScreen() {
  const router = useRouter();

  const [calendarStatus, setCalendarStatus] = useState<PermissionStatus>('undetermined');
  const [contactsStatus, setContactsStatus] = useState<PermissionStatus>('undetermined');
  const [isChecking, setIsChecking] = useState(true);

  // Check current permission status on mount
  useEffect(() => {
    async function checkPermissions() {
      const [calStat, conStat] = await Promise.all([
        getCalendarPermissionStatus(),
        getContactsPermissionStatus(),
      ]);
      setCalendarStatus(calStat);
      setContactsStatus(conStat);
      setIsChecking(false);
    }
    checkPermissions();
  }, []);

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
        // Can't revoke programmatically -- direct to system settings
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
        // Already denied -- must go to settings
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

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-4 h-12">
        <Pressable
          onPress={() => router.back()}
          className="p-2 -ml-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1">
          Device Integrations
        </Text>
      </View>

      <View className="flex-1 px-4 gap-5 pt-2">
        {/* Description */}
        <Text className="text-white/50 text-sm leading-5">
          Connect device features to give your AI assistant more context about your life. All data
          stays on your device and is only shared with AI when relevant.
        </Text>

        {/* Loading state while checking permissions */}
        {isChecking && (
          <View className="flex-row items-center justify-center py-6">
            <ActivityIndicator size="small" color={colors.teal} />
            <Text className="text-white/40 text-sm ml-3">Checking permissions...</Text>
          </View>
        )}

        {!isChecking && (
          <>
            {/* Calendar */}
            <Card>
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-3">
                  <View className="w-9 h-9 rounded-lg bg-blue-500/15 items-center justify-center">
                    <Calendar size={18} color="#3b82f6" />
                  </View>
                  <View>
                    <Text className="text-sm text-white font-medium">Calendar</Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <StatusIcon status={calendarStatus} />
                      <Badge
                        label={statusLabel(calendarStatus)}
                        color={statusBadgeColor(calendarStatus)}
                      />
                    </View>
                  </View>
                </View>
                <Switch value={calendarStatus === 'granted'} onValueChange={handleCalendarToggle} />
              </View>
              <Separator className="mb-3" />
              <Text className="text-white/40 text-xs leading-4">
                Calendar is used to provide context about your schedule to AI assistants. Upcoming
                events help the AI understand your availability and suggest better times for tasks.
              </Text>
            </Card>

            {/* Contacts */}
            <Card>
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-3">
                  <View className="w-9 h-9 rounded-lg bg-purple-500/15 items-center justify-center">
                    <Users size={18} color="#a855f7" />
                  </View>
                  <View>
                    <Text className="text-sm text-white font-medium">Contacts</Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <StatusIcon status={contactsStatus} />
                      <Badge
                        label={statusLabel(contactsStatus)}
                        color={statusBadgeColor(contactsStatus)}
                      />
                    </View>
                  </View>
                </View>
                <Switch value={contactsStatus === 'granted'} onValueChange={handleContactsToggle} />
              </View>
              <Separator className="mb-3" />
              <Text className="text-white/40 text-xs leading-4">
                Contacts helps AI find and reference people you know. When you mention someone by
                name, the AI can look up their details to help draft messages or schedule meetings.
              </Text>
            </Card>

            {/* System settings link */}
            <Pressable
              onPress={openSystemSettings}
              className="flex-row items-center justify-center gap-2 py-3 active:opacity-70"
              accessibilityLabel="Open device settings"
            >
              <ExternalLink size={14} color={colors.teal} />
              <Text className="text-sm text-teal-400">Open Device Settings</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
