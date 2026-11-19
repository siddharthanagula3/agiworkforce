import { useCallback, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronRight, X } from 'lucide-react-native';
import { PROJECT_INSTRUCTIONS_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';
import { PageSheetSafeArea } from '@/src/features/chat/components/ModalSafeArea';
import { useProjectStore } from '@/src/features/projects/store';
import { toUserMessage } from '@/services/userMessage';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const PROJECT_INSTRUCTIONS_PLACEHOLDER = 'e.g. Use a professional tone. Keep answers short.';

const ROUND_BUTTON_SIZE = 36;
const TAP_AREA = 44;
const FOOTER_MIN_BOTTOM_PADDING = 16;
const ACCESSIBILITY_PREVIEW_LENGTH = 200;

export function ProjectInstructionsEntry({
  instructions,
  onPress,
}: {
  instructions: string;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  const preview = instructions.trim();
  if (!preview && !onPress) return null;
  if (!preview && onPress) {
    return (
      <Pressable
        testID="project-instructions-add"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Add instructions"
        style={{
          minHeight: TAP_AREA,
          paddingHorizontal: 16,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          Add instructions
        </Text>
      </Pressable>
    );
  }
  if (!onPress) {
    return (
      <View
        testID="project-instructions-readonly"
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 2,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          Instructions
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}
        >
          {preview}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      testID="project-instructions-row"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Instructions"
      accessibilityValue={{ text: preview.slice(0, ACCESSIBILITY_PREVIEW_LENGTH) }}
      style={{
        minHeight: TAP_AREA,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          Instructions
        </Text>
        <Text
          testID="project-instructions-preview"
          numberOfLines={2}
          style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}
        >
          {preview}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function RoundHeaderButton({
  label,
  onPress,
  disabled = false,
  filled = false,
  testID,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        width: TAP_AREA,
        height: TAP_AREA,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: ROUND_BUTTON_SIZE,
          height: ROUND_BUTTON_SIZE,
          borderRadius: ROUND_BUTTON_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? colors.textPrimary : colors.surfaceHover,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {children}
      </View>
    </Pressable>
  );
}

export function ProjectInstructionsSheet({
  projectId,
  projectName,
  instructions,
  onClose,
}: {
  projectId: string;
  projectName: string;
  instructions: string;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const updateProject = useProjectStore((s) => s.updateProject);
  const [text, setText] = useState(instructions);
  const [error, setError] = useState<string | null>(null);
  const changed = text.trim() !== instructions.trim();

  const requestClose = useCallback(() => {
    if (!changed) {
      onClose();
      return;
    }
    Alert.alert('Discard changes to the instructions?', 'Your edits are lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  }, [changed, onClose]);

  const save = useCallback(() => {
    if (!changed) return;
    try {
      updateProject(projectId, { instructions: text.trim() });
    } catch (cause) {
      setError(toUserMessage(cause, 'Could not save the instructions. Try again.'));
      return;
    }
    onClose();
  }, [changed, onClose, projectId, text, updateProject]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={requestClose}
      accessibilityViewIsModal
    >
      <PageSheetSafeArea style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: colors.background }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 8,
              minHeight: 56,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <RoundHeaderButton
              testID="project-instructions-close"
              label="Close instructions"
              onPress={requestClose}
            >
              <X size={18} color={colors.textPrimary} />
            </RoundHeaderButton>
            <Text
              variant="subheading"
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              style={{ color: colors.textPrimary }}
            >
              Instructions
            </Text>
            <RoundHeaderButton
              testID="project-instructions-save"
              label="Save instructions"
              onPress={save}
              disabled={!changed}
              filled
            >
              <Check size={18} color={colors.surfaceElevated} />
            </RoundHeaderButton>
          </View>

          <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
            <TextInput
              testID="project-instructions-input"
              accessibilityLabel="Project instructions"
              value={text}
              onChangeText={(value) => {
                setText(value);
                if (error) setError(null);
              }}
              placeholder={PROJECT_INSTRUCTIONS_PLACEHOLDER}
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
              maxLength={PROJECT_INSTRUCTIONS_MAX_LENGTH}
              style={{
                flex: 1,
                color: colors.textPrimary,
                fontSize: typeScale.body,
                textAlignVertical: 'top',
                paddingTop: 0,
              }}
            />
            {error ? (
              <Text
                accessibilityRole="alert"
                style={{ color: colors.agentError, fontSize: typeScale.footnote }}
              >
                {error}
              </Text>
            ) : null}
            <Text
              style={{
                color: colors.textMuted,
                fontSize: typeScale.footnote,
                lineHeight: 18,
                paddingBottom:
                  Platform.OS === 'ios'
                    ? Math.max(insets.bottom, FOOTER_MIN_BOTTOM_PADDING)
                    : FOOTER_MIN_BOTTOM_PADDING,
              }}
            >
              {`Tell AGI how to behave and respond within ${projectName}.`}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </PageSheetSafeArea>
    </Modal>
  );
}
