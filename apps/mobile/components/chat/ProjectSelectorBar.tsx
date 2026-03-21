/**
 * Project Selector Bar
 *
 * Shown at the top of the chat tab. Displays the active project and lets
 * the user switch or clear it via a dropdown sheet. Also shows a context
 * indicator when a project is active.
 */
import { useState, useCallback } from 'react';
import { View, Pressable, Modal, FlatList } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FolderOpen, ChevronDown, X, Check, FolderMinus } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useProjectStore, type Project } from '@/stores/projectStore';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Dropdown item
// ---------------------------------------------------------------------------

interface ProjectDropdownItemProps {
  project: Project;
  isActive: boolean;
  onSelect: (id: string) => void;
}

function ProjectDropdownItem({ project, isActive, onSelect }: ProjectDropdownItemProps) {
  return (
    <Pressable
      onPress={() => onSelect(project.id)}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-white/5"
      accessibilityLabel={`Select project: ${project.name}`}
      accessibilityRole="menuitem"
    >
      <View
        className="w-8 h-8 rounded-lg items-center justify-center"
        style={{ backgroundColor: isActive ? `${colors.teal}20` : `${colors.textMuted}15` }}
      >
        <FolderOpen size={16} color={isActive ? colors.teal : colors.textMuted} />
      </View>
      <View className="flex-1">
        <Text
          className="text-[14px] font-medium"
          style={{ color: isActive ? colors.teal : colors.textPrimary }}
          numberOfLines={1}
        >
          {project.name}
        </Text>
        {project.description ? (
          <Text className="text-[11px] text-white/40 mt-0.5" numberOfLines={1}>
            {project.description}
          </Text>
        ) : null}
      </View>
      {isActive && <Check size={16} color={colors.teal} />}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProjectSelectorBar() {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const handleOpenDropdown = useCallback(() => {
    if (projects.length === 0) return;
    setDropdownVisible(true);
  }, [projects.length]);

  const handleSelect = useCallback(
    (id: string) => {
      // Toggle: selecting the already-active project clears it
      setActiveProject(activeProjectId === id ? null : id);
      setDropdownVisible(false);
    },
    [activeProjectId, setActiveProject],
  );

  const handleClearProject = useCallback(() => {
    setActiveProject(null);
  }, [setActiveProject]);

  // No projects — render nothing
  if (projects.length === 0) return null;

  return (
    <>
      <View className="px-4 pb-1">
        {activeProject ? (
          // Active project indicator pill
          <Animated.View entering={FadeIn.duration(200)}>
            <Pressable
              onPress={handleOpenDropdown}
              className="flex-row items-center gap-2 self-start rounded-full px-3 py-1.5 active:opacity-70"
              style={{
                backgroundColor: `${colors.teal}15`,
                borderWidth: 1,
                borderColor: `${colors.teal}30`,
              }}
              accessibilityLabel={`Active project: ${activeProject.name}. Tap to change`}
              accessibilityRole="button"
            >
              <FolderOpen size={12} color={colors.teal} />
              <Text
                className="text-[12px] font-medium flex-shrink"
                style={{ color: colors.teal }}
                numberOfLines={1}
              >
                {activeProject.name}
              </Text>
              <ChevronDown size={11} color={`${colors.teal}90`} />
              <Pressable
                onPress={handleClearProject}
                hitSlop={8}
                className="ml-0.5 active:opacity-60"
                accessibilityLabel="Clear project"
                accessibilityRole="button"
              >
                <X size={12} color={`${colors.teal}80`} />
              </Pressable>
            </Pressable>
          </Animated.View>
        ) : (
          // No active project — compact selector button
          <Pressable
            onPress={handleOpenDropdown}
            className="flex-row items-center gap-1.5 self-start rounded-full px-3 py-1.5 active:opacity-70"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            accessibilityLabel="Select a project for this chat"
            accessibilityRole="button"
          >
            <FolderMinus size={12} color={colors.textMuted} />
            <Text className="text-[11px] text-white/40">No project</Text>
            <ChevronDown size={11} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Project picker modal */}
      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setDropdownVisible(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="absolute left-4 right-4"
            style={{ top: 140, borderRadius: 16, overflow: 'hidden' }}
          >
            <View
              style={{
                backgroundColor: colors.surfaceOverlay,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between px-4 py-3 border-b border-white/8">
                <Text className="text-[13px] font-semibold text-white/70">Select Project</Text>
                <Pressable
                  onPress={() => setDropdownVisible(false)}
                  className="w-6 h-6 rounded-full items-center justify-center active:bg-white/10"
                >
                  <X size={14} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* "No project" option */}
              <Pressable
                onPress={() => {
                  setActiveProject(null);
                  setDropdownVisible(false);
                }}
                className="flex-row items-center gap-3 px-4 py-3 active:bg-white/5"
                accessibilityLabel="No project"
                accessibilityRole="menuitem"
              >
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                >
                  <FolderMinus size={16} color={colors.textMuted} />
                </View>
                <Text className="text-[14px] text-white/50 flex-1">No project</Text>
                {!activeProjectId && <Check size={16} color={colors.textMuted} />}
              </Pressable>

              {/* Project list */}
              <FlatList
                data={projects}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 280 }}
                renderItem={({ item }) => (
                  <ProjectDropdownItem
                    project={item}
                    isActive={item.id === activeProjectId}
                    onSelect={handleSelect}
                  />
                )}
                ItemSeparatorComponent={() => (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      marginHorizontal: 16,
                    }}
                  />
                )}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
