/**
 * Project Selector Bar
 *
 * Shown at the top of the chat tab. Displays the active project and lets
 * the user switch or clear it via a dropdown sheet. Also shows a context
 * indicator when a project is active.
 */
import { useState, useCallback } from 'react';
import { View, Pressable, Modal, FlatList, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
      style={{
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: colors.transparent,
      }}
      accessibilityLabel={`Select project: ${project.name}`}
      accessibilityRole="menuitem"
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
          flexShrink: 0,
          backgroundColor: isActive ? colors.accentSurface : colors.neutralSurface,
        }}
      >
        <FolderOpen size={16} color={isActive ? colors.teal : colors.textMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          className="text-[14px] font-medium"
          style={{ color: isActive ? colors.teal : colors.textPrimary, lineHeight: 19 }}
          numberOfLines={1}
        >
          {project.name}
        </Text>
        {project.description ? (
          <Text
            style={{ color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }}
            numberOfLines={1}
          >
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
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const sheetMaxHeight = Math.min(height * 0.66, 520);
  const listMaxHeight = Math.max(140, sheetMaxHeight - 132 - insets.bottom);

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
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setDropdownVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: colors.scrim,
          }}
          onPress={() => setDropdownVisible(false)}
          accessibilityViewIsModal
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surfaceOverlay,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderWidth: 1,
              borderColor: colors.border,
              borderBottomWidth: 0,
              maxHeight: sheetMaxHeight,
              overflow: 'hidden',
              paddingBottom: Math.max(insets.bottom, 10),
            }}
          >
            <View>
              <View
                style={{
                  alignItems: 'center',
                  paddingTop: 8,
                  paddingBottom: 4,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 4,
                    borderRadius: 999,
                    backgroundColor: colors.border,
                  }}
                />
              </View>

              <View
                style={{
                  paddingHorizontal: 18,
                  paddingTop: 8,
                  paddingBottom: 10,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}>
                  Projects
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 13,
                    lineHeight: 18,
                    marginTop: 3,
                  }}
                >
                  Choose the project context for this chat.
                </Text>
              </View>

              {/* Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 18,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  Select project
                </Text>
                <Pressable
                  onPress={() => setDropdownVisible(false)}
                  accessibilityLabel="Close project picker"
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    width: 34,
                    height: 34,
                    borderRadius: 17,
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
                style={{
                  minHeight: 58,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: colors.transparent,
                }}
                accessibilityLabel="No project"
                accessibilityRole="menuitem"
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                    flexShrink: 0,
                    backgroundColor: colors.neutralSurface,
                  }}
                >
                  <FolderMinus size={16} color={colors.textMuted} />
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 19, flex: 1 }}>
                  No project
                </Text>
                {!activeProjectId && <Check size={16} color={colors.textMuted} />}
              </Pressable>

              {/* Project list */}
              <FlatList
                data={projects}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: listMaxHeight }}
                contentContainerStyle={{ paddingBottom: 6 }}
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
