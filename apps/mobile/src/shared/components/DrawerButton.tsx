import { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Menu } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useNotificationCenter } from '@/services/notifications';

const BUTTON_SIZE = 36;

export function DrawerButton({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const { unreadCount } = useNotificationCenter();

  const openNotifications = useCallback(() => {
    router.push({ pathname: '/(app)/notifications' as const });
  }, [router]);

  return (
    <View style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}>
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityLabel="Open navigation drawer"
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

      {unreadCount > 0 ? (
        <Pressable
          testID="drawer-unread-badge"
          onPress={openNotifications}
          accessibilityRole="button"
          accessibilityLabel={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
          hitSlop={6}
          style={({ pressed }) => ({
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
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {/* No "99+" truncation: the notification centre keeps at most 50
              items (services/notifications.ts), so the count is always two
              digits and the pip's width is already bounded. */}
          <Text style={{ color: colors.accentText, fontSize: 10, fontWeight: '700' }}>
            {String(unreadCount)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
