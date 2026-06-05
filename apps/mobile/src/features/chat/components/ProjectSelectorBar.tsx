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
import { useProjectStore, type Project } from '@/src/features/projects/store';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';

// ---------------------------------------------------------------------------
// Dropdown item
// ---------------------------------------------------------------------------

interface ProjectDropdownItemProps {
  project: Project;
  isActive: boolean;
  colors: ColorScheme;
  onSelect: (id: string) => void;
}

function ProjectDropdownItem({ project, isActive, colors, onSelect }: ProjectDropdownItemProps) {
  return (
    <Pressable
      onPress={() => onSelect(project.id)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
      accessibilityLabel={`Select project: ${project.name}`}
      accessibilityRole="menuitem"
    >
      <View
        className="w-8 h-8 rounded-lg items-center justify-center"
        style={{ backgroundColor: isActive ? colors.accentSurface : colors.neutralSurface }}
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
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
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
  const colors = useThemeColors();
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
                backgroundColor: colors.accentSurface,
                borderWidth: 1,
                borderColor: colors.accentBorder,
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
              <ChevronDown size={11} color={colors.teal} />
              <Pressable
                onPress={handleClearProject}
                hitSlop={8}
                className="ml-0.5 active:opacity-60"
                accessibilityLabel="Clear project"
                accessibilityRole="button"
              >
                <X size={12} color={colors.teal} />
              </Pressable>
            </Pressable>
          </Animated.View>
        ) : (
          // No active project — compact selector button
          <Pressable
            onPress={handleOpenDropdown}
            className="flex-row items-center gap-1.5 self-start rounded-full px-3 py-1.5 active:opacity-70"
            style={{ backgroundColor: colors.neutralSurface }}
            accessibilityLabel="Select a project for this chat"
            accessibilityRole="button"
          >
            <FolderMinus size={12} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>No project</Text>
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
          style={{ backgroundColor: colors.scrim }}
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
                borderColor: colors.border,
              }}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  Select Project
                </Text>
                <Pressable
                  onPress={() => setDropdownVisible(false)}
                  style={({ pressed }) => ({
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                  })}
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
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                })}
                accessibilityLabel="No project"
                accessibilityRole="menuitem"
              >
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: colors.neutralSurface }}
                >
                  <FolderMinus size={16} color={colors.textMuted} />
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 14, flex: 1 }}>No project</Text>
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
                    colors={colors}
                    onSelect={handleSelect}
                  />
                )}
                ItemSeparatorComponent={() => (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: colors.borderLight,
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
