import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Brain, ChevronRight, Clock, Globe, X } from 'lucide-react-native';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import { Text } from '@/components/ui/text';
import { motion, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { hostnameOf, isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { deriveReasoningPhrase, formatThinkingDuration } from '@agiworkforce/utils/reasoning';

const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 800;
const RAIL_WIDTH = 28;
const HEADING_LINE = /^\s*(?:\*\*(.+?)\*\*|#{1,4}\s+(.+?))\s*$/;

export interface ThinkingSource {
  url: string;
  title: string;
}

export type ThinkingStep =
  | { id: string; kind: 'thought'; title: string; body: string }
  | {
      id: string;
      kind: 'search';
      title: string;
      body?: string;
      sources: ThinkingSource[];
      failed?: boolean;
    };

interface ThinkingChipProps {
  thinkingText: string;
  isStreaming?: boolean;
  duration?: number;
  startedAtMs?: number;
  activity?: AgentActivityState;
}

function parseThoughtSteps(thinkingText: string): ThinkingStep[] {
  const sections: { title?: string; lines: string[] }[] = [{ lines: [] }];
  for (const line of thinkingText.split('\n')) {
    const heading = HEADING_LINE.exec(line);
    const title = (heading?.[1] ?? heading?.[2])?.trim();
    if (title) {
      sections.push({ title, lines: [] });
    } else {
      sections[sections.length - 1]!.lines.push(line);
    }
  }
  const steps: ThinkingStep[] = [];
  sections.forEach((section) => {
    const body = section.lines.join('\n').trim();
    if (!section.title && !body) return;
    steps.push({
      id: `thought-${steps.length}`,
      kind: 'thought',
      title: section.title ?? 'Reasoning',
      body,
    });
  });
  return steps;
}

function dedupeSources(sources: readonly ThinkingSource[]): ThinkingSource[] {
  const seen = new Set<string>();
  const unique: ThinkingSource[] = [];
  for (const source of sources) {
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    unique.push({ url: source.url, title: source.title });
  }
  return unique;
}

function parseSearchSteps(activity: AgentActivityState): ThinkingStep[] {
  const searchToolIds = new Set(
    activity.entries.flatMap((entry) =>
      entry.kind === 'tool' && entry.category === 'web-search' && !entry.unavailable
        ? [entry.toolCallId]
        : [],
    ),
  );
  const steps: ThinkingStep[] = [];
  for (const entry of activity.entries) {
    if (entry.kind === 'tool' && entry.category === 'web-search' && !entry.unavailable) {
      const linked = activity.entries.flatMap((candidate) =>
        candidate.kind === 'sources' && candidate.toolCallId === entry.toolCallId
          ? candidate.sources
          : [],
      );
      const failed = entry.status === 'failed';
      const body = failed ? entry.error : entry.query;
      steps.push({
        id: entry.id,
        kind: 'search',
        title: failed ? 'Search failed' : 'Searching the web',
        ...(body ? { body } : {}),
        sources: dedupeSources([...(entry.sources ?? []), ...linked]),
        ...(failed ? { failed: true } : {}),
      });
    } else if (
      entry.kind === 'sources' &&
      (entry.toolCallId === undefined || !searchToolIds.has(entry.toolCallId))
    ) {
      steps.push({
        id: entry.id,
        kind: 'search',
        title: 'Searching the web',
        ...(entry.query ? { body: entry.query } : {}),
        sources: dedupeSources(entry.sources),
      });
    }
  }
  return steps;
}

export function buildThinkingSteps(
  thinkingText: string,
  activity?: AgentActivityState,
): ThinkingStep[] {
  return [...parseThoughtSteps(thinkingText), ...(activity ? parseSearchSteps(activity) : [])];
}

function SourceChip({ source }: { source: ThinkingSource }) {
  const colors = useThemeColors();
  const hostname = hostnameOf(source.url);
  const handlePress = async () => {
    if (!isValidExternalHttpUrl(source.url)) return;
    const opened = await openUntrustedUrlInAppBrowser(source.url);
    if (!opened) Alert.alert('Could not open source', 'Check your connection and try again.');
  };
  return (
    <PressableBox
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={`${source.title}, web page on ${hostname}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: colors.surfaceHover,
      }}
    >
      <Globe size={14} color={colors.textMuted} />
      <Text numberOfLines={1} style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
        {hostname}
      </Text>
    </PressableBox>
  );
}

function ThinkingStepRow({ step, isLast }: { step: ThinkingStep; isLast: boolean }) {
  const colors = useThemeColors();
  const Icon = step.kind === 'search' ? Globe : Brain;
  const failed = step.kind === 'search' && step.failed === true;
  return (
    <View style={styles.stepRow} testID={`thinking-step-${step.id}`}>
      <View style={styles.rail}>
        <Icon size={18} color={failed ? colors.agentError : colors.textPrimary} />
        {isLast ? null : (
          <View
            testID="thinking-step-connector"
            style={[styles.connector, { backgroundColor: colors.border }]}
          />
        )}
      </View>
      <View style={[styles.stepContent, isLast ? null : styles.stepContentGap]}>
        <Text
          style={{
            fontSize: typeScale.callout,
            lineHeight: 22,
            color: failed ? colors.agentError : colors.textPrimary,
          }}
        >
          {step.title}
        </Text>
        {step.body ? (
          <Text
            style={{
              fontSize: typeScale.subhead,
              lineHeight: 21,
              color: colors.textSecondary,
              marginTop: 4,
            }}
          >
            {step.body}
          </Text>
        ) : null}
        {step.kind === 'search' && step.sources.length > 0 ? (
          <View style={styles.chips}>
            {step.sources.map((source) => (
              <SourceChip key={source.url} source={source} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ThinkingChip({
  thinkingText,
  isStreaming,
  duration,
  startedAtMs,
  activity,
}: ThinkingChipProps) {
  const colors = useThemeColors();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const bodyScrollRef = useRef<ScrollView>(null);
  const dragY = useSharedValue(0);
  const steps = useMemo(() => buildThinkingSteps(thinkingText, activity), [thinkingText, activity]);

  const openSheet = () => {
    dragY.value = 0;
    setSheetOpen(true);
  };
  const closeSheet = () => setSheetOpen(false);

  const dismissGesture = Gesture.Pan()
    .runOnJS(true)
    .withTestId('thinking-sheet-drag')
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        setSheetOpen(false);
        return;
      }
      dragY.value = withTiming(0, { duration: motion.quick });
    });

  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

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
      <PressableBox
        onPress={openSheet}
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
          <Text style={{ fontSize: typeScale.footnote, color: colors.textMuted }} numberOfLines={1}>
            {headerLabel}
          </Text>
        </View>

        <ChevronRight size={14} color={colors.textMuted} />
      </PressableBox>

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
        onRequestClose={closeSheet}
        accessibilityViewIsModal
      >
        <GestureHandlerRootView style={styles.root}>
          <PressableBox
            style={[styles.backdrop, { backgroundColor: colors.scrim }]}
            onPress={closeSheet}
            accessibilityLabel="Dismiss reasoning"
            accessibilityRole="button"
            accessible={false}
          >
            <SafeAreaView edges={['bottom']} style={styles.safeArea}>
              <Animated.View style={dragStyle}>
                <PressableBox
                  style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}
                  onPress={() => undefined}
                  accessible={false}
                >
                  <GestureDetector gesture={dismissGesture}>
                    <View collapsable={false}>
                      <View style={[styles.grabber, { backgroundColor: colors.border }]} />

                      <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                          <Text
                            accessibilityRole="header"
                            style={{
                              fontSize: typeScale.headline,
                              fontWeight: '600',
                              color: colors.textPrimary,
                            }}
                          >
                            {isStreaming ? 'Thinking' : 'Thought process'}
                          </Text>
                          <Text
                            style={{
                              fontSize: typeScale.caption,
                              color: colors.textMuted,
                              marginTop: 2,
                            }}
                          >
                            {headerLabel}
                          </Text>
                        </View>
                        <PressableBox
                          onPress={closeSheet}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel="Close reasoning"
                        >
                          <X size={20} color={colors.textMuted} />
                        </PressableBox>
                      </View>
                    </View>
                  </GestureDetector>

                  <ScrollView
                    ref={bodyScrollRef}
                    style={styles.body}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {steps.map((step, index) => (
                      <ThinkingStepRow
                        key={step.id}
                        step={step}
                        isLast={index === steps.length - 1}
                      />
                    ))}
                  </ScrollView>
                </PressableBox>
              </Animated.View>
            </SafeAreaView>
          </PressableBox>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stepRow: {
    flexDirection: 'row',
  },
  rail: {
    width: RAIL_WIDTH,
    alignItems: 'center',
    paddingTop: 2,
  },
  connector: {
    flex: 1,
    width: 2,
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 1,
  },
  stepContent: {
    flex: 1,
    minWidth: 0,
  },
  stepContentGap: {
    paddingBottom: 18,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
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
