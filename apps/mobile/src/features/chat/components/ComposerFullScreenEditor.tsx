import { View, TextInput, Modal, KeyboardAvoidingView } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Minimize2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors, radii } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useFullScreenChrome } from '@/src/features/chat/chrome/fullScreenChrome';
import { useKeyboardSafeComposer } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { SendButton } from './SendButton';

interface ComposerFullScreenEditorProps {
  visible: boolean;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  sendState: 'idle' | 'streaming' | 'queued';
  canSend: boolean;
  onClose: () => void;
  onSend: () => void;
}

export function ComposerFullScreenEditor({
  visible,
  value,
  onChangeText,
  placeholder,
  sendState,
  canSend,
  onClose,
  onSend,
}: ComposerFullScreenEditorProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardSafeComposer('modal');
  const collapse = {
    onPress: onClose,
    label: 'Collapse editor',
    hint: 'Returns to the chat composer, keeping the message',
  };
  const chrome = useFullScreenChrome({
    surface: 'chat.composer.fullscreen',
    back: collapse,
    close: collapse,
  });

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={chrome.onRequestClose}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        behavior={keyboard.behavior}
        keyboardVerticalOffset={keyboard.keyboardVerticalOffset}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 12,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surfaceBase,
          }}
        >
          {/* One exit control only: collapsing IS dismissing and the message
              survives either way, so a second X would be duplicate chrome. */}
          <PressableBox
            {...chrome.back}
            style={{
              ...chrome.back.style,
              borderRadius: radii.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.inputSurface,
            }}
          >
            <Minimize2 size={18} color={colors.textPrimary} />
          </PressableBox>

          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              color: colors.textSecondary,
              fontSize: typeScale.body,
              fontWeight: '600',
            }}
          >
            Message
          </Text>

          <View
            testID="chat.composer.fullscreen.send"
            style={{ width: 36, alignItems: 'flex-end' }}
          >
            <SendButton state={sendState} onPress={onSend} disabled={!canSend} />
          </View>
        </View>

        <TextInput
          testID="chat.composer.fullscreen.input"
          style={{
            flex: 1,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 16),
            color: colors.textPrimary,
            fontSize: typeScale.callout,
            lineHeight: 22,
            textAlignVertical: 'top',
          }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          autoFocus
          accessible
          accessibilityLabel="Expanded message input"
          accessibilityHint="Edit the full message, then collapse or send"
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}
