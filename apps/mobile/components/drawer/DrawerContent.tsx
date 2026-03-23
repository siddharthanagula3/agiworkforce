import { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import {
  MessageSquare,
  Zap,
  FolderOpen,
  Monitor,
  Link,
  Settings,
  Plus,
  type LucideIcon,
} from 'lucide-react-native';
import { type DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/lib/theme';

/**
 * 6 primary navigation items for the drawer.
 * Each maps to a top-level route inside (app).
 */
const NAV_ITEMS: {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string;
}[] = [
  { key: 'chat', label: 'Chat', icon: MessageSquare, route: '/(app)/(tabs)/chat' },
  { key: 'skills', label: 'Skills', icon: Zap, route: '/(app)/skills' },
  { key: 'projects', label: 'Projects', icon: FolderOpen, route: '/(app)/(tabs)/projects' },
  { key: 'dispatch', label: 'Dispatch', icon: Monitor, route: '/(app)/dispatch' },
  { key: 'connectors', label: 'Connectors', icon: Link, route: '/(app)/connectors' },
  { key: 'settings', label: 'Settings', icon: Settings, route: '/(app)/(tabs)/settings' },
];

/**
 * Custom drawer content matching the AGI Workforce mobile spec.
 *
 * Layout:
 *   Header: "AGI Workforce" + [+] new chat button
 *   Nav items (6)
 *   Recents section (last 5 conversations)
 *   User profile card at bottom
 */
export function DrawerContent(_props: DrawerContentComponentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const user = useAuthStore((s) => s.user);

  const recentConversations = conversations.slice(0, 5);

  const handleNewChat = useCallback(async () => {
    try {
      const id = await createConversation('New Chat');
      router.push(`/(app)/chat/${id}` as Parameters<typeof router.push>[0]);
    } catch {
      // Navigate to chat list on failure
      router.push('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
    }
  }, [createConversation, router]);

  const handleNavPress = useCallback(
    (route: string) => {
      router.navigate(route as Parameters<typeof router.navigate>[0]);
    },
    [router],
  );

  const handleConversationPress = useCallback(
    (id: string) => {
      router.navigate(`/(app)/chat/${id}` as Parameters<typeof router.navigate>[0]);
    },
    [router],
  );

  /**
   * Determine if a nav item is active based on the current pathname.
   */
  const isActive = useCallback(
    (key: string) => {
      const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
      switch (key) {
        case 'chat':
          return p === '/chat' || p === '/(tabs)/chat' || p.startsWith('/chat/');
        case 'skills':
          return p === '/skills' || p.startsWith('/skills/');
        case 'projects':
          return p === '/projects' || p === '/(tabs)/projects' || p.startsWith('/projects/');
        case 'dispatch':
          return p === '/dispatch' || p.startsWith('/dispatch/');
        case 'connectors':
          return p === '/connectors' || p.startsWith('/connectors/');
        case 'settings':
          return p === '/settings' || p === '/(tabs)/settings' || p.startsWith('/settings/');
        default:
          return false;
      }
    },
    [pathname],
  );

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'User';

  const avatarInitial = displayName.charAt(0).toUpperCase();

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      edges={['top', 'bottom']}
    >
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 h-14"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <Text className="text-[17px] font-semibold" style={{ color: colors.textPrimary }}>
          AGI Workforce
        </Text>
        <Pressable
          onPress={handleNewChat}
          className="w-8 h-8 rounded-lg items-center justify-center active:opacity-70"
          style={{ backgroundColor: `${colors.teal}20` }}
          accessibilityLabel="New chat"
          accessibilityRole="button"
        >
          <Plus size={18} color={colors.teal} />
        </Pressable>
      </View>

      {/* Navigation items */}
      <View className="px-2 pt-3 gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.key);
          const Icon = item.icon;
          return (
            <Pressable
              key={item.key}
              onPress={() => handleNavPress(item.route)}
              className="flex-row items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{
                backgroundColor: active ? `${colors.teal}15` : 'transparent',
              }}
              accessibilityLabel={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Icon size={20} color={active ? colors.teal : colors.textSecondary} />
              <Text
                className="text-[15px] font-medium"
                style={{
                  color: active ? colors.teal : colors.textPrimary,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Recents section */}
      {recentConversations.length > 0 && (
        <View className="px-4 pt-5 flex-1">
          <Text
            className="text-[11px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: colors.textMuted }}
          >
            Recents
          </Text>
          <View className="gap-0.5">
            {recentConversations.map((conv) => (
              <Pressable
                key={conv.id}
                onPress={() => handleConversationPress(conv.id)}
                className="px-3 py-2 rounded-lg active:bg-white/5"
                accessibilityLabel={`Open conversation: ${conv.title}`}
                accessibilityRole="button"
              >
                <Text
                  className="text-[13px]"
                  style={{ color: colors.textSecondary }}
                  numberOfLines={1}
                >
                  {conv.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Spacer if no recents */}
      {recentConversations.length === 0 && <View className="flex-1" />}

      {/* User profile card */}
      <View className="px-3 py-3" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
        <View className="flex-row items-center gap-3 px-1">
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: `${colors.teal}25` }}
          >
            <Text className="text-[14px] font-bold" style={{ color: colors.teal }}>
              {avatarInitial}
            </Text>
          </View>
          <Text
            className="text-[14px] font-medium flex-1"
            style={{ color: colors.textPrimary }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <Pressable
            onPress={handleNewChat}
            className="w-8 h-8 rounded-lg items-center justify-center active:opacity-70"
            style={{ backgroundColor: `${colors.teal}15` }}
            accessibilityLabel="New chat"
            accessibilityRole="button"
          >
            <Plus size={16} color={colors.teal} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
