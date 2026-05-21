import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Platform, Linking, Alert } from 'react-native';
import {
  Heart,
  Calendar,
  Users,
  Bell,
  CheckCircle,
  XCircle,
  HelpCircle,
  RefreshCw,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { colors } from '@/lib/theme';
import {
  getCalendarPermissionStatus,
  getContactsPermissionStatus,
  type PermissionStatus,
} from '@/services/deviceIntegrations';
import {
  isHealthAvailable,
  getHealthPermissionStatus,
  type HealthPermissionStatus,
} from '@/services/healthData';
import * as Notifications from 'expo-notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IntegrationStatus = 'active' | 'inactive' | 'needs-permission' | 'unavailable';

interface DeviceIntegration {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  lastSync?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function permissionToStatus(p: PermissionStatus): IntegrationStatus {
  switch (p) {
    case 'granted':
      return 'active';
    case 'denied':
      return 'needs-permission';
    case 'undetermined':
      return 'inactive';
  }
}

function healthToStatus(h: HealthPermissionStatus): IntegrationStatus {
  switch (h) {
    case 'granted':
      return 'active';
    case 'denied':
      return 'needs-permission';
    case 'unavailable':
      return 'unavailable';
    case 'undetermined':
      return 'inactive';
  }
}

function notifStatusToIntegration(s: Notifications.PermissionStatus): IntegrationStatus {
  if (s === 'granted') return 'active';
  if (s === 'denied') return 'needs-permission';
  return 'inactive';
}

function statusBadgeColor(status: IntegrationStatus): 'green' | 'yellow' | 'red' | 'gray' {
  switch (status) {
    case 'active':
      return 'green';
    case 'inactive':
      return 'yellow';
    case 'needs-permission':
      return 'red';
    case 'unavailable':
      return 'gray';
  }
}

function statusLabel(status: IntegrationStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    case 'needs-permission':
      return 'Needs Permission';
    case 'unavailable':
      return 'Unavailable';
  }
}

// ---------------------------------------------------------------------------
// Status icon component
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: IntegrationStatus }) {
  switch (status) {
    case 'active':
      return <CheckCircle size={14} color="#10b981" />;
    case 'needs-permission':
      return <XCircle size={14} color="#ef4444" />;
    case 'inactive':
    case 'unavailable':
      return <HelpCircle size={14} color={colors.textMuted} />;
  }
}

// ---------------------------------------------------------------------------
// Integration row
// ---------------------------------------------------------------------------

interface IntegrationRowProps {
  integration: DeviceIntegration;
  icon: React.ReactNode;
  onPress?: () => void;
}

function IntegrationRow({ integration, icon, onPress }: IntegrationRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center gap-3 py-3 active:opacity-70"
      accessibilityLabel={`${integration.name}: ${statusLabel(integration.status)}`}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      {/* Icon */}
      <View className="w-9 h-9 rounded-lg bg-white/5 items-center justify-center">{icon}</View>

      {/* Name + description */}
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-medium text-white">{integration.name}</Text>
          <StatusIcon status={integration.status} />
        </View>
        <Text className="text-xs text-white/40 mt-0.5 leading-4">{integration.description}</Text>
        {integration.lastSync && integration.status === 'active' ? (
          <Text className="text-[10px] text-white/30 mt-0.5">
            Last sync: {integration.lastSync}
          </Text>
        ) : null}
      </View>

      {/* Badge */}
      <Badge label={statusLabel(integration.status)} color={statusBadgeColor(integration.status)} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Icon registry
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ReactNode> = {
  health: <Heart size={18} color="#ef4444" />,
  calendar: <Calendar size={18} color="#3b82f6" />,
  contacts: <Users size={18} color="#a855f7" />,
  notifications: <Bell size={18} color={colors.teal} />,
};

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function DeviceIntegrationStatus() {
  const [integrations, setIntegrations] = useState<DeviceIntegration[]>([]);
  const [loading, setLoading] = useState(true);

  const checkAll = useCallback(async () => {
    setLoading(true);

    const [calStat, contactsStat, notifResult] = await Promise.all([
      getCalendarPermissionStatus(),
      getContactsPermissionStatus(),
      Notifications.getPermissionsAsync(),
    ]);

    const notifPerm = notifResult.status as Notifications.PermissionStatus;
    const healthStat = isHealthAvailable() ? await getHealthPermissionStatus() : 'unavailable';

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const next: DeviceIntegration[] = [
      {
        id: 'health',
        name: Platform.OS === 'ios' ? 'Apple Health' : 'Google Fit',
        description:
          Platform.OS === 'ios'
            ? 'Steps, heart rate and sleep via HealthKit bridge'
            : 'Fitness and wellness data via Google Fit',
        status: healthToStatus(healthStat as HealthPermissionStatus),
        lastSync: healthStat === 'granted' ? now : undefined,
      },
      {
        id: 'calendar',
        name: Platform.OS === 'ios' ? 'Apple Calendar' : 'Google Calendar',
        description: 'Schedule context for AI suggestions and reminders',
        status: permissionToStatus(calStat),
        lastSync: calStat === 'granted' ? now : undefined,
      },
      {
        id: 'contacts',
        name: 'Contacts',
        description: 'People context for drafting messages and scheduling meetings',
        status: permissionToStatus(contactsStat),
        lastSync: contactsStat === 'granted' ? now : undefined,
      },
      {
        id: 'notifications',
        name: 'Notifications',
        description: 'Agent alerts and approval requests delivered to this device',
        status: notifStatusToIntegration(notifPerm),
      },
    ];

    setIntegrations(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAll();
  }, [checkAll]);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  const handleRowPress = useCallback(
    (integration: DeviceIntegration) => {
      if (integration.status === 'needs-permission' || integration.status === 'inactive') {
        Alert.alert(
          `Enable ${integration.name}`,
          integration.status === 'needs-permission'
            ? `${integration.name} access was denied. Please enable it in your device Settings.`
            : `Grant ${integration.name} access to provide context to AI assistants.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: openSettings },
          ],
        );
      }
    },
    [openSettings],
  );

  if (loading) {
    return (
      <Card>
        <View className="flex-row items-center gap-2 py-2">
          <RefreshCw size={14} color={colors.textMuted} />
          <Text className="text-xs text-white/40">Checking device integrations...</Text>
        </View>
      </Card>
    );
  }

  const activeCount = integrations.filter((i) => i.status === 'active').length;

  return (
    <Card>
      {/* Section header */}
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-xs font-medium text-white/50 uppercase tracking-wider">
          Device Access
        </Text>
        <Badge
          label={`${activeCount} / ${integrations.length} active`}
          color={activeCount === integrations.length ? 'green' : 'yellow'}
        />
      </View>

      {integrations.map((integration, index) => (
        <View key={integration.id}>
          {index > 0 && <Separator />}
          <IntegrationRow
            integration={integration}
            icon={ICON_MAP[integration.id]}
            onPress={
              integration.status === 'unavailable' ? undefined : () => handleRowPress(integration)
            }
          />
        </View>
      ))}
    </Card>
  );
}
