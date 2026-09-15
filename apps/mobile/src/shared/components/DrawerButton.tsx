import { View } from 'react-native';
import { Menu } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useNotificationCenter } from '@/services/notifications';

const BUTTON_SIZE = 36;

export function DrawerButton({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const colors = useThemeColors();
  const { unreadCount } = useNotificationCenter();

  return (
    <View style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}>
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityLabel={
          unreadCount > 0
            ? `Open navigation drawer, ${unreadCount} unread`
            : 'Open navigation drawer'
        }
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => ({
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: BUTTON_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
        })}
      >
        <Menu size={20} color={colors.textSecondary} />
      </Pressable>

      {/* An indicator, not a control. A 17pt target glued to the corner of this
          button could never reach 44pt without swallowing the button's own
          taps, so Notifications has its own drawer row instead. The count is
          announced as part of this button's label. */}
      {unreadCount > 0 ? (
        <View
          testID="drawer-unread-badge"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: -1,
            right: -3,
            minWidth: 17,
            height: 17,
            borderRadius: 9,
            paddingHorizontal: 4,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.agentError,
            borderWidth: 1,
            borderColor: colors.surfaceBase,
          }}
        >
          {/* No "99+" truncation: the notification centre keeps at most 50
              items (services/notifications.ts), so the count is always two
              digits and the pip's width is already bounded. */}
          <Text style={{ color: colors.accentText, fontSize: 10, fontWeight: '700' }}>
            {String(unreadCount)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
