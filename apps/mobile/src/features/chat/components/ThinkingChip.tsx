import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, Clock, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { deriveReasoningPhrase, formatThinkingDuration } from '@agiworkforce/utils/reasoning';

interface ThinkingChipProps {
  /** Full thinking/reasoning text from the model */
  thinkingText: string;
  /** Whether thinking tokens are still streaming */
  isStreaming?: boolean;
  /** Duration in seconds shown after completion */
  duration?: number;
  /** Wall-clock ms when thinking began — drives the live elapsed timer while streaming */
  startedAtMs?: number;
}

/**
 * Reasoning as a one-line ACTION STATUS in the transcript, with the full text
 * behind a tap.
 *
 * This used to be an inline accordion that auto-expanded while streaming: on a
 * phone that meant a wall of chain-of-thought unfolding above the answer,
 * pushing the actual response off-screen and reflowing the list on every
 * token. The transcript now carries a single muted line ("Thought for 12s ›"),
 * and tapping it opens a bottom sheet with the reasoning — the same shape the
 * web surface uses (a status line that discloses on click), adapted to touch,
 * where a modal sheet is the native disclosure rather than an inline panel.
 *
 * While streaming, the line shows a live verb phrase and a real per-second
 * timer from `startedAtMs`; an open sheet keeps updating as tokens arrive.
 */
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

  // Live 1s tick while thinking streams — a real timer, not a static label.
  useEffect(() => {
    if (!isStreaming || startedAtMs === undefined) return;
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isStreaming, startedAtMs]);

  // Follow the stream while the sheet is open, so the newest reasoning is the
  // part the reader is looking at.
  useEffect(() => {
    if (!sheetOpen || !isStreaming) return;
    bodyScrollRef.current?.scrollToEnd({ animated: false });
  }, [sheetOpen, isStreaming, thinkingText]);

  const liveSeconds =
    isStreaming && startedAtMs !== undefined
      ? Math.max(0, (nowMs - startedAtMs) / 1000)
      : undefined;
  // A completed block with no reported duration (or a rounded-to-zero one) has
  // no timing to state — "Thought for 0s" under a long chain of reasoning is a
  // measurement that was never taken, so fall back to the plain label.
  const headerLabel = isStreaming
    ? liveSeconds !== undefined
      ? `${deriveReasoningPhrase(thinkingText)} • Thinking for ${formatThinkingDuration(liveSeconds)}`
      : deriveReasoningPhrase(thinkingText)
    : duration !== undefined && duration > 0
      ? `Thought for ${formatThinkingDuration(duration)}`
      : 'Thought process';

  // Don't render an empty completed block (edge case: <thinking></thinking>).
  if (!isStreaming && thinkingText.trim().length === 0) return null;

  return (
    <View style={{ marginVertical: 2 }}>
      {/* Status line — no card, no fill, no border. */}
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
          // accessible=false so this backdrop does not swallow the sheet's own
          // accessibility elements.
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
    // Tall enough to read a real chain of thought, short enough that the
    // message behind it stays visible as context.
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
