import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_INSTRUCTIONS_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '@agiworkforce/cloud-contracts';
import { PROJECT_TEMPLATES, getProjectTemplate } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { PageSheetSafeArea } from '@/src/features/chat/components/ModalSafeArea';
import { NewProjectSettingsSheet } from '@/src/features/projects/components/NewProjectSettingsSheet';
import type { ProjectEditor } from '@/src/features/projects/useProjectEditor';

const FOOTER_MIN_BOTTOM_PADDING = 16;

function EditorFooter({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const bottomPadding =
    Platform.OS === 'ios'
      ? Math.max(insets.bottom, FOOTER_MIN_BOTTOM_PADDING)
      : Math.max(FOOTER_MIN_BOTTOM_PADDING - insets.bottom, 0);
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: bottomPadding,
      }}
    >
      {children}
    </View>
  );
}

export function ProjectEditorModal({ editor }: { editor: ProjectEditor }) {
  const colors = useThemeColors();
  const {
    visible,
    editingProject,
    isCloud,
    formName,
    setFormName,
    formDescription,
    setFormDescription,
    formInstructions,
    setFormInstructions,
    selectedTemplateId,
    setSelectedTemplateId,
    memoryScope,
    setMemoryScope,
    requestClose,
    save,
  } = editor;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const showSettings = isCloud && !editingProject;

  useEffect(() => {
    if (!visible) setSettingsOpen(false);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={requestClose}
      accessibilityViewIsModal
    >
      <PageSheetSafeArea style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
          style={{ backgroundColor: colors.background }}
        >
          <View
            className="flex-row items-center px-4 min-h-14 border-b"
            style={{ borderBottomColor: colors.border }}
          >
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <Pressable
                hitSlop={6}
                onPress={requestClose}
                className="w-8 h-8 items-center justify-center rounded-lg"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                })}
                accessibilityRole="button"
                accessibilityLabel="Close project editor"
              >
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text
              variant="subheading"
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              style={{ color: colors.textPrimary }}
            >
              {editingProject ? 'Edit Project' : 'New Project'}
            </Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {showSettings ? (
                <Pressable
                  testID="project-editor-settings"
                  hitSlop={6}
                  onPress={() => setSettingsOpen(true)}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Project settings"
                >
                  <Text
                    maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                    style={{ color: colors.textPrimary, fontSize: typeScale.callout }}
                  >
                    Settings
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <ScrollView
            testID="project-editor-fields"
            className="flex-1 px-4 pt-5"
            keyboardShouldPersistTaps="handled"
          >
            {!editingProject ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.subhead,
                  marginBottom: 20,
                }}
              >
                {isCloud
                  ? 'Keep related chats, files, and instructions together in one place.'
                  : 'Keep related chats and instructions together in one place.'}
              </Text>
            ) : null}
            <View className="mb-5">
              <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                Name
              </Text>
              <TextInput
                accessibilityLabel="Project name"
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
                maxLength={PROJECT_NAME_MAX_LENGTH}
              />
            </View>

            {!editingProject ? (
              <View className="mb-5">
                <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                  Start from
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {PROJECT_TEMPLATES.map((template) => {
                      const selected = selectedTemplateId === template.id;
                      return (
                        <Pressable
                          key={template.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Start from ${template.label}`}
                          accessibilityState={{ selected }}
                          onPress={() => {
                            setSelectedTemplateId(template.id);
                            if (
                              !formName.trim() ||
                              PROJECT_TEMPLATES.some((entry) => entry.name === formName.trim())
                            ) {
                              setFormName(template.name);
                            }
                            setFormDescription(template.description);
                            setFormInstructions(template.instructions);
                          }}
                          style={{
                            minHeight: 44,
                            paddingHorizontal: 14,
                            borderRadius: 22,
                            borderWidth: 1,
                            borderColor: selected ? colors.teal : colors.border,
                            backgroundColor: selected
                              ? colors.surfaceHover
                              : colors.surfaceElevated,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
                            {template.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
                <Text
                  style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 8 }}
                >
                  {getProjectTemplate(selectedTemplateId)?.summary}
                </Text>
              </View>
            ) : null}

            <View className="mb-5">
              <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                Description
              </Text>
              <TextInput
                accessibilityLabel="Project description"
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
                maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
              />
            </View>

            <View className="mb-5">
              <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                Custom Instructions
              </Text>
              <Text className="text-sm mb-2" style={{ color: colors.textMuted }}>
                These instructions will be included as system context when this project is active.
              </Text>
              <TextInput
                accessibilityLabel="Project instructions"
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
                maxLength={PROJECT_INSTRUCTIONS_MAX_LENGTH}
              />
            </View>
          </ScrollView>
          <EditorFooter>
            <Pressable
              testID="project-editor-submit"
              onPress={save}
              disabled={!formName.trim()}
              style={{
                minHeight: 48,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: formName.trim() ? colors.textPrimary : colors.surfaceHover,
              }}
              accessibilityRole="button"
              accessibilityLabel={editingProject ? 'Save project' : 'Create project'}
            >
              <Text
                style={{
                  color: formName.trim() ? colors.surfaceElevated : colors.textMuted,
                  fontSize: typeScale.callout,
                  fontWeight: '600',
                }}
              >
                {editingProject ? 'Save project' : 'Create project'}
              </Text>
            </Pressable>
          </EditorFooter>
        </KeyboardAvoidingView>
      </PageSheetSafeArea>
      {showSettings ? (
        <NewProjectSettingsSheet
          visible={settingsOpen}
          memoryScope={memoryScope}
          onDone={(next) => {
            setMemoryScope(next);
            setSettingsOpen(false);
          }}
          onCancel={() => setSettingsOpen(false)}
        />
      ) : null}
    </Modal>
  );
}
