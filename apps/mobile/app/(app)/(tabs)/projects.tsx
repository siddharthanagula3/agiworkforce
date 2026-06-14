import { useCallback, useState } from 'react';
import {
  View,
  Pressable,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FolderOpen, Menu, Plus, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { ProjectCard } from '@/src/features/projects';
import { useProjectStore, type Project } from '@/src/features/projects/store';
import { useTheme } from '@/src/ui/theme';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';

/**
 * Projects tab -- manage project contexts that apply instructions to chat.
 * Tap a project to set it active, long-press for edit/delete.
 */
export default function ProjectsTabScreen() {
  const { colors, statusBarStyle } = useTheme();
  const navigation = useNavigation();
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formInstructions, setFormInstructions] = useState('');

  const openCreateModal = useCallback(() => {
    setEditingProject(null);
    setFormName('');
    setFormDescription('');
    setFormInstructions('');
    setModalVisible(true);
  }, []);

  const openEditModal = useCallback((project: Project) => {
    setEditingProject(project);
    setFormName(project.name);
    setFormDescription(project.description);
    setFormInstructions(project.instructions);
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(() => {
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
    setModalVisible(false);
  }, [formName, formDescription, formInstructions, editingProject, createProject, updateProject]);

  const handleProjectPress = useCallback(
    (id: string) => {
      // Toggle active: tap again to deactivate
      setActiveProject(activeProjectId === id ? null : id);
    },
    [activeProjectId, setActiveProject],
  );

  const handleProjectLongPress = useCallback(
    (id: string) => {
      const project = projects.find((p) => p.id === id);
      if (!project) return;

      Alert.alert(project.name, 'Choose an action', [
        {
          text: 'Edit',
          onPress: () => openEditModal(project),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Delete Project', `Are you sure you want to delete "${project.name}"?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => deleteProject(id),
              },
            ]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [projects, openEditModal, deleteProject],
  );

  const handleOpenDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }} edges={['top']}>
      <StatusBar style={statusBarStyle} />
      {/* Header */}
      <View className="flex-row items-center px-3 h-12 gap-2">
        <Pressable
          onPress={handleOpenDrawer}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          })}
          accessibilityLabel="Open navigation drawer"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Menu size={20} color={colors.textSecondary} />
        </Pressable>
        <View className="flex-row items-center gap-2 flex-1">
          <Text variant="subheading" style={{ color: colors.textPrimary }}>
            Projects
          </Text>
          {projects.length > 0 && (
            <Badge label={`${projects.length}`} color={activeProjectId ? 'teal' : 'gray'} />
          )}
        </View>

        <Pressable
          onPress={openCreateModal}
          className="w-8 h-8 rounded-lg items-center justify-center"
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceHover : colors.accentSurface,
            borderWidth: 1,
            borderColor: colors.accentBorder,
          })}
          accessibilityLabel="Create new project"
          accessibilityRole="button"
        >
          <Plus size={18} color={colors.teal} />
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
            onPress={() => setActiveProject(null)}
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
            className="px-5 py-2.5 rounded-xl active:opacity-80"
            style={{ backgroundColor: colors.textPrimary }}
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
          data={projects}
          contentContainerStyle={{ padding: 12 }}
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
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
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
              onPress={() => setModalVisible(false)}
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
