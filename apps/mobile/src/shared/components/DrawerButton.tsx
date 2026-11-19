import { View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Menu } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useNotificationCenter } from '@/services/notifications';
import { useResponsiveLayout } from '@/src/shared/hooks/useResponsiveLayout';

const BUTTON_SIZE = 44;
const PIP_ON_BUTTON_CORNER: ViewStyle = { position: 'absolute', top: -1, right: -3 };
const NOTIFICATIONS_ROUTE = '/(app)/notifications';

function UnreadPip({ count, placement }: { count: number; placement?: ViewStyle }) {
  const colors = useThemeColors();
  return (
    <View
      testID="drawer-unread-badge"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        ...placement,
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
      <Text style={{ color: colors.accentText, fontSize: typeScale.caption, fontWeight: '700' }}>
        {String(count)}
      </Text>
    </View>
  );
}

export function DrawerButton({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const { unreadCount } = useNotificationCenter();
  const { usesPersistentDrawer } = useResponsiveLayout();

  // Beside the permanent sidebar there is no drawer to open, so the slot keeps
  // its width for the header and carries only the unread count.
  if (usesPersistentDrawer) {
    return (
      <View style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}>
        {unreadCount > 0 ? (
          <Pressable
            testID="drawer-notifications-link"
            onPress={() =>
              router.push(NOTIFICATIONS_ROUTE as unknown as Parameters<typeof router.push>[0])
            }
            accessibilityLabel={`Open notifications, ${unreadCount} unread`}
            accessibilityRole="button"
            style={({ pressed }) => ({
              width: BUTTON_SIZE,
              height: BUTTON_SIZE,
              borderRadius: BUTTON_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
          >
            <UnreadPip count={unreadCount} />
          </Pressable>
        ) : null}
      </View>
    );
  }

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
          taps, so the count is announced as part of this button's label. */}
      {unreadCount > 0 ? <UnreadPip count={unreadCount} placement={PIP_ON_BUTTON_CORNER} /> : null}
    </View>
  );
}
