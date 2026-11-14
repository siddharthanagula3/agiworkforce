import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { useTranslation } from 'react-i18next';
import { View, ScrollView, StyleSheet } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { type DrawerContentComponentProps } from 'expo-router/drawer';
import {
  BookImage,
  Globe,
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleArrowUp,
  Code2,
  FolderOpen,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  SlidersHorizontal,
  SquarePen,
  Telescope,
  type LucideIcon,
} from 'lucide-react-native';
import { canUseBillingPlanCapability, isFreeBillingPlanTier } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { AgiMark } from '@/components/ui/AgiMark';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProjectStore } from '@/src/features/projects/store';
import { isCloudProjectPinned, pinnedFirst } from '@/src/features/projects/projectList';
import { CLOUD_CODE_SCREEN_TITLE } from '@/src/features/cloud-code/presentation';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  executionModeForConversation,
  isHistoryVisibleConversation,
} from '@/src/features/chat/utils/conversationMode';
import { ModeToggle } from '@/src/features/chat/components/ModeToggle';
import { useAppModeSwitch } from '@/src/features/chat/hooks/useAppModeSwitch';
import { useTierStore } from '@/src/features/billing/store';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudUsageStore } from '@/src/features/settings/cloud-usage/store';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import {
  ActionMenuSheet,
  type ConversationMenuState,
  InlineRenameField,
  RenameConversationModal,
  useConversationActions,
} from '@/src/features/conversation-actions';
import type { ConversationSummary } from '@/types/chat';
import { isDrawerOpen, useDrawerDismiss, useDrawerScrollMemory } from '@/src/features/shell';
import { isShownInMode } from '@/src/features/shell/destinationScope';
import { useTabletLayout } from '@/src/shared/hooks/useTabletLayout';

type RoutePath =
  | '/(app)/chats'
  | '/(app)/search'
  | '/(app)/(tabs)/projects'
  | '/(app)/(tabs)/chat'
  | '/(app)/library'
  | '/(app)/agents'
  | '/(app)/sites'
  | '/(app)/reports'
  | '/(app)/schedules'
  | '/(app)/cloud-code'
  | '/(app)/tasks'
  | '/(app)/settings'
  | '/(app)/settings/cloud-billing'
  | '/(app)/projects/[id]'
  | '/(app)/chat/[id]';

interface PrimaryItem {
  key: 'projects' | 'library' | 'reports' | 'agents' | 'sites' | 'schedules' | 'code' | 'tasks';
  label?: string;
  labelKey?: string;
  icon: LucideIcon;
  route: RoutePath;
  folded?: boolean;
}

const PRIMARY_ITEMS: PrimaryItem[] = [
  {
    key: 'projects',
    labelKey: 'navProjects',
    icon: FolderOpen,
    route: '/(app)/(tabs)/projects',
  },
  {
    key: 'library',
    labelKey: 'navLibrary',
    icon: BookImage,
    route: '/(app)/library',
  },
  {
    key: 'code',
    label: CLOUD_CODE_SCREEN_TITLE,
    icon: Code2,
    route: '/(app)/cloud-code',
  },
  {
    key: 'schedules',
    labelKey: 'drawer.schedules',
    icon: CalendarClock,
    route: '/(app)/schedules',
  },
  // workMode belongs to a cloud agent run, not a conversation, so AGI Work opens
  // the runs list instead of toggling a session stance.
  {
    key: 'tasks',
    label: 'AGI Work',
    icon: Bot,
    route: '/(app)/tasks',
    folded: true,
  },
  {
    key: 'sites',
    labelKey: 'drawer.publishedSites',
    icon: Globe,
    route: '/(app)/sites',
    folded: true,
  },
  {
    key: 'agents',
    labelKey: 'navAgents',
    icon: Bot,
    route: '/(app)/agents',
    folded: true,
  },
  {
    key: 'reports',
    labelKey: 'drawer.reports',
    icon: Telescope,
    route: '/(app)/reports',
    folded: true,
  },
];

const BRAND_SYMBOL_SIZE = 28;
const DRAWER_RECENT_LIMIT = 8;
const DRAWER_PROJECT_CHAT_LIMIT = 5;
const DRAWER_MIN_FOLDED = 2;
const CIRCLE_BUTTON_SIZE = 44;

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
      style={{
        width: CIRCLE_BUTTON_SIZE,
        height: CIRCLE_BUTTON_SIZE,
        borderRadius: CIRCLE_BUTTON_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Icon size={20} color={colors.textPrimary} strokeWidth={1.8} />
    </PressableBox>
  );
}

function FooterChip({
  label,
  text,
  icon: Icon,
  onPress,
}: {
  label: string;
  text?: string;
  icon: LucideIcon;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={{
        minWidth: CIRCLE_BUTTON_SIZE,
        height: CIRCLE_BUTTON_SIZE,
        maxWidth: 150,
        borderRadius: CIRCLE_BUTTON_SIZE / 2,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Icon size={18} color={colors.textPrimary} strokeWidth={1.8} />
      {text ? (
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, color: colors.textPrimary, fontSize: typeScale.footnote }}
        >
          {text}
        </Text>
      ) : null}
    </PressableBox>
  );
}

function NavRow({
  label,
  icon: Icon,
  active,
  expanded,
  trailing,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  expanded?: boolean;
  trailing?: ReactNode;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={
        expanded === undefined
          ? { selected: Boolean(active) }
          : { selected: Boolean(active), expanded }
      }
      style={{
        minHeight: 48,
        borderRadius: 12,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: active ? colors.surfaceHover : colors.transparent,
      }}
    >
      <Icon size={21} color={colors.textPrimary} strokeWidth={1.8} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontSize: typeScale.callout,
          fontWeight: active ? '600' : '400',
        }}
      >
        {label}
      </Text>
      {trailing}
    </PressableBox>
  );
}

function SectionHeading({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.textMuted,
        fontSize: typeScale.caption,
        fontWeight: '600',
        paddingHorizontal: 12,
      }}
    >
      {children}
    </Text>
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

  const localProjects = useProjectStore((s) => s.projects);
  const cloudProjects = useCloudProjectStore((s) => s.projects);
  const { appMode, cloudUnlocked, switchToLocal, switchToCloud } = useAppModeSwitch();
  const subscriptionTier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const usageOwnerId = useCloudUsageStore((s) => s.ownerId);
  const usagePlanTier = useCloudUsageStore((s) => s.snapshot?.planTier);
  // Cloud-only, and only where both the plan and the capability document grant
  // AGI Work; the server still decides.
  const showAgiWork =
    appMode === 'cloud' &&
    canUseBillingPlanCapability(subscriptionTier, 'agi_work') &&
    grantedCapabilities.includes('canUseAgiWork');

  const { usesPersistentDrawer } = useTabletLayout();
  const drawerOpen = isDrawerOpen(props.state);
  const { t } = useTranslation();
  const listArrangement = useSettingsStore((s) => s.listArrangement);
  const setListArrangement = useSettingsStore((s) => s.setListArrangement);
  const moreOpen = useSettingsStore((s) => s.sidePanelMoreOpen);
  const setMoreOpen = useSettingsStore((s) => s.setSidePanelMoreOpen);
  const projectsFolded = useSettingsStore((s) => s.sidePanelProjectsFolded);
  const setProjectsFolded = useSettingsStore((s) => s.setSidePanelProjectsFolded);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const organizeMenu = useMemo<ConversationMenuState>(
    () => ({
      visible: organizeOpen,
      title: t('drawer.organizeChats'),
      close: () => setOrganizeOpen(false),
      actions: [
        {
          key: 'organize-one-list',
          label: t('drawer.inOneList'),
          selected: listArrangement === 'one-list',
          run: () => setListArrangement('one-list'),
        },
        {
          key: 'organize-by-project',
          label: t('drawer.byProject'),
          selected: listArrangement === 'by-project',
          run: () => setListArrangement('by-project'),
        },
      ],
    }),
    [listArrangement, organizeOpen, setListArrangement, t],
  );
  const groupedByProject = listArrangement === 'by-project';
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

  const showUpgrade =
    NATIVE_PURCHASES_AVAILABLE &&
    appMode === 'cloud' &&
    isClerkSignedIn &&
    Boolean(clerkUserId) &&
    isFreeBillingPlanTier(
      (usageOwnerId === clerkUserId ? usagePlanTier : undefined) ?? subscriptionTier,
    );

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

  const handleSelectMode = useCallback(
    (mode: 'local' | 'cloud') => {
      if (mode === appMode) return;
      const switched = mode === 'cloud' ? switchToCloud() : switchToLocal();
      closeDrawer();
      if (switched) router.push({ pathname: '/(app)/(tabs)/chat' as const });
    },
    [appMode, closeDrawer, router, switchToCloud, switchToLocal],
  );

  const handleOpenSearch = useCallback(() => {
    navigate('/(app)/search');
  }, [navigate]);

  const historyConversations = useMemo(() => {
    // Cloud rows live only in the cloud store; the local store holds a stale
    // mirror that server responses never update.
    const source = appMode === 'cloud' ? cloudConversations : conversations;
    return source.filter(
      (conversation) =>
        executionModeForConversation(conversation) === appMode &&
        isHistoryVisibleConversation(conversation),
    );
  }, [appMode, cloudConversations, conversations]);

  const displayedProjects = useMemo(() => {
    if (!FEATURES.projects || !groupedByProject) return [];
    if (appMode === 'cloud') {
      const source = cloudProjects
        .filter((p) => p.deletedAt === null && !p.isArchived)
        .map((p) => ({
          id: p.id,
          name: p.name,
          updatedAt: p.updatedAt,
          pinned: isCloudProjectPinned(p),
        }));
      return pinnedFirst(
        source.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      ).slice(0, 6);
    }
    return pinnedFirst(
      localProjects.map((p) => ({ id: p.id, name: p.name, pinned: p.pinned === true })),
    ).slice(0, 6);
  }, [appMode, cloudProjects, groupedByProject, localProjects]);

  const displayedProjectIds = useMemo(
    () => new Set(displayedProjects.map((project) => project.id)),
    [displayedProjects],
  );

  const { pinnedConversations, recentConversations } = useMemo(() => {
    const listed = historyConversations.filter(
      (conversation) => !conversation.projectId || !displayedProjectIds.has(conversation.projectId),
    );
    const pinned = listed
      .filter((conversation) => conversation.pinned)
      .slice(0, DRAWER_RECENT_LIMIT);
    const recent = listed
      .filter((conversation) => !conversation.pinned)
      .slice(0, DRAWER_RECENT_LIMIT - pinned.length);
    return { pinnedConversations: pinned, recentConversations: recent };
  }, [displayedProjectIds, historyConversations]);

  const projectConversations = useCallback(
    (projectId: string) =>
      historyConversations.filter((conversation) => conversation.projectId === projectId),
    [historyConversations],
  );

  const renderConversationRow = (
    conversation: ConversationSummary,
    { inset = 0, showPin = true }: { inset?: number; showPin?: boolean } = {},
  ) => {
    const active = pathname.includes(conversation.id);
    return (
      <PressableBox
        key={conversation.id}
        onPress={() => navigate('/(app)/chat/[id]', { id: conversation.id })}
        onLongPress={() => openActions(conversation.id, conversation.title || 'Untitled chat')}
        accessibilityRole="button"
        accessibilityLabel={t(
          conversation.unread ? 'drawer.openConversationUnread' : 'drawer.openConversation',
          { title: conversation.title },
        )}
        accessibilityHint="Long press for more actions"
        accessibilityState={{ selected: active }}
        style={{
          minHeight: 44,
          borderRadius: 12,
          paddingLeft: 12 + inset,
          paddingRight: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: active ? colors.surfaceHover : colors.transparent,
        }}
      >
        {showPin && conversation.pinned ? (
          <Pin size={12} color={colors.textMuted} fill={colors.textMuted} />
        ) : null}
        {rename.conversationId === conversation.id ? (
          <InlineRenameField rename={rename} />
        ) : (
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: typeScale.body,
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

  const { shortList, moreList } = useMemo(() => {
    const visible = PRIMARY_ITEMS.filter((item) => {
      if (item.key === 'schedules' && !FEATURES.schedules) return false;
      if (item.key === 'reports' && !FEATURES.research) return false;
      if (item.key === 'tasks' && !(FEATURES.cloudTasks && showAgiWork)) return false;
      return isShownInMode(item.route, appMode);
    });
    const folded = visible.filter((item) => item.folded);
    if (folded.length < DRAWER_MIN_FOLDED) return { shortList: visible, moreList: [] };
    return { shortList: visible.filter((item) => !item.folded), moreList: folded };
  }, [appMode, showAgiWork]);

  const activeKey = useCallback(
    (key: PrimaryItem['key']) => {
      const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
      if (key === 'projects') return p.includes('/projects');
      if (key === 'library') return p.includes('/library');
      if (key === 'agents') return p.includes('/agents');
      if (key === 'sites') return p.includes('/sites');
      if (key === 'reports') return p.includes('/reports');
      if (key === 'schedules') return p.includes('/schedules');
      if (key === 'code') return p.includes('/cloud-code') || p.includes('/companion');
      if (key === 'tasks') return p.includes('/tasks');
      return false;
    },
    [pathname],
  );

  const renderDestination = (item: PrimaryItem) => (
    <NavRow
      key={item.key}
      label={item.labelKey ? t(item.labelKey) : (item.label ?? '')}
      icon={item.icon}
      active={activeKey(item.key)}
      onPress={() => navigate(item.route)}
    />
  );

  const moreHoldsActive = moreList.some((item) => activeKey(item.key));
  const MoreChevron = moreOpen ? ChevronUp : ChevronDown;
  const ProjectsChevron = projectsFolded ? ChevronRight : ChevronDown;
  const hasChatRows = pinnedConversations.length > 0 || recentConversations.length > 0;

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={{
        flex: 1,
        backgroundColor: colors.background,
        borderRightColor: colors.border,
        borderRightWidth: 1,
      }}
    >
      <View style={{ flex: 1, paddingHorizontal: 14 }}>
        <View
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View style={{ flex: 1, alignItems: 'flex-start', paddingLeft: 10 }}>
            <AgiMark size={BRAND_SYMBOL_SIZE} testID="drawer.brand-symbol" />
          </View>
          <HeaderIconButton label={t('search')} icon={Search} onPress={handleOpenSearch} />
        </View>

        <View style={{ paddingBottom: 8 }}>
          <ModeToggle
            mode={appMode}
            cloudUnlocked={cloudUnlocked}
            onTapLocal={() => handleSelectMode('local')}
            onTapCloud={() => handleSelectMode('cloud')}
          />
        </View>

        <ScrollView
          ref={scrollMemory.ref}
          onScroll={scrollMemory.onScroll}
          scrollEventThrottle={scrollMemory.scrollEventThrottle}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 2 }}>
            <NavRow label={t('drawer.newChat')} icon={SquarePen} onPress={handleNewChat} />
            {shortList.map(renderDestination)}
            {moreList.length > 0 ? (
              <NavRow
                label={t(moreOpen ? 'less' : 'more')}
                icon={MoreHorizontal}
                active={!moreOpen && moreHoldsActive}
                expanded={moreOpen}
                trailing={<MoreChevron size={18} color={colors.textMuted} />}
                onPress={() => setMoreOpen(!moreOpen)}
              />
            ) : null}
            {moreOpen ? moreList.map(renderDestination) : null}
          </View>

          <View
            style={{
              height: StyleSheet.hairlineWidth,
              marginVertical: 14,
              marginHorizontal: 12,
              backgroundColor: colors.border,
            }}
          />

          {displayedProjects.length > 0 ? (
            <View style={{ marginBottom: 18 }}>
              <PressableBox
                onPress={() => setProjectsFolded(!projectsFolded)}
                accessibilityRole="button"
                accessibilityLabel={t(
                  projectsFolded ? 'chat:sidebar.expandProjects' : 'chat:sidebar.collapseProjects',
                )}
                accessibilityState={{ expanded: !projectsFolded }}
                style={{
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingRight: 13,
                }}
              >
                <SectionHeading>{t('navProjects')}</SectionHeading>
                <ProjectsChevron size={16} color={colors.textMuted} />
              </PressableBox>
              {projectsFolded ? null : (
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
                            accessibilityLabel={t('drawer.openProject', { name: project.name })}
                            style={{
                              flex: 1,
                              minHeight: 44,
                              borderRadius: 12,
                              paddingHorizontal: 12,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {project.pinned ? (
                              <Pin size={12} color={colors.textMuted} fill={colors.textMuted} />
                            ) : null}
                            <Text
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                color: colors.textPrimary,
                                fontSize: typeScale.body,
                              }}
                            >
                              {project.name}
                            </Text>
                          </PressableBox>
                          {chats.length > 0 ? (
                            <PressableBox
                              onPress={() => toggleProject(project.id)}
                              accessibilityRole="button"
                              accessibilityLabel={t(
                                expanded ? 'drawer.hideChatsIn' : 'drawer.showChatsIn',
                                { name: project.name },
                              )}
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
                              .map((conversation) =>
                                renderConversationRow(conversation, { inset: 14 }),
                              )}
                            {chats.length > DRAWER_PROJECT_CHAT_LIMIT ? (
                              <PressableBox
                                onPress={() => navigate('/(app)/projects/[id]', { id: project.id })}
                                accessibilityRole="button"
                                accessibilityLabel={t('drawer.seeAllChatsIn', {
                                  name: project.name,
                                })}
                                style={{
                                  minHeight: 44,
                                  paddingLeft: 26,
                                  paddingRight: 12,
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={{ color: colors.textMuted, fontSize: typeScale.body }}>
                                  {t('drawer.seeAll')}
                                </Text>
                              </PressableBox>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          {pinnedConversations.length > 0 ? (
            <View style={{ marginBottom: 18 }}>
              <View style={{ minHeight: 32, justifyContent: 'center' }}>
                <SectionHeading>{t('chat:sidebar.pinned')}</SectionHeading>
              </View>
              <View style={{ gap: 1 }}>
                {pinnedConversations.map((conversation) =>
                  renderConversationRow(conversation, { showPin: false }),
                )}
              </View>
            </View>
          ) : null}

          <View>
            <View
              style={{
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <SectionHeading>{t('drawer.recents')}</SectionHeading>
              <PressableBox
                onPress={() => setOrganizeOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('drawer.organizeChats')}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <SlidersHorizontal size={16} color={colors.textMuted} />
              </PressableBox>
            </View>

            {recentConversations.length > 0 ? (
              <View style={{ gap: 1 }}>
                {recentConversations.map((conversation) => renderConversationRow(conversation))}
              </View>
            ) : null}
            {hasChatRows ? null : (
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typeScale.body,
                  paddingHorizontal: 12,
                }}
              >
                {t('drawer.noRecentChats')}
              </Text>
            )}
            <PressableBox
              onPress={() => navigate('/(app)/chats')}
              accessibilityRole="button"
              accessibilityLabel={t('drawer.seeAllChats')}
              style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.textMuted, fontSize: typeScale.body }}>
                {t('drawer.seeAllChats')}
              </Text>
            </PressableBox>
          </View>
        </ScrollView>
      </View>

      <View
        style={{
          paddingHorizontal: 14,
          paddingTop: 6,
          paddingBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <NavRow
            label={t('settings')}
            icon={Settings}
            active={pathname.includes('/settings')}
            onPress={() => navigate('/(app)/settings')}
          />
        </View>
        {showUpgrade ? (
          <FooterChip
            label={t('navUpgrade')}
            text={t('navUpgrade')}
            icon={CircleArrowUp}
            onPress={() => navigate('/(app)/settings/cloud-billing')}
          />
        ) : null}
      </View>
      <RenameConversationModal rename={rename} inline />
      <ActionMenuSheet menu={organizeMenu} />
    </SafeAreaView>
  );
}
