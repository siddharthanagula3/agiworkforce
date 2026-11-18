import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Platform, Linking, Alert, AppState, type LayoutChangeEvent } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { useFocusEffect } from 'expo-router';
import { Calendar, Bell, CheckCircle, XCircle, HelpCircle, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import {
  HEADER_TEXT_SCALE_LIMIT,
  ROW_LABEL_TEXT_SCALE_LIMIT,
  spacing,
  typeScale,
} from '@/src/ui/theme/tokens';
import { useLargeTextRows } from '@/src/shared/hooks/useLargeTextRows';
import {
  getCalendarPermissionStatus,
  type PermissionStatus,
} from '@/src/features/integrations/services/deviceIntegrations';
import { PERMISSION_REGISTRY } from '@/src/features/settings/permissions/registry';
import type { MobilePermissionKind } from '@/src/features/settings/permissions/types';
import * as Notifications from 'expo-notifications';
import {
  isPushPermissionRequestPending,
  toPushPermissionStatus,
} from '@/services/pushPermissionStatus';
import { enablePushNotifications } from '@/services/notifications';

type IntegrationStatus = 'active' | 'inactive' | 'needs-permission' | 'unavailable';

interface DeviceIntegration {
  id: Extract<MobilePermissionKind, 'calendar' | 'notifications'>;
  name: string;
  description: string;
  status: IntegrationStatus;
}

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

const ROW_ICON_SIZE = 36;
const ROW_TEXT_MIN_WIDTH = spacing['4xl'] * 3 + spacing.xl;

interface IntegrationRowProps {
  integration: DeviceIntegration;
  icon: React.ReactNode;
  colors: ColorScheme;
  onPress?: () => void;
}

function IntegrationRow(props: IntegrationRowProps) {
  const stacked = useLargeTextRows();
  return stacked ? <StackedIntegrationRow {...props} /> : <WrappingIntegrationRow {...props} />;
}

function StackedIntegrationRow({ integration, icon, colors, onPress }: IntegrationRowProps) {
  return (
    <PressableBox
      onPress={onPress}
      disabled={!onPress}
      className="py-3 active:opacity-70"
      accessibilityLabel={`${integration.name}: ${statusLabel(integration.status)}`}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="rounded-lg items-center justify-center"
          style={{
            width: ROW_ICON_SIZE,
            height: ROW_ICON_SIZE,
            backgroundColor: colors.neutralSurface,
          }}
        >
          {icon}
        </View>
        <View className="flex-row items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
          <Text
            maxFontSizeMultiplier={ROW_LABEL_TEXT_SCALE_LIMIT}
            style={{
              flexShrink: 1,
              color: colors.textPrimary,
              fontSize: typeScale.subhead,
              fontWeight: '600',
            }}
          >
            {integration.name}
          </Text>
          <StatusIcon status={integration.status} colors={colors} />
        </View>
      </View>

      <View testID={`device-integration-text-${integration.id}`} style={{ marginTop: spacing.sm }}>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: typeScale.caption,
            lineHeight: 16,
          }}
        >
          {integration.description}
        </Text>
        <View
          testID={`device-integration-badge-${integration.id}`}
          style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
        >
          <Badge
            label={statusLabel(integration.status)}
            color={statusBadgeColor(integration.status)}
          />
        </View>
      </View>
    </PressableBox>
  );
}

function WrappingIntegrationRow({ integration, icon, colors, onPress }: IntegrationRowProps) {
  const [textFrame, setTextFrame] = useState<{ y: number; height: number } | null>(null);
  const [badgeY, setBadgeY] = useState<number | null>(null);
  const badgeBelowText =
    textFrame !== null && badgeY !== null && badgeY >= textFrame.y + textFrame.height;
  const onTextLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setTextFrame((prev) => (prev?.y === y && prev.height === height ? prev : { y, height }));
  }, []);
  const onBadgeLayout = useCallback((event: LayoutChangeEvent) => {
    setBadgeY(event.nativeEvent.layout.y);
  }, []);

  return (
    <PressableBox
      onPress={onPress}
      disabled={!onPress}
      className="flex-row flex-wrap items-center gap-3 py-3 active:opacity-70"
      accessibilityLabel={`${integration.name}: ${statusLabel(integration.status)}`}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      <View
        className="rounded-lg items-center justify-center"
        style={{
          width: ROW_ICON_SIZE,
          height: ROW_ICON_SIZE,
          backgroundColor: colors.neutralSurface,
        }}
      >
        {icon}
      </View>

      <View
        onLayout={onTextLayout}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: ROW_TEXT_MIN_WIDTH }}
      >
        <View className="flex-row items-center gap-2">
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}
          >
            {integration.name}
          </Text>
          <StatusIcon status={integration.status} colors={colors} />
        </View>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: typeScale.caption,
            lineHeight: 16,
            marginTop: 2,
          }}
        >
          {integration.description}
        </Text>
      </View>

      <View
        onLayout={onBadgeLayout}
        style={badgeBelowText ? { marginLeft: ROW_ICON_SIZE + spacing.md } : undefined}
      >
        <Badge
          label={statusLabel(integration.status)}
          color={statusBadgeColor(integration.status)}
        />
      </View>
    </PressableBox>
  );
}

function getIconMap(colors: ColorScheme): Record<string, React.ReactNode> {
  return {
    calendar: <Calendar size={18} color={colors.agentActive} />,
    notifications: <Bell size={18} color={colors.teal} />,
  };
}

interface DeviceIntegrationStatusProps {
  refreshKey?: string;
  onPermissionChange?: () => void;
}

export function DeviceIntegrationStatus({
  refreshKey,
  onPermissionChange,
}: DeviceIntegrationStatusProps = {}) {
  const colors = useThemeColors();
  const [integrations, setIntegrations] = useState<DeviceIntegration[]>([]);
  const [loading, setLoading] = useState(true);

  const checkAll = useCallback(async () => {
    const [calStat, notifResult] = await Promise.all([
      getCalendarPermissionStatus(),
      Notifications.getPermissionsAsync(),
    ]);

    const next: DeviceIntegration[] = [
      {
        id: 'calendar',
        name: Platform.OS === 'ios' ? 'Apple Calendar' : 'Google Calendar',
        description: 'Schedule context for AI suggestions and reminders',
        status: permissionToStatus(calStat),
      },
      {
        id: 'notifications',
        name: 'Notifications',
        description: 'Agent alerts and approval requests delivered to this device',
        status: permissionToStatus(toPushPermissionStatus(notifResult)),
      },
    ];

    setIntegrations(next);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkAll();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active' && !isPushPermissionRequestPending()) void checkAll();
      });
      return () => subscription.remove();
    }, [checkAll]),
  );

  const checkedRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (checkedRefreshKey.current === refreshKey) return;
    checkedRefreshKey.current = refreshKey;
    void checkAll();
  }, [checkAll, refreshKey]);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  const requestPermission = useCallback(
    async (kind: DeviceIntegration['id']) => {
      try {
        if (kind === 'notifications') {
          await enablePushNotifications();
        } else {
          await PERMISSION_REGISTRY[kind].requestPermission();
        }
      } catch (error) {
        console.warn(`[integrations] Could not request ${kind} permission:`, error);
      }
      await checkAll();
      onPermissionChange?.();
    },
    [checkAll, onPermissionChange],
  );

  const handleRowPress = useCallback(
    (integration: DeviceIntegration) => {
      if (integration.status === 'inactive') {
        void requestPermission(integration.id);
        return;
      }
      if (integration.status === 'needs-permission') {
        Alert.alert(
          `Enable ${integration.name}`,
          `${integration.name} access was denied. Please enable it in your device Settings.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: openSettings },
          ],
        );
      }
    },
    [openSettings, requestPermission],
  );

  if (loading) {
    return (
      <Card>
        <View className="flex-row items-center gap-2 py-2">
          <RefreshCw size={14} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
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
      <View className="flex-row flex-wrap items-center justify-between gap-2 mb-1">
        <Text
          maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
          style={{
            flexShrink: 1,
            color: colors.textMuted,
            fontSize: typeScale.caption,
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
