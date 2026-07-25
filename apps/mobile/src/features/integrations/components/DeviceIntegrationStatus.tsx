import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Platform, Linking, Alert } from 'react-native';
import {
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
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import {
  getCalendarPermissionStatus,
  getContactsPermissionStatus,
  type PermissionStatus,
} from '@/src/features/integrations/services/deviceIntegrations';
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

// STB-21: healthToStatus() and the Health/Google Fit row were removed with the
// health-context service — the backend route they reported on never existed.

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

function StatusIcon({ status, colors }: { status: IntegrationStatus; colors: ColorScheme }) {
  switch (status) {
    case 'active':
      return <CheckCircle size={14} color={colors.agentSuccess} />;
    case 'needs-permission':
      return <XCircle size={14} color={colors.agentError} />;
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
  colors: ColorScheme;
  onPress?: () => void;
}

function IntegrationRow({ integration, icon, colors, onPress }: IntegrationRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center gap-3 py-3 active:opacity-70"
      accessibilityLabel={`${integration.name}: ${statusLabel(integration.status)}`}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      {/* Icon */}
      <View
        className="w-9 h-9 rounded-lg items-center justify-center"
        style={{ backgroundColor: colors.neutralSurface }}
      >
        {icon}
      </View>

      {/* Name + description */}
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
            {integration.name}
          </Text>
          <StatusIcon status={integration.status} colors={colors} />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 }}>
          {integration.description}
        </Text>
        {integration.lastSync && integration.status === 'active' ? (
          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
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

function getIconMap(colors: ColorScheme): Record<string, React.ReactNode> {
  return {
    calendar: <Calendar size={18} color={colors.agentActive} />,
    contacts: <Users size={18} color={colors.purple} />,
    notifications: <Bell size={18} color={colors.teal} />,
  };
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function DeviceIntegrationStatus() {
  const colors = useThemeColors();
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

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const next: DeviceIntegration[] = [
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
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Checking device integrations...
          </Text>
        </View>
      </Card>
    );
  }

  const activeCount = integrations.filter((i) => i.status === 'active').length;
  const iconMap = getIconMap(colors);

  return (
    <Card>
      {/* Section header */}
      <View className="flex-row items-center justify-between mb-1">
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 12,
            fontWeight: '600',
            textTransform: 'uppercase',
          }}
        >
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
            icon={iconMap[integration.id]}
            colors={colors}
            onPress={
              integration.status === 'unavailable' ? undefined : () => handleRowPress(integration)
            }
          />
        </View>
      ))}
    </Card>
  );
}
