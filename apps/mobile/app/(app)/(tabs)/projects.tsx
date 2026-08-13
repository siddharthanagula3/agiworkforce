import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
// From `expo-router`, not `@react-navigation/native` — see the note in
// app/(app)/(tabs)/chat.tsx: the monorepo resolves several copies of the
// navigation package, so the raw hook can land on a different context
// instance than the one expo-router's navigator provides.
import { useNavigation } from 'expo-router';
import { useRouter } from 'expo-router';
import { Filter, FolderOpen, Plus, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { ProjectCard } from '@/src/features/projects';
import { useProjectStore, type Project } from '@/src/features/projects/store';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTheme } from '@/src/ui/theme';
import { BottomSearchBar } from '@/src/shared/components/BottomSearchBar';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import {
  FloatingPrimaryAction,
  FLOATING_PRIMARY_ACTION_LIST_PADDING,
} from '@/src/shared/components/FloatingPrimaryAction';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useAuthStore } from '@/src/features/auth/store';
import {
  accountScopedUiStateKey,
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';

/**
 * Projects tab -- manage project contexts that apply instructions to chat.
 * Tap a project to open it; long-press for Set active / Rename / Delete.
 */
/** Project shape shared across local and cloud for display purposes. */
type DisplayProject = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  updatedAt: string;
};

function toDisplayProject(p: Project | CloudProject): DisplayProject {
  return {
    id: p.id,
    name: p.name,
    description: (p.description ?? '') as string,
    instructions: (p.instructions ?? '') as string,
    updatedAt: p.updatedAt,
  };
}

/**
 * List order. Both references pair the bottom search pill with a funnel chip
 * offering exactly these orders; the list used to render raw store order, which
 * made the relative timestamp on every card meaningless.
 *
 * NOT offered: "Created by you" / "Shared with you" ownership filters. Neither
 * project record carries an owner — `CloudProject`
 * (stores/projects/cloudProjectStore.ts:26-51) has no owner, creator or shared
 * field, and its `source` is the originating *device*, not a person. Shipping
 * ownership chips today would mean inventing the field they filter on.
 */
type ProjectSort = 'recent' | 'name' | 'active';

const SORT_LABELS: Record<ProjectSort, string> = {
  recent: 'Recently updated',
  name: 'Name',
  active: 'Active first',
};

function sortDisplayProjects(
  projects: readonly DisplayProject[],
  sort: ProjectSort,
  activeProjectId: string | null,
): DisplayProject[] {
  const byRecent = (a: DisplayProject, b: DisplayProject) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  const sorted = [...projects];
  if (sort === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }
  sorted.sort(byRecent);
  if (sort === 'active') {
    // Stable on top of the recency order, so the remaining rows keep the
    // default ordering rather than an arbitrary one.
    sorted.sort((a, b) => Number(b.id === activeProjectId) - Number(a.id === activeProjectId));
  }
  return sorted;
}

export default function ProjectsTabScreen() {
  const { colors, statusBarStyle } = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isCloud = appMode === 'cloud';
  const clerkUserId = useAuthStore((state) => state.clerkUserId);

  // Read from the appropriate store depending on mode.
  const localProjects = useProjectStore((s) => s.projects);
  const cloudProjectsRaw = useCloudProjectStore((s) => s.projects);
  // Only show non-tombstoned, non-archived cloud projects.
  const cloudProjects = useMemo(
    () => cloudProjectsRaw.filter((p) => p.deletedAt === null && !p.isArchived),
    [cloudProjectsRaw],
  );
  const projects: DisplayProject[] = useMemo(
    () => (isCloud ? cloudProjects.map(toDisplayProject) : localProjects.map(toDisplayProject)),
    [isCloud, cloudProjects, localProjects],
  );

  const localActiveId = useProjectStore((s) => s.activeProjectId);
  const cloudActiveId = useCloudProjectStore((s) => s.activeProjectId);
  const activeProjectId = isCloud ? cloudActiveId : localActiveId;
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProjectSort>('recent');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<DisplayProject | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const activeScopeRef = useRef<AccountScopedUiState | null>(null);
  const activeScopeKeyRef = useRef<string | null>(null);
  const editorScopeRef = useRef<AccountScopedUiState | null>(null);

  const resetEditor = useCallback(() => {
    editorScopeRef.current = null;
    setModalVisible(false);
    setEditingProject(null);
    setFormName('');
    setFormDescription('');
    setFormInstructions('');
  }, []);

  // The screen instance survives direct account switches. Bind its editor to
  // the scope that opened it and clear Cloud-owned fields before paint when
  // that epoch changes. A Local editor remains device-owned across Clerk
  // account changes because its scope key remains `local`.
  useLayoutEffect(() => {
    const nextScope = captureAccountScopedUiState(isCloud ? 'cloud' : 'local');
    const nextKey = accountScopedUiStateKey(nextScope);
    if (activeScopeKeyRef.current !== nextKey) resetEditor();
    activeScopeRef.current = nextScope;
    activeScopeKeyRef.current = nextKey;
  }, [clerkUserId, isCloud, resetEditor]);

  const isScopeCurrent = useCallback((captured: AccountScopedUiState | null | undefined) => {
    return isAccountScopedUiStateCurrent(
      captured,
      useChatAppModeStore.getState().appMode === 'cloud' ? 'cloud' : 'local',
    );
  }, []);

  const openCreateModal = useCallback(() => {
    const actionScope = activeScopeRef.current;
    if (!isScopeCurrent(actionScope)) return;
    editorScopeRef.current = actionScope;
    setEditingProject(null);
    setFormName('');
    setFormDescription('');
    setFormInstructions('');
    setModalVisible(true);
  }, [isScopeCurrent]);

  const openEditModal = useCallback(
    (project: DisplayProject, actionScope = activeScopeRef.current) => {
      if (!isScopeCurrent(actionScope)) return;
      editorScopeRef.current = actionScope;
      setEditingProject(project);
      setFormName(project.name);
      setFormDescription(project.description);
      setFormInstructions(project.instructions);
      setModalVisible(true);
    },
    [isScopeCurrent],
  );

  const handleSave = useCallback(() => {
    if (!isScopeCurrent(editorScopeRef.current)) {
      resetEditor();
      return;
    }
    const trimmedName = formName.trim();
    if (!trimmedName) return;

    if (editingProject) {
      updateProject(editingProject.id, {
        name: trimmedName,
        description: formDescription.trim(),
        instructions: formInstructions.trim(),
      });
    } else {
      createProject(trimmedName, formDescription.trim(), formInstructions.trim());
    }
    resetEditor();
  }, [
    createProject,
    editingProject,
    formDescription,
    formInstructions,
    formName,
    isScopeCurrent,
    resetEditor,
    updateProject,
  ]);

  // A project row is a navigation affordance in both references: tapping it
  // opens the project's own screen with its chats and sources. This used to
  // toggle the active-context flag and nothing else, so a tap looked like a
  // dead control while `/(app)/projects/[id]` — implemented and registered —
  // was reachable only from the drawer, the chats list and the in-conversation
  // project chip. "Set as active context" now lives on the long-press sheet.
  const handleProjectPress = useCallback(
    (id: string) => {
      if (!isScopeCurrent(activeScopeRef.current)) return;
      router.push({ pathname: '/(app)/projects/[id]', params: { id } });
    },
    [isScopeCurrent, router],
  );

  const handleProjectLongPress = useCallback(
    (id: string) => {
      const actionScope = activeScopeRef.current;
      if (!isScopeCurrent(actionScope)) return;
      const project = projects.find((p) => p.id === id);
      if (!project) return;
      const isActive = activeProjectId === id;

      Alert.alert(project.name, 'Choose an action', [
        {
          text: 'Open',
          onPress: () => {
            if (!isScopeCurrent(actionScope)) return;
            router.push({ pathname: '/(app)/projects/[id]', params: { id } });
          },
        },
        {
          text: isActive ? 'Clear active' : 'Set active',
          onPress: () => {
            if (!isScopeCurrent(actionScope)) return;
            setActiveProject(isActive ? null : id);
          },
        },
        {
          text: 'Rename',
          onPress: () => openEditModal(project, actionScope),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!isScopeCurrent(actionScope)) return;
            Alert.alert('Delete Project', `Are you sure you want to delete "${project.name}"?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  if (!isScopeCurrent(actionScope)) return;
                  deleteProject(id);
                },
              },
            ]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [
      activeProjectId,
      deleteProject,
      isScopeCurrent,
      openEditModal,
      projects,
      router,
      setActiveProject,
    ],
  );

  const handleClearActiveProject = useCallback(() => {
    if (!isScopeCurrent(activeScopeRef.current)) return;
    setActiveProject(null);
  }, [isScopeCurrent, setActiveProject]);

  // Search + sort are applied together: the funnel chip orders whatever the
  // search left, so a filtered list is never in raw store order either.
  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = normalized
      ? projects.filter(
          (project) =>
            project.name.toLocaleLowerCase().includes(normalized) ||
            project.description.toLocaleLowerCase().includes(normalized),
        )
      : projects;
    return sortDisplayProjects(matches, sort, activeProjectId);
  }, [activeProjectId, projects, query, sort]);

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

  const handleOpenDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }} edges={['top']}>
      <StatusBar style={statusBarStyle} />
      {/* Header */}
      <View className="flex-row items-center px-3 h-12 gap-2">
        <DrawerButton onPress={handleOpenDrawer} />
        <View className="flex-row items-center gap-2 flex-1">
          <Text variant="subheading" style={{ color: colors.textPrimary }}>
            Projects
          </Text>
          {projects.length > 0 && (
            <Badge label={`${projects.length}`} color={activeProjectId ? 'teal' : 'gray'} />
          )}
        </View>

        {/* Sort chip. Creation moved to the floating pill below: this header
            square was 32×32, under the 44pt iOS minimum, and was the only way
            to make a project. */}
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
          <Filter size={19} color={sort === 'recent' ? colors.textSecondary : colors.teal} />
        </Pressable>
      </View>

      {/* Active project indicator */}
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
          <Text className="text-[12px] flex-1" style={{ color: colors.teal }} numberOfLines={1}>
            Active: {projects.find((p) => p.id === activeProjectId)?.name}
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
            <Text className="text-[11px]" style={{ color: colors.textSecondary }}>
              Clear
            </Text>
          </Pressable>
        </View>
      )}

      {/* Project list or empty state */}
      {projects.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
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
            onPress={openCreateModal}
            className="px-5 rounded-xl items-center justify-center active:opacity-80"
            // 44pt minimum touch target; `py-2.5` alone left it at ~38pt.
            style={{ backgroundColor: colors.textPrimary, minHeight: 44 }}
            accessibilityRole="button"
            accessibilityLabel="Create project"
          >
            <Text className="text-[14px] font-medium" style={{ color: colors.surfaceElevated }}>
              Create Project
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          testID="projects-list"
          data={visibleProjects}
          contentContainerStyle={{
            padding: 12,
            // Clears the floating create pill and the search field it stacks on.
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
          ListEmptyComponent={
            <View className="items-center px-8" style={{ paddingTop: 48, gap: 8 }}>
              <Text
                className="text-[15px] font-semibold text-center"
                style={{ color: colors.textPrimary }}
              >
                No matches
              </Text>
              <Text className="text-[13px] text-center" style={{ color: colors.textMuted }}>
                No project matches “{query.trim()}”.
              </Text>
            </View>
          }
        />
      )}

      {/* Bottom-anchored search + floating create pill, the same pair the
          chats list uses (PAR-M30/M31). Both are hidden while there is nothing
          to search — the empty state above carries its own create action, so
          the screen never shows two competing create affordances. */}
      {projects.length > 0 ? (
        <>
          <FloatingPrimaryAction
            label="New project"
            icon={Plus}
            onPress={openCreateModal}
            accessibilityLabel="Create new project"
          />
          <BottomSearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search projects"
            accessibilityLabel="Search projects"
            clearAccessibilityLabel="Clear project search"
            testID="projects-search"
          />
        </>
      ) : null}

      {/* Create/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={resetEditor}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
          style={{ backgroundColor: colors.background }}
        >
          {/* Modal header */}
          <View
            className="flex-row items-center justify-between px-4 h-14 border-b"
            style={{ borderBottomColor: colors.border }}
          >
            <Pressable
              onPress={resetEditor}
              className="w-8 h-8 items-center justify-center rounded-lg"
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
              })}
              accessibilityRole="button"
              accessibilityLabel="Close project editor"
            >
              <X size={20} color={colors.textMuted} />
            </Pressable>
            <Text variant="subheading" style={{ color: colors.textPrimary }}>
              {editingProject ? 'Edit Project' : 'New Project'}
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={!formName.trim()}
              className="px-3 py-1.5 rounded-lg active:opacity-80"
              style={{
                backgroundColor: formName.trim() ? colors.textPrimary : colors.surfaceHover,
              }}
              accessibilityRole="button"
              accessibilityLabel={editingProject ? 'Save project' : 'Create project'}
            >
              <Text
                className="text-[13px] font-medium"
                style={{
                  color: formName.trim() ? colors.surfaceElevated : colors.textMuted,
                }}
              >
                {editingProject ? 'Save' : 'Create'}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 px-4 pt-5" keyboardShouldPersistTaps="handled">
            {/* Name field */}
            <View className="mb-5">
              <Text
                className="text-[13px] font-medium mb-2"
                style={{ color: colors.textSecondary }}
              >
                Name
              </Text>
              <TextInput
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Mobile App, API Docs..."
                placeholderTextColor={colors.textMuted}
                className="px-3.5 py-3 rounded-xl text-[15px]"
                style={{
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textPrimary,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                autoFocus
                maxLength={100}
              />
            </View>

            {/* Description field */}
            <View className="mb-5">
              <Text
                className="text-[13px] font-medium mb-2"
                style={{ color: colors.textSecondary }}
              >
                Description
              </Text>
              <TextInput
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder="Brief description of this project..."
                placeholderTextColor={colors.textMuted}
                className="px-3.5 py-3 rounded-xl text-[15px]"
                style={{
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textPrimary,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                multiline
                numberOfLines={2}
                maxLength={500}
              />
            </View>

            {/* Instructions field */}
            <View className="mb-5">
              <Text
                className="text-[13px] font-medium mb-2"
                style={{ color: colors.textSecondary }}
              >
                Custom Instructions
              </Text>
              <Text className="text-[11px] mb-2" style={{ color: colors.textMuted }}>
                These instructions will be included as system context when this project is active.
              </Text>
              <TextInput
                value={formInstructions}
                onChangeText={setFormInstructions}
                placeholder="e.g. Always use TypeScript. Follow the project's coding conventions..."
                placeholderTextColor={colors.textMuted}
                className="px-3.5 py-3 rounded-xl text-[15px]"
                style={{
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textPrimary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  minHeight: 120,
                  textAlignVertical: 'top',
                }}
                multiline
                numberOfLines={6}
                maxLength={5000}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
