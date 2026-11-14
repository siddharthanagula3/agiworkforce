import { KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { PROJECT_TEMPLATES, getProjectTemplate } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { ProjectEditor } from '@/src/features/projects/useProjectEditor';

export function ProjectEditorModal({ editor }: { editor: ProjectEditor }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
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
    close,
    save,
  } = editor;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <View
          className="flex-row items-center justify-between px-4 h-14 border-b"
          style={{ borderBottomColor: colors.border }}
        >
          <Pressable
            onPress={close}
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
          <View style={{ width: 32 }} />
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
              maxLength={100}
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
                          backgroundColor: selected ? colors.surfaceHover : colors.surfaceElevated,
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
              <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 8 }}>
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
              maxLength={500}
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
              maxLength={5000}
            />
          </View>
        </ScrollView>
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
