import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, Clock, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { deriveReasoningPhrase, formatThinkingDuration } from '@agiworkforce/utils/reasoning';

interface ThinkingChipProps {
  thinkingText: string;
  isStreaming?: boolean;
  duration?: number;
  startedAtMs?: number;
}

export function ThinkingChip({
  thinkingText,
  isStreaming,
  duration,
  startedAtMs,
}: ThinkingChipProps) {
  const colors = useThemeColors();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const bodyScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!isStreaming || startedAtMs === undefined) return;
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isStreaming, startedAtMs]);

  useEffect(() => {
    if (!sheetOpen || !isStreaming) return;
    bodyScrollRef.current?.scrollToEnd({ animated: false });
  }, [sheetOpen, isStreaming, thinkingText]);

  const liveSeconds =
    isStreaming && startedAtMs !== undefined
      ? Math.max(0, (nowMs - startedAtMs) / 1000)
      : undefined;
  const headerLabel = isStreaming
    ? liveSeconds !== undefined
      ? `${deriveReasoningPhrase(thinkingText)} • Thinking for ${formatThinkingDuration(liveSeconds)}`
      : deriveReasoningPhrase(thinkingText)
    : duration !== undefined && duration > 0
      ? `Thought for ${formatThinkingDuration(duration)}`
      : 'Thought process';

  if (!isStreaming && thinkingText.trim().length === 0) return null;

  return (
    <View style={{ marginVertical: 2 }}>
      {/* Status line, no card, no fill, no border. */}
      <Pressable
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Show reasoning"
        hitSlop={8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 6,
        }}
      >
        <Clock size={13} color={colors.textMuted} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, color: colors.textMuted }} numberOfLines={1}>
            {headerLabel}
          </Text>
        </View>

        <ChevronRight size={14} color={colors.textMuted} />
      </Pressable>

      {/*
        Native Modal, not an inline overlay: this app has no
        BottomSheetModalProvider, and a non-modal sheet renders inline and
        disappears from the accessibility tree (see ConversationExportSheet.tsx
        for the same finding and the same fix).
      */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
        accessibilityViewIsModal
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={() => setSheetOpen(false)}
          accessibilityLabel="Dismiss reasoning"
          accessibilityRole="button"
          accessible={false}
        >
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <Pressable
              style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}
              onPress={() => undefined}
              accessible={false}
            >
              <View style={[styles.grabber, { backgroundColor: colors.border }]} />

              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary }}>
                    {isStreaming ? 'Thinking' : 'Thought process'}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                    {headerLabel}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSheetOpen(false)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Close reasoning"
                >
                  <X size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <ScrollView
                ref={bodyScrollRef}
                style={styles.body}
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
              >
                <Text style={{ fontSize: 14, lineHeight: 21, color: colors.textPrimary }}>
                  {thinkingText}
                </Text>
              </ScrollView>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  safeArea: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    maxHeight: '75%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  body: {
    paddingTop: 4,
  },
});
