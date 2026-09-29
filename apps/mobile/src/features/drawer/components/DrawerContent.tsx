import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, ScrollView } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { type DrawerContentComponentProps } from 'expo-router/drawer';
import {
  BookImage,
  BookOpen,
  Bot,
  Bell,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Code2,
  FolderOpen,
  HelpCircle,
  BarChart3,
  MessageSquare,
  MonitorSmartphone,
  Pin,
  Search,
  Settings,
  SquarePen,
  Telescope,
  UserCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { MOBILE_REMOTE_SCREEN_LABEL } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useNotificationCenter } from '@/services/notifications';
import { useProjectStore } from '@/src/features/projects/store';
import { CLOUD_CODE_SCREEN_TITLE } from '@/src/features/cloud-code/presentation';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  executionModeForConversation,
  isHistoryVisibleConversation,
} from '@/src/features/chat/utils/conversationMode';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTierStore } from '@/src/features/billing/store';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudUsageStore } from '@/src/features/settings/cloud-usage/store';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import {
  ActionMenuSheet,
  InlineRenameField,
  RenameConversationModal,
  useConversationActions,
} from '@/src/features/conversation-actions';
import { useWorkspaceSwitcher } from '@/src/features/team/useWorkspaceSwitcher';
import type { ConversationSummary } from '@/types/chat';
import {
  isDrawerOpen,
  ShellCapabilityShortcuts,
  useDrawerDismiss,
  useDrawerScrollMemory,
  type ShellShortcutRoute,
} from '@/src/features/shell';
import { useTabletLayout } from '@/src/shared/hooks/useTabletLayout';

type RoutePath =
  | '/(app)/chats'
  | '/(app)/search'
  | '/(app)/(tabs)/projects'
  | '/(app)/(tabs)/chat'
  | '/(app)/artifacts'
  | '/(app)/library'
  | '/(app)/skills'
  | '/(app)/reports'
  | '/(app)/schedules'
  | '/(app)/companion'
  | '/(app)/cloud-code'
  | '/(app)/tasks'
  | '/(app)/notifications'
  | '/(app)/(tabs)/settings'
  | '/(app)/settings/cloud-usage'
  | '/(app)/about'
  | '/(app)/profile'
  | '/(app)/projects/[id]'
  | '/(app)/chat/[id]'
  | ShellShortcutRoute;

interface PrimaryItem {
  key:
    | 'chats'
    | 'projects'
    | 'library'
    | 'reports'
    | 'skills'
    | 'schedules'
    | 'code'
    | 'remote'
    | 'tasks';
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
  // Library is the single place generated media and files live. "Artifacts"
  // was a second grid over the same material, and a worse one, since its
  // tiles rendered no thumbnails, so it is de-listed here rather than kept as
  // a competing entry point (founder 2026-08-13). The `/(app)/artifacts`
  // route still exists and is still reachable from an artifact card in a
  // message; only the drawer row is gone.
  {
    key: 'library',
    label: 'Library',
    icon: BookImage,
    route: '/(app)/library',
  },
  // Collateral damage from the 2026-08-13 consolidation, not a deliberate
  // de-listing like Artifacts/Tasks above: FEATURES.skills is still on, the
  // /(app)/skills route and its Clerk-gated Managed Cloud catalog screen are
  // still live, and nothing replaced this row's function. Restored.
  {
    key: 'reports',
    label: 'Reports',
    icon: Telescope,
    route: '/(app)/reports',
    cloud: true,
  },
  {
    key: 'skills',
    label: 'Skills',
    icon: BookOpen,
    route: '/(app)/skills',
    cloud: true,
  },
  {
    key: 'schedules',
    label: 'Schedules',
    icon: CalendarClock,
    route: '/(app)/schedules',
    cloud: true,
  },
  {
    key: 'code',
    label: CLOUD_CODE_SCREEN_TITLE,
    icon: Code2,
    route: '/(app)/cloud-code',
    cloud: true,
  },
  {
    key: 'remote',
    // Desktop's pairing card tells people to open this screen by name, so the
    // label is shared rather than typed twice.
    label: MOBILE_REMOTE_SCREEN_LABEL,
    icon: MonitorSmartphone,
    route: '/(app)/companion',
  },
  // AGI Work NAVIGATES; it does not toggle (founder 2026-08-13). A drawer row
  // that silently flipped a session stance gave no feedback about what it had
  // changed and no way to see the work it produced. `workMode` is a property of
  // a cloud agent RUN (cloud-contracts/cloud-agent-runs.ts), not of a
  // conversation, so "the AGI Work chats" are exactly the runs list at
  // /(app)/tasks, which is also why no separate "Tasks" row sits beside this
  // one showing the same records.
  {
    key: 'tasks',
    label: 'AGI Work',
    icon: Bot,
    route: '/(app)/tasks',
    cloud: true,
  },
];

const DRAWER_RECENT_LIMIT = 8;
const DRAWER_PROJECT_CHAT_LIMIT = 5;

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
      <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, fontWeight: '600' }}>
        {label}
      </Text>
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
    <PressableBox
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
    </PressableBox>
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
    <PressableBox
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
          fontSize: typeScale.body,
          fontWeight: active ? '600' : '400',
        }}
      >
        {label}
      </Text>
      {tag ? <Tag label={tag} /> : null}
    </PressableBox>
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
  const cloudConversations = useChatCloudMessageStore((s) => s.conversations);
  const { openActions, rename } = useConversationActions();
  const { unreadCount } = useNotificationCenter();

  const localProjects = useProjectStore((s) => s.projects);
  const cloudProjects = useCloudProjectStore((s) => s.projects);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const usageOwnerId = useCloudUsageStore((s) => s.ownerId);
  const usageSnapshot = useCloudUsageStore((s) => s.snapshot);
  const usageLoading = useCloudUsageStore((s) => s.loading);
  const usageError = useCloudUsageStore((s) => s.error);
  const refreshUsage = useCloudUsageStore((s) => s.refresh);
  // Same gate the [+] sheet applied before this moved: Cloud-only, and only
  // where the capability document grants AGI Work. The server is still authoritative.
  const showAgiWork = appMode === 'cloud' && grantedCapabilities.includes('canUseAgiWork');

  const { usesPersistentDrawer } = useTabletLayout();
  const drawerOpen = isDrawerOpen(props.state);
  const { t } = useTranslation();
  const workspace = useWorkspaceSwitcher(
    (drawerOpen || usesPersistentDrawer) && appMode === 'cloud' && isClerkSignedIn,
    t('navPersonalWorkspace'),
  );
  const [expandedProjectIds, setExpandedProjectIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (
      (drawerOpen || usesPersistentDrawer) &&
      appMode === 'cloud' &&
      isClerkSignedIn &&
      clerkUserId
    ) {
      void refreshUsage();
    }
  }, [drawerOpen, usesPersistentDrawer, appMode, isClerkSignedIn, clerkUserId, refreshUsage]);

  const visibleUsage = usageOwnerId === clerkUserId ? usageSnapshot : null;
  const remainingUsage =
    visibleUsage && !usageError
      ? visibleUsage.weeklyResetAt !== null
        ? `Week ${Math.round(100 - Math.min(100, Math.max(0, visibleUsage.weeklyUsagePercentage)))}%`
        : visibleUsage.usageResetAt !== null
          ? `Period ${Math.round(100 - Math.min(100, Math.max(0, visibleUsage.usagePercentage)))}%`
          : null
      : null;

  const closeDrawer = useCallback(() => {
    props.navigation.closeDrawer();
  }, [props.navigation]);

  useDrawerDismiss(drawerOpen && !usesPersistentDrawer, closeDrawer);
  const scrollMemory = useDrawerScrollMemory(drawerOpen);

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

  const handleOpenSearch = useCallback(() => {
    navigate('/(app)/search');
  }, [navigate]);

  const historyConversations = useMemo(() => {
    // Each mode's history comes from the store that owns it. Cloud rows live in
    // useChatCloudMessageStore (where loadConversations writes the server list);
    // filtering the local store for `executionMode: 'cloud'` returned a stale
    // MMKV mirror that server responses never touched.
    const source = appMode === 'cloud' ? cloudConversations : conversations;
    return source.filter(
      (conversation) =>
        executionModeForConversation(conversation) === appMode &&
        isHistoryVisibleConversation(conversation),
    );
  }, [appMode, cloudConversations, conversations]);

  const displayedProjects = useMemo(() => {
    if (!FEATURES.projects) return [];
    // Cloud mode: read from the cloud projects store (synced via cloudSyncEngine).
    // Only show non-tombstoned projects. Local mode: read from local store as before.
    if (appMode === 'cloud') {
      const source = cloudProjects.filter((p) => p.deletedAt === null && !p.isArchived);
      return source
        .slice()
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 6);
    }
    return localProjects.slice(0, 6);
  }, [appMode, cloudProjects, localProjects]);

  const displayedProjectIds = useMemo(
    () => new Set(displayedProjects.map((project) => project.id)),
    [displayedProjects],
  );

  const displayedConversations = useMemo(
    () =>
      historyConversations
        .filter(
          (conversation) =>
            !conversation.projectId || !displayedProjectIds.has(conversation.projectId),
        )
        .slice()
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
        .slice(0, DRAWER_RECENT_LIMIT),
    [displayedProjectIds, historyConversations],
  );

  const projectConversations = useCallback(
    (projectId: string) =>
      historyConversations.filter((conversation) => conversation.projectId === projectId),
    [historyConversations],
  );

  const renderConversationRow = (conversation: ConversationSummary, inset = 0) => {
    const active = pathname.includes(conversation.id);
    return (
      <PressableBox
        key={conversation.id}
        onPress={() => navigate('/(app)/chat/[id]', { id: conversation.id })}
        onLongPress={() =>
          openActions(
            conversation.id,
            conversation.title || 'Untitled chat',
            Boolean(conversation.pinned),
          )
        }
        accessibilityRole="button"
        accessibilityLabel={`Open conversation: ${conversation.title}${conversation.unread ? ', unread' : ''}`}
        accessibilityHint="Long press for more actions"
        accessibilityState={{ selected: active }}
        style={{
          minHeight: 44,
          borderRadius: 8,
          paddingLeft: 10 + inset,
          paddingRight: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: active ? colors.surfaceHover : colors.transparent,
        }}
      >
        {conversation.pinned ? (
          <Pin size={12} color={colors.textMuted} fill={colors.textMuted} />
        ) : null}
        {rename.conversationId === conversation.id ? (
          <InlineRenameField rename={rename} />
        ) : (
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: active ? colors.textPrimary : colors.textSecondary,
              fontSize: typeScale.subhead,
              fontWeight: active ? '600' : '400',
            }}
          >
            {conversation.title || 'Untitled chat'}
          </Text>
        )}
        {conversation.unread ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.textPrimary,
            }}
          />
        ) : null}
      </PressableBox>
    );
  };

  const visiblePrimaryItems = useMemo(
    () =>
      PRIMARY_ITEMS.filter((item) => {
        // Cloud mode exposes the shared cloud surfaces (Tasks, Schedules). Local
        // mode keeps only on-device surfaces and hides every cloud-only item.
        if (item.key === 'schedules' && !FEATURES.schedules) return false;
        if (item.key === 'skills' && !FEATURES.skills) return false;
        if (item.key === 'reports' && !FEATURES.research) return false;
        if (item.key === 'remote' && !FEATURES.companion) return false;
        if (item.key === 'tasks') return FEATURES.cloudTasks && showAgiWork;
        if (appMode === 'cloud') return true;
        return !item.cloud;
      }),
    [appMode, showAgiWork],
  );

  const activeKey = useCallback(
    (key: PrimaryItem['key']) => {
      const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
      if (key === 'projects') return p.includes('/projects');
      if (key === 'chats') return p.includes('/chats');
      if (key === 'library') return p.includes('/library');
      if (key === 'skills') return p.includes('/skills');
      if (key === 'reports') return p.includes('/reports');
      if (key === 'schedules') return p.includes('/schedules');
      if (key === 'code') return p.includes('/cloud-code');
      if (key === 'remote') return p.includes('/companion');
      if (key === 'tasks') return p.includes('/tasks');
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
          {/* Newsreader, the brand typeface, same as the chat empty state and
              web's var(--font-newsreader). The weight is carried by the family
              name, so no fontWeight: setting one makes iOS synthesise a bolder
              face on top of an already-semibold cut. */}
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.title3,
              fontFamily: 'Newsreader_600SemiBold',
              letterSpacing: 0.4,
              flex: 1,
            }}
          >
            AGI
          </Text>
          {/* Icon-only, fixed at 34pt. The founder's complaint was that the old
              drawer search field's placeholder text widened it; deleting the
              entry point entirely over-corrected and cost an extra navigation
              to reach search at all. A circular glyph cannot widen. */}
          <HeaderIconButton label="Search" icon={Search} onPress={handleOpenSearch} />
          {/* New-chat sits in the header beside the profile symbol (its original,
              thumb-and-eye-level home), not dropped to a bottom pill. */}
          <HeaderIconButton label="New chat" icon={SquarePen} onPress={handleNewChat} />
          <HeaderIconButton
            label="Open profile"
            icon={UserCircle}
            onPress={() => navigate('/(app)/profile')}
          />
        </View>

        <ShellCapabilityShortcuts onOpen={(route) => navigate(route)} />

        <ScrollView
          ref={scrollMemory.ref}
          onScroll={scrollMemory.onScroll}
          scrollEventThrottle={scrollMemory.scrollEventThrottle}
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

          {displayedProjects.length > 0 ? (
            <View style={{ marginTop: 22 }}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                  marginBottom: 8,
                  paddingHorizontal: 2,
                }}
              >
                Projects
              </Text>
              <View style={{ gap: 1 }}>
                {displayedProjects.map((project) => {
                  const chats = projectConversations(project.id);
                  const expanded = expandedProjectIds.has(project.id);
                  return (
                    <View key={project.id}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <PressableBox
                          onPress={() => navigate('/(app)/projects/[id]', { id: project.id })}
                          accessibilityRole="button"
                          accessibilityLabel={`Open project: ${project.name}`}
                          style={{
                            flex: 1,
                            minHeight: 44,
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}
                          >
                            {project.name}
                          </Text>
                        </PressableBox>
                        {chats.length > 0 ? (
                          <PressableBox
                            onPress={() => toggleProject(project.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`${expanded ? 'Hide' : 'Show'} chats in ${project.name}`}
                            accessibilityState={{ expanded }}
                            style={{
                              width: 44,
                              height: 44,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {expanded ? (
                              <ChevronDown size={16} color={colors.textMuted} />
                            ) : (
                              <ChevronRight size={16} color={colors.textMuted} />
                            )}
                          </PressableBox>
                        ) : null}
                      </View>
                      {expanded ? (
                        <View style={{ gap: 1 }}>
                          {chats
                            .slice(0, DRAWER_PROJECT_CHAT_LIMIT)
                            .map((conversation) => renderConversationRow(conversation, 14))}
                          {chats.length > DRAWER_PROJECT_CHAT_LIMIT ? (
                            <PressableBox
                              onPress={() => navigate('/(app)/projects/[id]', { id: project.id })}
                              accessibilityRole="button"
                              accessibilityLabel={`See all chats in ${project.name}`}
                              style={{
                                minHeight: 44,
                                paddingLeft: 24,
                                paddingRight: 10,
                                justifyContent: 'center',
                              }}
                            >
                              <Text
                                style={{ color: colors.textMuted, fontSize: typeScale.subhead }}
                              >
                                See all
                              </Text>
                            </PressableBox>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={{ marginTop: 22 }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: typeScale.caption,
                fontWeight: '600',
                marginBottom: 8,
                paddingHorizontal: 2,
              }}
            >
              Recents
            </Text>

            {displayedConversations.length > 0 ? (
              <View style={{ gap: 1 }}>
                {displayedConversations.map((conversation) => renderConversationRow(conversation))}
              </View>
            ) : (
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typeScale.subhead,
                  paddingHorizontal: 10,
                }}
              >
                No recent chats
              </Text>
            )}
            <PressableBox
              onPress={() => navigate('/(app)/chats')}
              accessibilityRole="button"
              accessibilityLabel="See all chats"
              style={{
                minHeight: 44,
                marginTop: 4,
                paddingHorizontal: 10,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
                See all chats
              </Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </PressableBox>
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
        {workspace.activeName ? (
          <NavRow
            label={`Workspace: ${workspace.activeName}`}
            icon={Building2}
            onPress={workspace.open}
          />
        ) : null}
        {appMode === 'cloud' && isClerkSignedIn && clerkUserId ? (
          <NavRow
            label={`Usage remaining${remainingUsage ? ` · ${remainingUsage}` : usageLoading ? ' · Checking…' : usageError ? ' · Unavailable' : ''}`}
            icon={BarChart3}
            onPress={() => navigate('/(app)/settings/cloud-usage')}
          />
        ) : null}
        <NavRow
          label="Settings"
          icon={Settings}
          active={pathname.includes('/settings')}
          onPress={() => navigate('/(app)/(tabs)/settings')}
        />
        {/* The unread pip on the drawer button cannot be a 44pt control without
            swallowing the drawer's own taps, so the way in lives here. */}
        <NavRow
          label="Notifications"
          icon={Bell}
          active={pathname.includes('/notifications')}
          tag={unreadCount > 0 ? String(unreadCount) : undefined}
          onPress={() => navigate('/(app)/notifications')}
        />
        <NavRow label="Help & About" icon={HelpCircle} onPress={() => navigate('/(app)/about')} />
      </View>
      <RenameConversationModal rename={rename} inline />
      <ActionMenuSheet menu={workspace.menu} />
    </SafeAreaView>
  );
}
