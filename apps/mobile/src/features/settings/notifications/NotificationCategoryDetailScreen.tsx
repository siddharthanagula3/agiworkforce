import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bell, BellOff, Mail } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/Common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  enablePushNotifications,
  getPushDeliveryStatus,
  type PushDeliveryStatus,
} from '@/services/notifications';
import { PUSH_PREFERENCE_GROUP_COPY, resolvePushPreferenceGroup } from './categories';

function pushDescription(): string {
  return FEATURES.companion ? 'Push to this device or a paired companion.' : 'Push to this device.';
}

const SILENT_DEVICE_COPY: Partial<Record<PushDeliveryStatus, { status: string; action: string }>> =
  {
    undetermined: {
      status: 'Notifications are not turned on for this device yet.',
      action: 'Turn on notifications',
    },
    denied: {
      status: 'This device is blocking notifications.',
      action: 'Open Settings',
    },
  };

export default function NotificationCategoryDetailScreen({
  category: requestedCategory,
}: {
  category: string;
}) {
  const colors = useThemeColors();
  const categoryEnabled = useNotificationPrefsStore((state) => state.categoryEnabled);
  const setCategoryEnabled = useNotificationPrefsStore((state) => state.setCategoryEnabled);
  const [deviceStatus, setDeviceStatus] = useState<PushDeliveryStatus | null>(null);
  const [requesting, setRequesting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getPushDeliveryStatus().then((status) => {
        if (!cancelled) setDeviceStatus(status);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const allowOnDevice = useCallback(async () => {
    if (requesting) return;
    if (deviceStatus === 'denied') {
      await Linking.openSettings().catch(() => undefined);
      return;
    }
    setRequesting(true);
    try {
      setDeviceStatus(await enablePushNotifications());
    } finally {
      setRequesting(false);
    }
  }, [deviceStatus, requesting]);

  const category = resolvePushPreferenceGroup(requestedCategory);

  if (!category) {
    return (
      <SettingsScreenShell title="Notification" backHref="/(app)/settings/notifications">
        <SettingsInfo
          title="Notification category not found"
          body="Go back and choose a category from the list."
          icon={Bell}
        />
      </SettingsScreenShell>
    );
  }

  const copy = PUSH_PREFERENCE_GROUP_COPY[category];
  const silentDevice =
    categoryEnabled[category] && deviceStatus ? SILENT_DEVICE_COPY[deviceStatus] : undefined;

  return (
    <SettingsScreenShell title={copy.label} backHref="/(app)/settings/notifications">
      <SettingsInfo title="Delivery channels" body={`${copy.description}.`} icon={Bell} />

      <SettingsGroup>
        <SettingsSwitchRow
          label="Push notifications"
          description={silentDevice?.status ?? pushDescription()}
          icon={Bell}
          value={categoryEnabled[category]}
          onValueChange={(enabled) => setCategoryEnabled(category, enabled)}
        />
        {silentDevice ? (
          <SettingsRow
            label={silentDevice.action}
            icon={BellOff}
            onPress={requesting ? undefined : () => void allowOnDevice()}
          />
        ) : null}
        <View
          accessibilityLabel={`Email notifications. ${copy.emailSetOnWeb ? 'On the web' : 'Unavailable'}`}
          style={{
            minHeight: 76,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Mail size={19} color={colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
              Email notifications
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: typeScale.caption,
                lineHeight: 17,
                marginTop: 3,
              }}
            >
              {copy.emailSetOnWeb
                ? 'Set in your account settings on the web.'
                : 'Not available for this category.'}
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, fontWeight: '600' }}>
            {copy.emailSetOnWeb ? 'On the web' : 'Unavailable'}
          </Text>
        </View>
      </SettingsGroup>

      {copy.emailSetOnWeb ? null : (
        <SettingsInfo
          title="No email for this category"
          body="AGI doesn’t email these notifications."
          icon={Mail}
        />
      )}
    </SettingsScreenShell>
  );
}
