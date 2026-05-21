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
  Brain,
  Key,
  Info,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { type DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text } from '@/components/ui/text';
import { DesktopCompanionWidget } from '@/src/shared/components/DesktopCompanionWidget';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useThemeColors } from '@/hooks/useTheme';
import { FEATURES } from '@/lib/v1FeatureFlags';

// Chat-first primary nav items
const CHAT_NAV_ITEMS: {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string;
  show: boolean;
}[] = [
  { key: 'chat', label: 'Chat', icon: MessageSquare, route: '/(app)/(tabs)/chat', show: true },
  { key: 'skills', label: 'Skills', icon: Zap, route: '/(app)/skills', show: true },
  {
    key: 'projects',
    label: 'Projects',
    icon: FolderOpen,
    route: '/(app)/(tabs)/projects',
    // FOUNDER DECISION 2026-05-18: Projects ships in v1.
    show: FEATURES.projects,
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    icon: Monitor,
    route: '/(app)/dispatch',
    show: FEATURES.dispatch,
  },
  {
    key: 'connectors',
    label: 'Connectors',
    icon: Link,
    route: '/(app)/connectors',
    show: FEATURES.connectorsCloudOnly,
  },
].filter((item) => item.show);

// Utility strip: Models · Keys · Memory · Account · Settings · About
const UTILITY_ITEMS: {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string;
  show: boolean;
}[] = [
  { key: 'models', label: 'Models', icon: Brain, route: '/(app)/models', show: true },
  { key: 'keys', label: 'Keys', icon: Key, route: '/(app)/keys', show: true },
  { key: 'memory', label: 'Memory', icon: Brain, route: '/(app)/settings/memory', show: true },
  { key: 'account', label: 'Account', icon: User, route: '/(app)/account', show: FEATURES.auth },
  {
    key: 'settings',
    label: 'Settings',
    icon: Settings,
    route: '/(app)/(tabs)/settings',
    show: true,
  },
  { key: 'about', label: 'About', icon: Info, route: '/(app)/about', show: true },
].filter((item) => item.show);

/**
 * Custom drawer content for the mobile app.
 *
 * Layout:
 *   Header: brand wordmark + [+] new chat button
 *   Primary nav (5 items: Chat / Skills / Projects / Dispatch / Connectors)
 *   Desktop companion widget
 *   Utility strip (6 items: Models / Keys / Memory / Account / Settings / About)
 *   Recents section (last 5 conversations)
 *   User profile card at bottom
 */
export function DrawerContent(_props: DrawerContentComponentProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const pathname = usePathname();
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const user = useAuthStore((s) => s.user);

  const recentConversations = conversations.slice(0, 5);

  const handleNewChat = useCallback(async () => {
    try {
      const id = await createConversation('New Chat');
      router.push({ pathname: '/(app)/chat/[id]' as const, params: { id } });
    } catch {
      router.push({ pathname: '/(app)/(tabs)/chat' as const });
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
      router.navigate({ pathname: '/(app)/chat/[id]' as const, params: { id } });
    },
    [router],
  );

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
        case 'models':
          return p === '/models' || p.startsWith('/models/');
        case 'keys':
          return p === '/keys' || p.startsWith('/keys/');
        case 'memory':
          return p === '/settings/memory';
        case 'account':
          return p === '/account' || p.startsWith('/account/');
        case 'settings':
          return p === '/settings' || p === '/(tabs)/settings' || p.startsWith('/settings/');
        case 'about':
          return p === '/about';
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
          AGI
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

      {/* Primary navigation items */}
      <View className="px-2 pt-3 gap-0.5">
        {CHAT_NAV_ITEMS.map((item) => {
          const active = isActive(item.key);
          const Icon = item.icon;
          return (
            <Pressable
              key={item.key}
              onPress={() => handleNavPress(item.route)}
              className="flex-row items-center gap-3 px-3 rounded-lg"
              style={{
                height: 40,
                backgroundColor: active ? colors.surfaceHover : 'transparent',
              }}
              accessibilityLabel={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Icon
                size={18}
                strokeWidth={1.75}
                color={active ? colors.teal : colors.textSecondary}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 14,
                  fontWeight: active ? '500' : '400',
                  color: active ? colors.textPrimary : colors.textSecondary,
                  flex: 1,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Desktop companion widget */}
      <View className="px-3 pt-3">
        <DesktopCompanionWidget compact />
      </View>

      {/* Utility strip: Models · Keys · Memory · Account · Settings · About */}
      <View className="px-2 pt-1.5">
        <View className="mx-1 mb-1.5" style={{ height: 1, backgroundColor: colors.border }} />
        {UTILITY_ITEMS.map((item) => {
          const active = isActive(item.key);
          const Icon = item.icon;
          return (
            <Pressable
              key={item.key}
              onPress={() => handleNavPress(item.route)}
              className="flex-row items-center gap-3 px-3 rounded-lg"
              style={{
                height: 36,
                backgroundColor: active ? colors.surfaceHover : 'transparent',
              }}
              accessibilityLabel={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Icon size={16} strokeWidth={1.75} color={active ? colors.teal : colors.textMuted} />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 13,
                  fontWeight: active ? '500' : '400',
                  color: active ? colors.textPrimary : colors.textSecondary,
                  flex: 1,
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
        <View className="px-4 pt-4 flex-1">
          <Text
            className="text-[11px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: colors.textMuted }}
          >
            Recents
          </Text>
          <View className="gap-0.5">
            {recentConversations.map((conv) => {
              const activeConv = pathname.includes(conv.id);
              return (
                <Pressable
                  key={conv.id}
                  onPress={() => handleConversationPress(conv.id)}
                  style={{
                    height: 32,
                    paddingHorizontal: 12,
                    borderRadius: 6,
                    justifyContent: 'center',
                    backgroundColor: activeConv ? colors.surfaceHover : 'transparent',
                  }}
                  accessibilityLabel={`Open conversation: ${conv.title}`}
                  accessibilityRole="button"
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 13,
                      color: activeConv ? colors.textPrimary : colors.textSecondary,
                      fontWeight: activeConv ? '500' : '400',
                    }}
                  >
                    {conv.title}
                  </Text>
                </Pressable>
              );
            })}
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
