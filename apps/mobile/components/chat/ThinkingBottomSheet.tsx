import { useCallback, useMemo, useRef } from 'react';
import { View, Pressable } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

interface ThinkingBottomSheetProps {
  /** The full thinking/reasoning text */
  thinkingText: string;
  /** Whether the model is still streaming thinking tokens */
  isStreaming?: boolean;
  /** Controls sheet visibility (-1 = closed) */
  sheetIndex: number;
  /** Called when the sheet is closed */
  onClose: () => void;
}

/**
 * Strips <thinking> and <reasoning> XML tags from content.
 */
function stripReasoningTags(text: string): string {
  return text
    .replace(/<\/?thinking>/gi, '')
    .replace(/<\/?reasoning>/gi, '')
    .trim();
}

/**
 * Bottom sheet that shows full thinking/reasoning text.
 * Triggered by tapping the collapsed thinking line in chat.
 * Uses @gorhom/bottom-sheet with 90% snap point.
 */
export function ThinkingBottomSheet({
  thinkingText,
  isStreaming,
  sheetIndex,
  onClose,
}: ThinkingBottomSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['90%'], []);
  const cleanText = stripReasoningTags(thinkingText);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose],
  );

  const handleClose = useCallback(() => {
    sheetRef.current?.close();
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={sheetIndex}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      enablePanDownToClose
      backgroundStyle={{
        backgroundColor: colors.surfaceElevated,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }}
      handleIndicatorStyle={{
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        width: 36,
      }}
      backdropComponent={renderBackdrop}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={handleClose}
          style={{
            padding: 4,
            borderRadius: 8,
          }}
          accessibilityLabel="Close thought process"
          accessibilityRole="button"
        >
          <X size={20} color={colors.textSecondary} />
        </Pressable>

        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
            marginRight: 28, // Balance the X button width
          }}
        >
          Thought process
        </Text>
      </View>

      {/* Scrollable thinking content */}
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={true}
      >
        <Text
          style={{
            fontSize: 14,
            lineHeight: 22,
            color: 'rgba(245, 247, 251, 0.75)',
          }}
          selectable
        >
          {cleanText}
          {isStreaming ? '...' : ''}
        </Text>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
