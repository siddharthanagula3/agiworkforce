import { Bell, Mail } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { PUSH_PREFERENCE_GROUP_COPY, resolvePushPreferenceGroup } from './categories';
import { View } from 'react-native';

export default function NotificationCategoryDetailScreen({
  category: requestedCategory,
}: {
  category: string;
}) {
  const colors = useThemeColors();
  const categoryEnabled = useNotificationPrefsStore((state) => state.categoryEnabled);
  const setCategoryEnabled = useNotificationPrefsStore((state) => state.setCategoryEnabled);

  const category = resolvePushPreferenceGroup(requestedCategory);

  if (!category) {
    return (
      <SettingsScreenShell title="Notification" backHref="/(app)/settings/notifications">
        <SettingsInfo
          title="Notification category not found"
          body="Return to Notification Preferences and choose a category from the current list."
          icon={Bell}
        />
      </SettingsScreenShell>
    );
  }

  const copy = PUSH_PREFERENCE_GROUP_COPY[category];

  return (
    <SettingsScreenShell title={copy.label} backHref="/(app)/settings/notifications">
      <SettingsInfo
        title="Delivery channels"
        body={`${copy.description}. Choose the channels that have a real delivery path in this app.`}
        icon={Bell}
      />

      <SettingsGroup>
        <SettingsSwitchRow
          label="Push notifications"
          description="Show this category through device or companion push delivery."
          icon={Bell}
          value={categoryEnabled[category]}
          onValueChange={(enabled) => setCategoryEnabled(category, enabled)}
        />
        <View
          accessibilityLabel="Email notifications. Unavailable"
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
              No account email sender exists for this category.
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, fontWeight: '600' }}>
            Unavailable
          </Text>
        </View>
      </SettingsGroup>

      <SettingsInfo
        title="No hidden email preference"
        body="Email delivery is not available yet, so this screen does not save a switch that nothing reads. It can be added after an account-bound sender and unsubscribe path ship."
        icon={Mail}
      />
    </SettingsScreenShell>
  );
}
