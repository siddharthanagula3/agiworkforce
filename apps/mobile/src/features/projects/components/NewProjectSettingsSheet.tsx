import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';
import { PageSheetSafeArea } from '@/src/features/chat/components/ModalSafeArea';
import type { NewProjectMemoryScope } from '@/src/features/projects/useProjectEditor';
import { useLargeTextRows } from '@/src/shared/hooks/useLargeTextRows';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';

const MEMORY_SCOPE_OPTIONS: ReadonlyArray<{
  scope: NewProjectMemoryScope;
  title: string;
  description: string;
}> = [
  {
    scope: 'default',
    title: 'Default memory',
    description: 'This project can use memories from your other chats.',
  },
  {
    scope: 'projectOnly',
    title: 'Project-only memory',
    description: 'This project uses only its own memories.',
  },
];

const SELECTED_BORDER_WIDTH = 2;
const UNSELECTED_BORDER_WIDTH = 1;
const CARD_PADDING = 16;

interface NewProjectSettingsSheetProps {
  visible: boolean;
  memoryScope: NewProjectMemoryScope;
  onDone: (memoryScope: NewProjectMemoryScope) => void;
  onCancel: () => void;
}

export function NewProjectSettingsSheet({
  visible,
  memoryScope,
  onDone,
  onCancel,
}: NewProjectSettingsSheetProps) {
  const colors = useThemeColors();
  const titleOnOwnLine = useLargeTextRows();
  const [draft, setDraft] = useState(memoryScope);

  useEffect(() => {
    if (visible) setDraft(memoryScope);
  }, [memoryScope, visible]);

  const title = (
    <Text
      variant="subheading"
      maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
      accessibilityRole="header"
      style={{ color: colors.textPrimary, textAlign: 'center' }}
    >
      Project settings
    </Text>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <PageSheetSafeArea style={{ flex: 1, backgroundColor: colors.background }}>
        <View className="px-4 border-b" style={{ borderBottomColor: colors.border }}>
          <View testID="new-project-settings-actions" className="flex-row items-center min-h-14">
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <Pressable
                testID="new-project-settings-cancel"
                hitSlop={6}
                onPress={onCancel}
                style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text
                  maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                  style={{ color: colors.textSecondary, fontSize: typeScale.callout }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
            {titleOnOwnLine ? null : title}
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Pressable
                testID="new-project-settings-done"
                hitSlop={6}
                onPress={() => onDone(draft)}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  justifyContent: 'center',
                  alignItems: 'flex-end',
                }}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text
                  maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.callout,
                    fontWeight: '600',
                  }}
                >
                  Done
                </Text>
              </Pressable>
            </View>
          </View>
          {titleOnOwnLine ? (
            <View testID="new-project-settings-title-line" style={{ paddingBottom: spacing.md }}>
              {title}
            </View>
          ) : null}
        </View>

        <ScrollView className="flex-1 px-4 pt-5">
          <Text
            accessibilityRole="header"
            style={{
              color: colors.textPrimary,
              fontSize: typeScale.callout,
              fontWeight: '600',
              marginBottom: 12,
            }}
          >
            Memory
          </Text>
          <View style={{ gap: 12 }}>
            {MEMORY_SCOPE_OPTIONS.map((option) => {
              const selected = draft === option.scope;
              const borderWidth = selected ? SELECTED_BORDER_WIDTH : UNSELECTED_BORDER_WIDTH;
              return (
                <Pressable
                  key={option.scope}
                  testID={`new-project-memory-${option.scope}`}
                  onPress={() => setDraft(option.scope)}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.title}. ${option.description}`}
                  accessibilityState={{ selected }}
                  style={{
                    minHeight: 44,
                    borderRadius: 12,
                    borderWidth,
                    borderColor: selected ? colors.teal : colors.border,
                    backgroundColor: colors.surfaceElevated,
                    padding: CARD_PADDING - borderWidth,
                  }}
                >
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.callout,
                      fontWeight: '600',
                    }}
                  >
                    {option.title}
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typeScale.subhead,
                      marginTop: 4,
                    }}
                  >
                    {option.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </PageSheetSafeArea>
    </Modal>
  );
}
