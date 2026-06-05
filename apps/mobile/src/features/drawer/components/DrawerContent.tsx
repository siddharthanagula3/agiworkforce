import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import {
  Boxes,
  Cloud,
  FolderOpen,
  HelpCircle,
  Info,
  Plus,
  Search,
  Settings,
  Sparkles,
  UserCircle,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { type DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text } from '@/components/ui/text';
import { DesktopCompanionWidget } from '@/src/shared/components/DesktopCompanionWidget';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/src/features/auth/store';
import { InviteCodeModal } from '@/src/features/cloud-bridge';
import { useProjectStore } from '@/src/features/projects/store';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';

type RoutePath =
  | '/(app)/(tabs)/projects'
  | '/(app)/artifacts'
  | '/(app)/(tabs)/settings'
  | '/(app)/about'
  | '/(app)/profile'
  | '/(app)/projects/[id]'
  | '/(app)/chat/[id]';

interface PrimaryItem {
  key: 'projects' | 'artifacts' | 'agi-agent';
  label: string;
  icon: LucideIcon;
  route?: RoutePath;
  cloud?: boolean;
}

const PRIMARY_ITEMS: PrimaryItem[] = [
  {
    key: 'projects',
    label: 'Projects',
    icon: FolderOpen,
    route: '/(app)/(tabs)/projects',
  },
  {
    key: 'artifacts',
    label: 'Artifacts',
    icon: Boxes,
    route: '/(app)/artifacts',
  },
  {
    key: 'agi-agent',
    label: 'AGI Agent',
    icon: Sparkles,
    cloud: true,
  },
];

function Tag({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function HeaderIconButton({
  label,
  icon: Icon,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon size={18} color={colors.textPrimary} strokeWidth={1.8} />
    </Pressable>
  );
}

function NavRow({
  label,
  icon: Icon,
  active,
  onPress,
  tag,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onPress: () => void;
  tag?: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={tag ? `${label}. ${tag}` : label}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      style={{
        minHeight: 44,
        borderRadius: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: active ? colors.surfaceHover : colors.transparent,
      }}
    >
      <Icon
        size={19}
        color={active ? colors.textPrimary : colors.textSecondary}
        strokeWidth={1.8}
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: active ? colors.textPrimary : colors.textSecondary,
          fontSize: 15,
          fontWeight: active ? '600' : '400',
        }}
      >
        {label}
      </Text>
      {tag ? <Tag label={tag} /> : null}
    </Pressable>
  );
}

function SearchBox({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        height: 42,
        borderRadius: 21,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Search size={17} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search"
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search chats and projects"
        style={{ flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 0 }}
      />
      {value.trim().length > 0 ? (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear search">
          <X size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * ChatGPT-style mobile drawer with AGI-owned labels and cloud gating.
 */
export function DrawerContent(props: DrawerContentComponentProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const pathname = usePathname();
  const conversations = useChatStore((s) => s.conversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const projects = useProjectStore((s) => s.projects);
  const user = useAuthStore((s) => s.user);

  const [searchQuery, setSearchQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  const closeDrawer = useCallback(() => {
    props.navigation.closeDrawer();
  }, [props.navigation]);

  const navigate = useCallback(
    (route: RoutePath, params?: Record<string, string>) => {
      closeDrawer();
      if (params)
        router.navigate({ pathname: route, params } as Parameters<typeof router.navigate>[0]);
      else router.navigate(route as Parameters<typeof router.navigate>[0]);
    },
    [closeDrawer, router],
  );

  const handleNewChat = useCallback(async () => {
    closeDrawer();
    try {
      const id = await createConversation('New Chat');
      router.push({ pathname: '/(app)/chat/[id]' as const, params: { id } });
    } catch {
      router.push({ pathname: '/(app)/(tabs)/chat' as const });
    }
  }, [closeDrawer, createConversation, router]);

  const openInvite = useCallback(() => {
    closeDrawer();
    setInviteOpen(true);
  }, [closeDrawer]);

  const displayedConversations = useMemo(() => {
    const source = isSearching
      ? conversations.filter((conversation) =>
          (conversation.title || '').toLowerCase().includes(query),
        )
      : conversations;
    return source.slice(0, 12);
  }, [conversations, isSearching, query]);

  const displayedProjects = useMemo(() => {
    if (!FEATURES.projects) return [];
    const source = isSearching
      ? projects.filter((project) => project.name.toLowerCase().includes(query))
      : projects;
    return source.slice(0, 6);
  }, [isSearching, projects, query]);

  const activeKey = useCallback(
    (key: PrimaryItem['key']) => {
      const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
      if (key === 'projects') return p.includes('/projects');
      if (key === 'artifacts') return p.includes('/artifacts');
      return false;
    },
    [pathname],
  );

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'Profile';

  return (
    <SafeAreaView
      className="flex-1"
      edges={['top', 'bottom']}
      style={{ backgroundColor: colors.background }}
    >
      <View style={{ flex: 1, paddingHorizontal: 14 }}>
        <View
          style={{
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', flex: 1 }}>
            AGI
          </Text>
          <HeaderIconButton
            label="Open profile"
            icon={UserCircle}
            onPress={() => navigate('/(app)/profile')}
          />
          <HeaderIconButton label="New chat" icon={Plus} onPress={handleNewChat} />
        </View>

        <SearchBox
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />

        <ScrollView
          style={{ flex: 1, marginTop: 14 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 2 }}>
            {PRIMARY_ITEMS.map((item) => (
              <NavRow
                key={item.key}
                label={item.label}
                icon={item.cloud ? Cloud : item.icon}
                active={activeKey(item.key)}
                tag={item.cloud ? 'Cloud' : undefined}
                onPress={() => {
                  if (item.cloud) openInvite();
                  else if (item.route) navigate(item.route);
                }}
              />
            ))}
          </View>

          {FEATURES.companion ? (
            <View style={{ marginTop: 14 }}>
              <DesktopCompanionWidget compact />
            </View>
          ) : null}

          {displayedProjects.length > 0 ? (
            <View style={{ marginTop: 22 }}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  fontWeight: '600',
                  marginBottom: 8,
                  paddingHorizontal: 2,
                }}
              >
                Projects
              </Text>
              <View style={{ gap: 1 }}>
                {displayedProjects.map((project) => (
                  <Pressable
                    key={project.id}
                    onPress={() => navigate('/(app)/projects/[id]', { id: project.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`Open project: ${project.name}`}
                    style={{
                      minHeight: 34,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      justifyContent: 'center',
                    }}
                  >
                    <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 14 }}>
                      {project.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ marginTop: 22 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                fontWeight: '600',
                marginBottom: 8,
                paddingHorizontal: 2,
              }}
            >
              {isSearching ? 'Results' : 'Recents'}
            </Text>

            {displayedConversations.length > 0 ? (
              <View style={{ gap: 1 }}>
                {displayedConversations.map((conversation) => {
                  const active = pathname.includes(conversation.id);
                  return (
                    <Pressable
                      key={conversation.id}
                      onPress={() => navigate('/(app)/chat/[id]', { id: conversation.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Open conversation: ${conversation.title}`}
                      accessibilityState={{ selected: active }}
                      style={{
                        minHeight: 34,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        justifyContent: 'center',
                        backgroundColor: active ? colors.surfaceHover : colors.transparent,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          color: active ? colors.textPrimary : colors.textSecondary,
                          fontSize: 14,
                          fontWeight: active ? '600' : '400',
                        }}
                      >
                        {conversation.title || 'Untitled chat'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: 14, paddingHorizontal: 10 }}>
                {isSearching ? 'No matches' : 'No recent chats'}
              </Text>
            )}
          </View>
        </ScrollView>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 12,
          gap: 2,
        }}
      >
        <NavRow
          label="Settings"
          icon={Settings}
          active={pathname.includes('/settings')}
          onPress={() => navigate('/(app)/(tabs)/settings')}
        />
        <NavRow label="Help & About" icon={HelpCircle} onPress={() => navigate('/(app)/about')} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingTop: 8,
          }}
        >
          <Info size={14} color={colors.textMuted} />
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
            {displayName}
          </Text>
        </View>
      </View>

      <InviteCodeModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        source="other"
        defaultTab="invite"
      />
    </SafeAreaView>
  );
}
