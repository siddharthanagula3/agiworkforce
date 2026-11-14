import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View, ScrollView, FlatList, RefreshControl } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useRouter } from 'expo-router';
import { ArrowUpDown, Filter, FolderOpen, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { ProjectCard } from '@/src/features/projects';
import { ProjectEditorModal } from '@/src/features/projects/components/ProjectEditorModal';
import { SharedWithYouSection } from '@/src/features/projects/components/SharedWithYouSection';
import { useProjectStore } from '@/src/features/projects/store';
import {
  CLOUD_PROJECT_FILTERS,
  FILTER_LABELS,
  SORT_LABELS,
  cloudProjectToDisplay,
  localProjectToDisplay,
  projectsForFilter,
  sortDisplayProjects,
  type DisplayProject,
  type ProjectFilter,
  type ProjectSort,
} from '@/src/features/projects/projectList';
import { useProjectActions } from '@/src/features/projects/useProjectActions';
import { useProjectEditor } from '@/src/features/projects/useProjectEditor';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import type { ConversationMenuState } from '@/src/features/conversation-actions/useConversationActions';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { BottomSearchBar } from '@/src/shared/components/BottomSearchBar';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import {
  FloatingPrimaryAction,
  FLOATING_PRIMARY_ACTION_LIST_PADDING,
} from '@/src/shared/components/FloatingPrimaryAction';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { syncNow } from '@/services/cloudSyncEngine';
import { refreshCloudProjectDetails } from '@/src/features/projects/service';

const SHARED_EMPTY_MESSAGE = 'Nothing is shared with you yet.';

export default function ProjectsTabScreen() {
  const { colors, isDark, statusBarStyle } = useTheme();
  const pageBackground = isDark ? colors.background : colors.surfaceBase;
  const navigation = useNavigation();
  const router = useRouter();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isCloud = appMode === 'cloud';
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const syncStatus = useCloudSyncStateStore((state) => state.status);

  const localProjects = useProjectStore((s) => s.projects);
  const cloudProjectsRaw = useCloudProjectStore((s) => s.projects);
  const cloudDetails = useCloudProjectStore((s) => s.details);
  const allProjects: DisplayProject[] = useMemo(
    () =>
      isCloud
        ? cloudProjectsRaw
            .filter((p) => p.deletedAt === null)
            .map((p) => cloudProjectToDisplay(p, cloudDetails[p.id]))
        : localProjects.map(localProjectToDisplay),
    [isCloud, cloudProjectsRaw, cloudDetails, localProjects],
  );
  const projects = useMemo(() => projectsForFilter(allProjects, 'all'), [allProjects]);

  const localActiveId = useProjectStore((s) => s.activeProjectId);
  const cloudActiveId = useCloudProjectStore((s) => s.activeProjectId);
  const activeProjectId = isCloud ? cloudActiveId : localActiveId;
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const [query, setQuery] = useState('');
  const [manualRefresh, setManualRefresh] = useState(false);
  const [sort, setSort] = useState<ProjectSort>('recent');
  const [filterChoice, setFilterChoice] = useState<ProjectFilter>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filter: ProjectFilter = isCloud ? filterChoice : 'all';

  const resetForScope = useCallback(() => {
    setManualRefresh(false);
    setFilterChoice('all');
  }, []);
  const editor = useProjectEditor(resetForScope);
  const { isScopeCurrent, currentScope, openCreate, openEdit } = editor;
  const projectActions = useProjectActions(openEdit);

  useEffect(() => {
    if (syncStatus !== 'syncing') setManualRefresh(false);
  }, [syncStatus]);

  useFocusEffect(
    useCallback(() => {
      if (!isCloud || !clerkUserId) return;
      void syncNow();
      const controller = new AbortController();
      void refreshCloudProjectDetails(controller.signal).catch(() => undefined);
      return () => controller.abort();
    }, [clerkUserId, isCloud]),
  );

  const refreshProjects = useCallback(() => {
    if (!isCloud) return;
    setManualRefresh(true);
    void syncNow().finally(() => {
      if (useCloudSyncStateStore.getState().status !== 'syncing') setManualRefresh(false);
    });
  }, [isCloud]);

  const handleProjectPress = useCallback(
    (id: string) => {
      if (!isScopeCurrent(currentScope())) return;
      router.push({ pathname: '/(app)/projects/[id]', params: { id } });
    },
    [currentScope, isScopeCurrent, router],
  );

  const handleProjectLongPress = useCallback(
    (id: string) => {
      if (!isScopeCurrent(currentScope())) return;
      projectActions.openActions(id);
    },
    [currentScope, isScopeCurrent, projectActions],
  );

  const handleClearActiveProject = useCallback(() => {
    if (!isScopeCurrent(currentScope())) return;
    setActiveProject(null);
  }, [currentScope, isScopeCurrent, setActiveProject]);

  const filteredProjects = useMemo(
    () => projectsForFilter(allProjects, filter),
    [allProjects, filter],
  );

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = normalized
      ? filteredProjects.filter(
          (project) =>
            project.name.toLocaleLowerCase().includes(normalized) ||
            project.description.toLocaleLowerCase().includes(normalized),
        )
      : filteredProjects;
    return sortDisplayProjects(matches, sort, activeProjectId);
  }, [activeProjectId, filteredProjects, query, sort]);

  const openSort = useCallback(() => {
    const option = (value: ProjectSort) => ({
      text: `${sort === value ? '✓ ' : ''}${SORT_LABELS[value]}`,
      onPress: () => setSort(value),
    });
    Alert.alert('Sort projects', 'Choose the order projects appear in this list.', [
      option('recent'),
      option('name'),
      option('active'),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [sort]);

  const filterMenu = useMemo<ConversationMenuState>(
    () => ({
      visible: filterMenuOpen,
      title: 'Show projects',
      actions: CLOUD_PROJECT_FILTERS.map((value) => ({
        key: `filter-${value}`,
        label: FILTER_LABELS[value],
        selected: filter === value,
        run: () => setFilterChoice(value),
      })),
      close: () => setFilterMenuOpen(false),
    }),
    [filter, filterMenuOpen],
  );

  const handleOpenDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const showEmptyState = projects.length === 0 && (filter === 'all' || filter === 'mine');
  const showSharedSection = isCloud && (filter === 'all' || filter === 'shared');
  const activeProjectName = projects.find((p) => p.id === activeProjectId)?.name;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pageBackground }} edges={['top']}>
      <StatusBar style={statusBarStyle} />
      <View className="flex-row items-center px-3 h-12 gap-2">
        <DrawerButton onPress={handleOpenDrawer} />
        <View
          testID="projects-title-group"
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Text
            variant="subheading"
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.headline,
              fontWeight: '600',
            }}
          >
            Projects
          </Text>
          {projects.length > 0 && (
            <Badge label={`${projects.length}`} color={activeProjectId ? 'teal' : 'gray'} />
          )}
        </View>

        {/* Creation lives in the floating pill below: the header square that
            used to hold it was under the 44pt iOS minimum. */}
        <Pressable
          onPress={openSort}
          accessibilityLabel={`Sort projects. ${SORT_LABELS[sort]}`}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              sort === 'recent'
                ? pressed
                  ? colors.surfaceHover
                  : colors.transparent
                : colors.accentSurface,
          })}
        >
          <ArrowUpDown size={19} color={sort === 'recent' ? colors.textSecondary : colors.teal} />
        </Pressable>
        {isCloud ? (
          <Pressable
            onPress={() => setFilterMenuOpen(true)}
            accessibilityLabel={`Filter projects. ${FILTER_LABELS[filter]}`}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                filter === 'all'
                  ? pressed
                    ? colors.surfaceHover
                    : colors.transparent
                  : colors.accentSurface,
            })}
          >
            <Filter size={19} color={filter === 'all' ? colors.textSecondary : colors.teal} />
          </Pressable>
        ) : null}
      </View>

      {activeProjectId && (
        <View
          className="mx-4 mb-2 px-3 py-2 rounded-lg flex-row items-center gap-2"
          style={{
            backgroundColor: colors.accentSurface,
            borderWidth: 1,
            borderColor: colors.accentBorder,
          }}
        >
          <FolderOpen size={14} color={colors.teal} />
          <Text className="text-sm flex-1" style={{ color: colors.teal }} numberOfLines={1}>
            Active: {activeProjectName}
          </Text>
          <Pressable
            onPress={handleClearActiveProject}
            className="px-2 py-0.5 rounded"
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
            accessibilityLabel="Clear active project"
            accessibilityRole="button"
          >
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              Clear
            </Text>
          </Pressable>
        </View>
      )}

      {showEmptyState ? (
        <ScrollView
          testID="projects-empty-scroll"
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}
          refreshControl={
            isCloud ? (
              <RefreshControl
                refreshing={manualRefresh}
                onRefresh={refreshProjects}
                tintColor={colors.textMuted}
              />
            ) : undefined
          }
        >
          {isCloud && syncStatus === 'syncing' ? (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <LoadingIndicator accessibilityLabel="Loading projects" />
              <Text style={{ color: colors.textSecondary }}>Loading projects</Text>
            </View>
          ) : isCloud && syncStatus === 'error' ? (
            <View accessibilityRole="alert" style={{ alignItems: 'center', gap: 12 }}>
              <Text style={{ color: colors.agentError, textAlign: 'center' }}>
                Projects could not be refreshed. Check your connection and try again.
              </Text>
              <Pressable
                onPress={refreshProjects}
                accessibilityRole="button"
                accessibilityLabel="Retry loading projects"
              >
                <Text style={{ color: colors.teal, fontWeight: '600' }}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <View
                className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
                style={{ backgroundColor: colors.accentSurface }}
              >
                <FolderOpen size={32} color={colors.teal} />
              </View>
              <Text
                className="text-[15px] text-center leading-[22px] mb-4"
                style={{ color: colors.textSecondary }}
              >
                No projects yet.{'\n'}Create one to add custom instructions to your chats.
              </Text>
              <Pressable
                onPress={openCreate}
                className="px-5 rounded-xl items-center justify-center active:opacity-80"
                style={{ backgroundColor: colors.textPrimary, minHeight: 44 }}
                accessibilityRole="button"
                accessibilityLabel="Create project"
              >
                <Text className="text-[14px] font-medium" style={{ color: colors.surfaceElevated }}>
                  Create Project
                </Text>
              </Pressable>
            </View>
          )}
          {showSharedSection ? (
            <View style={{ alignSelf: 'stretch' }}>
              <SharedWithYouSection />
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          testID="projects-list"
          data={visibleProjects}
          refreshControl={
            isCloud ? (
              <RefreshControl
                refreshing={manualRefresh}
                onRefresh={refreshProjects}
                tintColor={colors.textMuted}
              />
            ) : undefined
          }
          ListHeaderComponent={
            isCloud && syncStatus === 'error' ? (
              <View accessibilityRole="alert" style={{ padding: 12, gap: 8 }}>
                <Text style={{ color: colors.agentError }}>
                  Showing saved projects. The latest changes could not be refreshed.
                </Text>
                <Pressable
                  onPress={refreshProjects}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading projects"
                >
                  <Text style={{ color: colors.teal, fontWeight: '600' }}>Retry</Text>
                </Pressable>
              </View>
            ) : null
          }
          contentContainerStyle={{
            padding: 12,
            paddingBottom: FLOATING_PRIMARY_ACTION_LIST_PADDING,
          }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item, index }) => (
            <View className="px-1">
              <ProjectCard
                project={item}
                index={index}
                isActive={item.id === activeProjectId}
                onPress={handleProjectPress}
                onLongPress={handleProjectLongPress}
              />
            </View>
          )}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            showSharedSection && !query.trim() ? (
              <SharedWithYouSection
                emptyMessage={filter === 'shared' ? SHARED_EMPTY_MESSAGE : undefined}
              />
            ) : null
          }
          ListEmptyComponent={
            filter === 'shared' && !query.trim() ? null : (
              <View className="items-center px-8" style={{ paddingTop: 48, gap: 8 }}>
                <Text
                  className="text-[15px] font-semibold text-center"
                  style={{ color: colors.textPrimary }}
                >
                  {query.trim() ? 'No matches' : 'No archived projects'}
                </Text>
                <Text className="text-sm text-center" style={{ color: colors.textMuted }}>
                  {query.trim()
                    ? `No project matches “${query.trim()}”.`
                    : 'Projects you archive are kept here until you restore them.'}
                </Text>
              </View>
            )
          }
        />
      )}

      {/* Bottom-anchored search + floating create pill, the same pair the
          chats list uses (PAR-M30/M31). Both are hidden while there is nothing
          to search, the empty state above carries its own create action, so
          the screen never shows two competing create affordances. */}
      {!showEmptyState ? (
        <>
          <FloatingPrimaryAction
            label="New project"
            icon={Plus}
            tone="ink"
            onPress={openCreate}
            accessibilityLabel="Create new project"
          />
          {filter !== 'shared' ? (
            <BottomSearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Search projects"
              accessibilityLabel="Search projects"
              clearAccessibilityLabel="Clear project search"
              testID="projects-search"
            />
          ) : null}
        </>
      ) : null}

      <ProjectEditorModal editor={editor} />
      <ActionMenuSheet menu={projectActions.menu} dismissLabel="Dismiss project actions" />
      <ActionMenuSheet menu={filterMenu} dismissLabel="Dismiss project filter" />
    </SafeAreaView>
  );
}
