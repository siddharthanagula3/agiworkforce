import { useCallback, useMemo } from 'react';
import { View, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import {
  BookImage,
  BookOpen,
  Boxes,
  CalendarClock,
  FolderOpen,
  HelpCircle,
  MessageSquare,
  Pin,
  Settings,
  Sparkles,
  SquarePen,
  UserCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { type DrawerContentComponentProps } from '@react-navigation/drawer';
import { Text } from '@/components/ui/text';
import { DesktopCompanionWidget } from '@/src/shared/components/DesktopCompanionWidget';
import { useChatStore } from '@/stores/chatStore';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  executionModeForConversation,
  isHistoryVisibleConversation,
} from '@/src/features/chat/utils/conversationMode';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

type RoutePath =
  | '/(app)/chats'
  | '/(app)/(tabs)/projects'
  | '/(app)/(tabs)/chat'
  | '/(app)/artifacts'
  | '/(app)/library'
  | '/(app)/skills'
  | '/(app)/schedules'
  | '/(app)/agents'
  | '/(app)/(tabs)/settings'
  | '/(app)/about'
  | '/(app)/profile'
  | '/(app)/projects/[id]'
  | '/(app)/chat/[id]';

interface PrimaryItem {
  key: 'chats' | 'projects' | 'artifacts' | 'library' | 'skills' | 'tasks' | 'schedules';
  label: string;
  icon: LucideIcon;
  route?: RoutePath;
  cloud?: boolean;
}

const PRIMARY_ITEMS: PrimaryItem[] = [
  {
    key: 'chats',
    label: 'Chats',
    icon: MessageSquare,
    route: '/(app)/chats',
  },
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
    key: 'library',
    label: 'Library',
    icon: BookImage,
    route: '/(app)/library',
  },
  {
    key: 'skills',
    label: 'Skills',
    icon: BookOpen,
    route: '/(app)/skills',
    cloud: true,
  },
  {
    key: 'tasks',
    label: 'Tasks',
    icon: Sparkles,
    route: '/(app)/agents',
    cloud: true,
  },
  {
    key: 'schedules',
    label: 'Schedules',
    icon: CalendarClock,
    route: '/(app)/schedules',
    cloud: true,
  },
];

const DRAWER_RECENT_LIMIT = 8;

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

/**
 * Mobile drawer with AGI-owned labels and cloud gating.
 */
export function DrawerContent(props: DrawerContentComponentProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const pathname = usePathname();
  const conversations = useChatStore((s) => s.conversations);
  const pinConversation = useChatStore((s) => s.pinConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  // Long-press a recent chat → pin/unpin or delete. Surfaces the pin/delete store
  // actions (previously only reachable from the unused sidebar) in the live drawer.
  const handleConversationLongPress = useCallback(
    (id: string, title: string, pinned: boolean) => {
      Alert.alert(title || 'Chat', undefined, [
        {
          text: pinned ? 'Unpin' : 'Pin',
          onPress: () => void pinConversation(id),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Delete chat?', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => void deleteConversation(id),
              },
            ]),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [pinConversation, deleteConversation],
  );
  const localProjects = useProjectStore((s) => s.projects);
  const cloudProjects = useCloudProjectStore((s) => s.projects);
  const appMode = useChatAppModeStore((s) => s.appMode);

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

  const handleNewChat = useCallback(() => {
    closeDrawer();
    router.push({ pathname: '/(app)/(tabs)/chat' as const });
  }, [closeDrawer, router]);

  const displayedConversations = useMemo(() => {
    return (
      conversations
        .filter(
          (conversation) =>
            executionModeForConversation(conversation) === appMode &&
            isHistoryVisibleConversation(conversation),
        )
        // Pinned chats first; preserve the existing recency order within each group.
        .slice()
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
        .slice(0, DRAWER_RECENT_LIMIT)
    );
  }, [appMode, conversations]);

  const displayedProjects = useMemo(() => {
    if (!FEATURES.projects) return [];
    // Cloud mode: read from the cloud projects store (synced via cloudSyncEngine).
    // Only show non-tombstoned projects. Local mode: read from local store as before.
    if (appMode === 'cloud') {
      const source = cloudProjects.filter((p) => p.deletedAt === null && !p.isArchived);
      return source.slice(0, 6);
    }
    return localProjects.slice(0, 6);
  }, [appMode, cloudProjects, localProjects]);

  const visiblePrimaryItems = useMemo(
    () =>
      PRIMARY_ITEMS.filter((item) => {
        // Cloud mode exposes the shared cloud surfaces (Tasks, Schedules). Local
        // mode keeps only on-device surfaces and hides every cloud-only item.
        if (item.key === 'schedules' && !FEATURES.schedules) return false;
        if (item.key === 'tasks' && !FEATURES.cloudTasks) return false;
        if (item.key === 'skills' && !FEATURES.skills) return false;
        if (appMode === 'cloud') return true;
        return !item.cloud;
      }),
    [appMode],
  );

  const activeKey = useCallback(
    (key: PrimaryItem['key']) => {
      const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
      if (key === 'projects') return p.includes('/projects');
      if (key === 'chats') return p.includes('/chats');
      if (key === 'artifacts') return p.includes('/artifacts');
      if (key === 'library') return p.includes('/library');
      if (key === 'skills') return p.includes('/skills');
      if (key === 'schedules') return p.includes('/schedules');
      if (key === 'tasks') return p.includes('/agents');
      return false;
    },
    [pathname],
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
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
          {/* Newsreader — the brand typeface, same as the chat empty state and
              web's var(--font-newsreader). The weight is carried by the family
              name, so no fontWeight: setting one makes iOS synthesise a bolder
              face on top of an already-semibold cut. */}
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 20,
              fontFamily: 'Newsreader_600SemiBold',
              letterSpacing: 0.4,
              flex: 1,
            }}
          >
            AGI
          </Text>
          {/* New-chat sits in the header beside the profile symbol (its original,
              thumb-and-eye-level home) — not dropped to a bottom pill. */}
          <HeaderIconButton label="New chat" icon={SquarePen} onPress={handleNewChat} />
          <HeaderIconButton
            label="Open profile"
            icon={UserCircle}
            onPress={() => navigate('/(app)/profile')}
          />
        </View>

        {/* No search field here. It navigated to /chats rather than searching,
            so it read as a search box but behaved as a nav button — and Chats
            now carries a real bottom-anchored search of its own. Claude's
            drawer (claude_reference/118) has no search either; one entry
            point, in the place both references put it. */}
        <ScrollView
          style={{ flex: 1, marginTop: 14 }}
          contentContainerStyle={{ paddingBottom: 96 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 2 }}>
            {visiblePrimaryItems.map((item) => (
              <NavRow
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={activeKey(item.key)}
                tag={item.cloud ? 'Cloud' : undefined}
                onPress={() => {
                  if (item.route) navigate(item.route);
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
              Recents
            </Text>

            {displayedConversations.length > 0 ? (
              <View style={{ gap: 1 }}>
                {displayedConversations.map((conversation) => {
                  const active = pathname.includes(conversation.id);
                  return (
                    <Pressable
                      key={conversation.id}
                      onPress={() => navigate('/(app)/chat/[id]', { id: conversation.id })}
                      onLongPress={() =>
                        handleConversationLongPress(
                          conversation.id,
                          conversation.title || 'Untitled chat',
                          Boolean(conversation.pinned),
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Open conversation: ${conversation.title}`}
                      accessibilityHint="Long press to pin or delete"
                      accessibilityState={{ selected: active }}
                      style={{
                        minHeight: 34,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: active ? colors.surfaceHover : colors.transparent,
                      }}
                    >
                      {conversation.pinned ? (
                        <Pin size={12} color={colors.textMuted} fill={colors.textMuted} />
                      ) : null}
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
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
                No recent chats
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
      </View>
    </SafeAreaView>
  );
}
