import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { markdownToPlainText } from '@/src/features/chat/utils/markdownPlainText';

interface SelectTextSheetProps {
  visible: boolean;
  text: string;
  onClose: () => void;
  onQuoteSelection?: (text: string) => void;
}

interface Selection {
  start: number;
  end: number;
}

export function SelectTextSheet({
  visible,
  text,
  onClose,
  onQuoteSelection,
}: SelectTextSheetProps) {
  const colors = useThemeColors();
  const plainText = useMemo(() => markdownToPlainText(text), [text]);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const selectedText = plainText.slice(selection.start, selection.end).trim();

  const quoteSelection = () => {
    if (!onQuoteSelection || !selectedText) return;
    onQuoteSelection(selectedText);
    setSelection({ start: 0, end: 0 });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 16,
              paddingRight: 4,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ fontSize: typeScale.callout, fontWeight: '600', color: colors.textPrimary }}
            >
              Select Text
            </Text>
            <PressableBox
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={18} color={colors.textSecondary} />
            </PressableBox>
          </View>
          {onQuoteSelection ? (
            <>
              <TextInput
                value={plainText}
                onChangeText={() => undefined}
                multiline
                editable={Platform.OS === 'android'}
                showSoftInputOnFocus={false}
                scrollEnabled
                onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
                accessibilityLabel="Message text"
                accessibilityHint="Select the part you want to quote in your reply"
                testID="select-text-input"
                style={{
                  flex: 1,
                  padding: 16,
                  fontSize: typeScale.callout,
                  lineHeight: 24,
                  color: colors.textPrimary,
                  textAlignVertical: 'top',
                }}
              />
              <View
                style={{
                  padding: 16,
                  gap: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text
                  style={{ fontSize: typeScale.footnote, color: colors.textMuted }}
                  numberOfLines={2}
                >
                  {selectedText
                    ? `“${selectedText}”`
                    : 'Select part of the message to quote it in your reply.'}
                </Text>
                <Button
                  title="Quote in reply"
                  onPress={quoteSelection}
                  disabled={!selectedText}
                  accessibilityState={{ disabled: !selectedText }}
                  testID="select-text-quote"
                />
              </View>
            </>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text
                selectable
                style={{ fontSize: typeScale.callout, lineHeight: 24, color: colors.textPrimary }}
              >
                {plainText}
              </Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
