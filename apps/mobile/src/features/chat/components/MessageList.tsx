import { useRef, useEffect, useCallback, useState, type ReactElement } from 'react';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  AccessibilityInfo,
  View,
  RefreshControl,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import { MessageBubble } from './MessageBubble';
import { MessageListRow } from './MessageListRow';
import { ChatScrollIntoView } from './cards/ChatScrollIntoView';
import type { ResearchPlanDecision } from './research/ResearchRunCard';
import { ChatEmptyState } from './ChatEmptyState';
import { SwipeReplyRow } from './SwipeReplyRow';
import { radii, useThemeColors } from '@/src/ui/theme';
import { motion, typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { hasMessageStreamError } from '@/src/features/chat/utils/messageStreamError';
import {
  activityEndedByDecline,
  toolCallsEndedByDecline,
} from '@/src/features/chat/utils/declinedToolSteps';
import { readAgentActivityState } from '@/src/features/chat/utils/agentActivityState';
import {
  isStoppedFinishReason,
  settledTurnActivity,
  type LiveRunState,
} from '@/src/features/chat/utils/agentActivity';
import type { ChatMessage, MessageAttachment } from '@/types/chat';
import type {
  ToolApprovalDecisionValue,
  VariantInfoByMessageId,
} from '@agiworkforce/cloud-contracts';
import type { ImageAreaEdit } from '@/src/features/image/components/ImageAreaEditor';
import type { ImageWholeEdit } from '@/src/features/image/wholeImageEdit';
import type { VoiceOutputOwner } from '@/src/features/voice/services/voiceOutput';
import type { ResponseRatingDetailsInput } from '@/src/features/chat/services/cloudMessageMutations';

const NEAR_BOTTOM_THRESHOLD = 150;
const TIME_DIVIDER_GAP_MS = 3 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function shouldShowTimeDivider(
  previousCreatedAt: string | undefined,
  createdAt: string | undefined,
): boolean {
  if (!previousCreatedAt || !createdAt) return false;
  const previous = Date.parse(previousCreatedAt);
  const current = Date.parse(createdAt);
  if (Number.isNaN(previous) || Number.isNaN(current)) return false;
  return current - previous >= TIME_DIVIDER_GAP_MS;
}

export function TimeDivider({ createdAt, now }: { createdAt: string; now?: Date }) {
  const colors = useThemeColors();
  const { t } = useTranslation('chat');
  const sent = new Date(createdAt);
  if (Number.isNaN(sent.getTime())) return null;
  const reference = now ?? new Date();
  const daysAgo = Math.round((startOfDay(reference) - startOfDay(sent)) / (24 * 60 * 60 * 1000));
  const day =
    daysAgo === 0
      ? t('timeDivider.today', 'Today')
      : daysAgo === 1
        ? t('timeDivider.yesterday', 'Yesterday')
        : sent.toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            ...(sent.getFullYear() === reference.getFullYear() ? {} : { year: 'numeric' }),
          });
  const time = sent.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <View
      testID="chat.time-divider"
      accessible
      accessibilityLabel={`${day} ${time}`}
      style={styles.timeDivider}
    >
      <Text style={{ fontSize: typeScale.subhead, color: colors.textMuted }}>
        <Text style={{ fontWeight: '600', color: colors.textSecondary }}>{day}</Text> {time}
      </Text>
    </View>
  );
}

function latestUserMessageIdOf(messages: readonly ChatMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return messages[index]!.id;
  }
  return undefined;
}

function canRetry(message: ChatMessage): boolean {
  if (FEATURES.videoGen || message.role !== 'assistant') return true;
  return message.type !== 'video' && message.videoGenStatus === undefined;
}

interface MessageListProps {
  messages: ChatMessage[];
  speechOwner?: VoiceOutputOwner | null;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onRetryWithModel?: (messageId: string) => void;
  continuableMessageId?: string | null;
  onContinueMessage?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onScheduleMessage?: (messageId: string) => void;
  footer?: ReactElement | null;
  onEditImageArea?: (message: ChatMessage, edit: ImageAreaEdit) => void;
  onEditImage?: (message: ChatMessage, edit: ImageWholeEdit) => void;
  imageEditModelIds?: ReadonlySet<string>;
  inTemporaryChat?: boolean;
  onDeleteImageConversation?: () => void;
  variantInfoByMessageId?: VariantInfoByMessageId;
  onSelectVariant?: (messageId: string) => void;
  onSwitchModel?: () => void;
  onEditMessage?: (
    messageId: string,
    newContent: string,
    attachments?: MessageAttachment[],
  ) => boolean;
  editAttachmentsSupported?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  onQuoteReply?: (message: ChatMessage) => void;
  onReaction?: (messageId: string, reaction: 'thumbsUp' | 'thumbsDown' | null) => void;
  onSubmitRatingDetails?: (messageId: string, details: ResponseRatingDetailsInput) => Promise<void>;
  onPairDesktop?: () => void;
  onResolveToolApproval?: (
    messageId: string,
    toolCallId: string,
    decision: ToolApprovalDecisionValue,
    guidance?: string,
  ) => void;
  onResearchPlanDecision?: (messageId: string, decision: ResearchPlanDecision) => void;
  onRetryResearch?: (messageId: string) => void;
  onStopResearch?: () => void;
  onPauseResearch?: (messageId: string) => Promise<boolean>;
  resumingResearchMessageId?: string | null;
  onFollowUp?: (text: string) => void;
  highlightMessageId?: string;
  lastAnswerLiveRun?: LiveRunState;
}

export const RESPONDING_ANNOUNCEMENT = 'Responding';

function liveRunOf(
  message: ChatMessage,
  index: number,
  count: number,
  lastAnswerLiveRun: LiveRunState | undefined,
): LiveRunState | undefined {
  if (message.role !== 'assistant') return undefined;
  return index < count - 1 ? 'ended' : lastAnswerLiveRun;
}

export function turnOutcomeAnnouncement(message: ChatMessage): string {
  if (message.role !== 'assistant') return 'No response was generated';
  const storedActivity = readAgentActivityState(message.metadata?.['agentActivity']);
  const activity = storedActivity
    ? settledTurnActivity(storedActivity, {
        toolCalls: message.toolCalls,
        streaming: message.isStreaming === true,
        hasText: /\S/.test(message.content),
      })
    : undefined;
  const endedByDecline = activity
    ? activityEndedByDecline(activity, message.toolCalls)
    : toolCallsEndedByDecline(message.toolCalls ?? []);
  if (!endedByDecline && (message.status === 'error' || hasMessageStreamError(message))) {
    return 'Response failed';
  }
  const finishReason = message.metadata?.['finishReason'];
  if (isStoppedFinishReason(finishReason)) {
    return message.content.trim()
      ? 'Response stopped. Partial response saved.'
      : 'Response stopped';
  }
  return 'Response complete';
}

export function MessageList({
  messages,
  speechOwner,
  onDeleteMessage,
  onRetryMessage,
  onRetryWithModel,
  continuableMessageId = null,
  onContinueMessage,
  onBranch,
  onScheduleMessage,
  footer,
  onEditImageArea,
  onEditImage,
  imageEditModelIds,
  inTemporaryChat = false,
  onDeleteImageConversation,
  variantInfoByMessageId,
  onSelectVariant,
  onSwitchModel,
  onEditMessage,
  editAttachmentsSupported = false,
  onRefresh,
  refreshing = false,
  onQuoteReply,
  onReaction,
  onSubmitRatingDetails,
  onPairDesktop,
  onResolveToolApproval,
  onResearchPlanDecision,
  onRetryResearch,
  onStopResearch,
  onPauseResearch,
  resumingResearchMessageId = null,
  onFollowUp,
  highlightMessageId,
  lastAnswerLiveRun,
}: MessageListProps) {
  const colors = useThemeColors();
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const lastMessage = messages[messages.length - 1];
  const lastWasStreaming = useRef<{ id: string; streaming: boolean } | null>(null);
  useEffect(() => {
    const previous = lastWasStreaming.current;
    if (!lastMessage) {
      lastWasStreaming.current = null;
      return;
    }
    const streaming = lastMessage.isStreaming === true;
    if (previous?.id === lastMessage.id && previous.streaming && !streaming) {
      AccessibilityInfo.announceForAccessibility(turnOutcomeAnnouncement(lastMessage));
    } else if (streaming && lastMessage.role === 'assistant' && previous?.streaming !== true) {
      AccessibilityInfo.announceForAccessibility(RESPONDING_ANNOUNCEMENT);
    }
    lastWasStreaming.current = { id: lastMessage.id, streaming };
  }, [lastMessage]);

  const fabOpacity = useSharedValue(0);
  const fabStyle = useAnimatedStyle(() => ({ opacity: fabOpacity.value }));

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const followingBottomRef = useRef(true);
  const readerScrollingRef = useRef(false);
  const viewportRef = useRef<View>(null);
  const stopFollowingBottom = useCallback(() => {
    followingBottomRef.current = false;
  }, []);
  const contentHeightRef = useRef(0);
  const latestUserMessageId = latestUserMessageIdOf(messages);
  const sentMessageIdRef = useRef(latestUserMessageId);
  useEffect(() => {
    if (sentMessageIdRef.current === latestUserMessageId) return;
    sentMessageIdRef.current = latestUserMessageId;
    followingBottomRef.current = true;
  }, [latestUserMessageId]);

  const footerHeightRef = useRef(0);
  const hasFooter = Boolean(footer);
  useEffect(() => {
    if (!hasFooter) footerHeightRef.current = 0;
  }, [hasFooter]);
  const handleFooterLayout = useCallback((event: LayoutChangeEvent) => {
    footerHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  const trackReaderPosition = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    if (nearBottom) followingBottomRef.current = true;
    else if (readerScrollingRef.current) followingBottomRef.current = false;
    setShowScrollButton(distanceFromBottom >= NEAR_BOTTOM_THRESHOLD + footerHeightRef.current);
  }, []);

  const viewportHeightRef = useRef(0);
  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    const previousHeight = viewportHeightRef.current;
    viewportHeightRef.current = height;
    if (
      previousHeight === 0 ||
      height >= previousHeight ||
      !followingBottomRef.current ||
      readerScrollingRef.current
    ) {
      return;
    }
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    const previousHeight = contentHeightRef.current;
    contentHeightRef.current = height;
    if (height <= previousHeight || !followingBottomRef.current || readerScrollingRef.current) {
      return;
    }
    listRef.current?.scrollToEnd({ animated: previousHeight > 0 });
  }, []);

  useEffect(() => {
    fabOpacity.value = withTiming(showScrollButton ? 1 : 0, {
      duration: motion.quick,
      easing: Easing.out(Easing.ease),
    });
  }, [showScrollButton, fabOpacity]);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightMessageId || highlightHandledRef.current === highlightMessageId) return;
    const index = messages.findIndex((message) => message.id === highlightMessageId);
    if (index < 0) return;
    highlightHandledRef.current = highlightMessageId;
    followingBottomRef.current = false;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setHighlightedId(highlightMessageId);
  }, [highlightMessageId, messages]);
  useEffect(() => {
    if (!highlightedId) return;
    const timer = setTimeout(() => setHighlightedId(null), motion.ambient);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  const handleQuoteSelection = useCallback(
    (message: ChatMessage, text: string) => onQuoteReply?.({ ...message, content: text }),
    [onQuoteReply],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      // The column is on the row, not on the list, so a swipe anywhere in the
      // pane still scrolls the thread on a tablet. FlashList hands a cell to
      // whichever message takes its slot, such as the other version of an
      // answer; the key gives each message a row that never laid out another.
      <MessageListRow
        key={item.id}
        messageId={item.id}
        streaming={item.isStreaming === true}
        style={
          item.id === highlightedId
            ? [
                contentColumn('reading'),
                { backgroundColor: colors.accentSurface, borderRadius: radii.md },
              ]
            : contentColumn('reading')
        }
      >
        {shouldShowTimeDivider(messages[index - 1]?.createdAt, item.createdAt) ? (
          <TimeDivider createdAt={item.createdAt} />
        ) : null}
        <SwipeReplyRow message={item} onSwipeReply={onQuoteReply} colors={colors}>
          <MessageBubble
            message={item}
            speechOwner={speechOwner}
            onDeleteMessage={onDeleteMessage}
            onRetryMessage={canRetry(item) ? onRetryMessage : undefined}
            onRetryWithModel={canRetry(item) ? onRetryWithModel : undefined}
            onContinueMessage={item.id === continuableMessageId ? onContinueMessage : undefined}
            onBranch={onBranch}
            onScheduleMessage={onScheduleMessage}
            onEditImageArea={onEditImageArea}
            onEditImage={onEditImage}
            imageEditModelIds={imageEditModelIds}
            inTemporaryChat={inTemporaryChat}
            onDeleteImageConversation={onDeleteImageConversation}
            variant={variantInfoByMessageId?.[item.id]}
            onSelectVariant={onSelectVariant}
            onSwitchModel={onSwitchModel}
            onEditMessage={onEditMessage}
            editAttachmentsSupported={editAttachmentsSupported}
            onReaction={onReaction}
            onSubmitRatingDetails={onSubmitRatingDetails}
            onResolveToolApproval={onResolveToolApproval}
            onResearchPlanDecision={onResearchPlanDecision}
            onRetryResearch={onRetryResearch}
            onStopResearch={onStopResearch}
            onPauseResearch={onPauseResearch}
            isResumingResearch={resumingResearchMessageId === item.id}
            onQuoteSelection={onQuoteReply ? handleQuoteSelection : undefined}
            onFollowUp={item.role === 'assistant' ? onFollowUp : undefined}
            nextAnswerId={
              item.role === 'user' && messages[index + 1]?.role === 'assistant'
                ? messages[index + 1]!.id
                : undefined
            }
            liveRun={liveRunOf(item, index, messages.length, lastAnswerLiveRun)}
          />
        </SwipeReplyRow>
      </MessageListRow>
    ),
    [
      colors,
      messages,
      speechOwner,
      handleQuoteSelection,
      onDeleteMessage,
      onRetryMessage,
      onRetryWithModel,
      continuableMessageId,
      onContinueMessage,
      onBranch,
      onScheduleMessage,
      onEditImageArea,
      onEditImage,
      imageEditModelIds,
      inTemporaryChat,
      onDeleteImageConversation,
      variantInfoByMessageId,
      onSelectVariant,
      onSwitchModel,
      onEditMessage,
      editAttachmentsSupported,
      onQuoteReply,
      onReaction,
      onSubmitRatingDetails,
      onResolveToolApproval,
      onResearchPlanDecision,
      onRetryResearch,
      onStopResearch,
      onPauseResearch,
      resumingResearchMessageId,
      onFollowUp,
      highlightedId,
      lastAnswerLiveRun,
    ],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  if (messages.length === 0) {
    return (
      <View style={[styles.container, contentColumn('reading')]}>
        <ChatEmptyState onPairDesktop={onPairDesktop} />
      </View>
    );
  }

  return (
    <View testID="chat.message-list" ref={viewportRef} collapsable={false} style={styles.container}>
      <ChatScrollIntoView list={listRef} viewport={viewportRef} onReveal={stopFollowingBottom}>
        <FlashList
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingVertical: 8 }}
          ListFooterComponent={
            footer ? (
              <View testID="chat.message-list.footer" onLayout={handleFooterLayout}>
                {footer}
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleListLayout}
          onScrollBeginDrag={(event) => {
            readerScrollingRef.current = true;
            trackReaderPosition(event);
          }}
          onScrollEndDrag={(event) => {
            trackReaderPosition(event);
            readerScrollingRef.current = false;
          }}
          onMomentumScrollBegin={() => {
            readerScrollingRef.current = true;
          }}
          onMomentumScrollEnd={(event) => {
            trackReaderPosition(event);
            readerScrollingRef.current = false;
          }}
          onScroll={trackReaderPosition}
          scrollEventThrottle={100}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.teal}
              />
            ) : undefined
          }
        />
      </ChatScrollIntoView>

      {/* Anchored to the reading column, so it stays over the thread rather
          than drifting to the edge of a wide pane. */}
      <View pointerEvents="box-none" style={styles.fabOverlay}>
        <View pointerEvents="box-none" style={[styles.fabColumn, contentColumn('reading')]}>
          <Animated.View
            style={[styles.fab, fabStyle]}
            pointerEvents={showScrollButton ? 'auto' : 'none'}
          >
            <Pressable
              onPress={scrollToBottom}
              accessibilityLabel="Scroll to bottom"
              accessibilityRole="button"
              style={({ pressed }) => [styles.fabTarget, { opacity: pressed ? 0.82 : 1 }]}
            >
              <View style={[styles.fabButton, { backgroundColor: colors.teal }]}>
                <ChevronDown size={20} color={colors.accentText} strokeWidth={2.5} />
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fabOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  fabColumn: {
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
  },
  fabTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeDivider: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  fabButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
