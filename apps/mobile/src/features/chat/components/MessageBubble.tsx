import {
  View,
  Pressable,
  useWindowDimensions,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import { memo, useCallback, useMemo } from 'react';
import { useRecyclingState } from '@shopify/flash-list';
import {
  Clock,
  FileText,
  Download,
  AlertCircle,
  RefreshCw,
  Copy,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { TapGestureHandler, State } from 'react-native-gesture-handler';
import type { TapGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { StreamingIndicator } from './StreamingIndicator';
import { ThinkingChip } from './ThinkingChip';
import { InlineArtifactCard } from './InlineArtifactCard';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ArtifactFullScreen } from './ArtifactFullScreen';
import { ToolCallTimeline } from './ToolCallTimeline';
import { AgentActivityTimeline } from './AgentActivityTimeline';
import { getToolDisplayLabel, summarizeToolTimeline } from '@agiworkforce/types';
import { ApprovalCard } from './ApprovalCard';
import { StatusStep as StatusStepComponent } from './StatusStep';
import { GeneratedImage } from './GeneratedImage';
import { ImageGenProgress } from './ImageGenProgress';
import { ImageFullScreen } from './ImageFullScreen';
import { FileExportButton } from './FileExportButton';
import { CitationChip } from './CitationChip';
import { CollapsibleSources } from './CollapsibleSources';
import { MessageEditModal } from './MessageEditModal';
import { renderMarkdownContent } from './MessageContentRenderer';
import { ProvenanceFooter } from './ProvenanceFooter';
import { PerformanceChip } from './PerformanceChip';
import { ReportFlagButton } from './ReportFlagButton';
import { copyToClipboard } from '@/lib/clipboard';
import { storage } from '@/lib/mmkv';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors, radii } from '@/src/ui/theme';
import { getModelById, isAutoMode } from '@/src/features/model-picker/service';
import {
  hasMessageStreamError,
  getMessageStreamErrorMessage,
} from '@/src/features/chat/utils/messageStreamError';
import { isApprovalTurnLive } from '@/stores/chat/chatExecutionStore';
import type { ChatMessage, Artifact } from '@/types/chat';
import { readAgentActivityState } from '@/src/features/chat/utils/agentActivityState';

/** Reaction state: cycles thumbsUp -> thumbsDown -> null */
type ReactionType = 'thumbsUp' | 'thumbsDown' | null;

/**
 * Must match PERF_CHIP_SHOW_KEY in app/(app)/settings/performance.tsx — that
 * screen's "Show performance chip in chat" toggle writes this raw MMKV key
 * (default true); this file is the only reader. Kept as a duplicated literal
 * rather than importing from a route file.
 */
const PERF_CHIP_SHOW_KEY = 'perf-show-chip-v1';

/**
 * Whether the message's model can produce reasoning. Only hides the thinking
 * chip for models explicitly flagged `supportsThinking: false` (e.g. plain
 * local models that never emit <think> blocks). Unknown/auto models keep the
 * existing behavior of showing the chip whenever `reasoning` is present.
 */
function modelSupportsThinking(modelId?: string): boolean {
  if (!modelId || isAutoMode(modelId)) return true;
  const def = getModelById(modelId);
  return def?.supportsThinking !== false;
}

/** Returns provenance strings for an assistant message's model field. */
function getProvenance(model?: string): { provider?: string; model?: string } | null {
  if (!model) return null;
  if (isAutoMode(model)) {
    return { provider: 'Local Mode', model: 'Auto' };
  }

  const def = getModelById(model);
  if (!def) return null;

  if (def.surface === 'local') {
    return { provider: 'Local Mode', model: def.name };
  }

  return { provider: 'AGI Cloud' };
}

interface MessageBubbleProps {
  message: ChatMessage;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onReaction?: (messageId: string, reaction: ReactionType) => void;
  /** Called when the user allows/denies an MCP/connector tool call awaiting
   *  approval (`x_tool_approval_request`) rendered in this message's
   *  ToolCallTimeline. Distinct from `onApprove`/`onReject` above, which drive
   *  the unrelated risk-action `ApprovalCard` (file_delete/command/etc.). */
  onResolveToolApproval?: (
    messageId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
  ) => void;
}

/**
 * Single chat message bubble.
 * ChatGPT-mobile layout: user turns are right-aligned rounded pills; assistant turns are
 * full-width plain text (no avatar, no role label) with an always-visible action row
 * (copy / regenerate / 👍 / 👎) beneath completed answers.
 */
function MessageActionButton({
  label,
  icon: Icon,
  onPress,
  color,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ padding: 6, borderRadius: 8 }}
    >
      <Icon size={16} color={color} />
    </Pressable>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  onApprove,
  onReject,
  onDeleteMessage,
  onRetryMessage,
  onEditMessage,
  onReaction,
  onResolveToolApproval,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const canonicalActivity = isAssistant
    ? readAgentActivityState(message.metadata?.agentActivity)
    : undefined;
  const assistantProvenance = isAssistant ? getProvenance(message.model) : null;
  const provenance = isAssistant && !message.isStreaming ? assistantProvenance : null;
  const roleLabel = isUser ? 'You' : (assistantProvenance?.model ?? 'AGI');
  // NOT gated on `canonicalActivity`, unlike steps/toolCalls below: those are
  // genuinely re-rendered by AgentActivityTimeline, but reasoning is not --
  // AgentActivityState has no reasoning entry kind (packages/client/
  // client-runtime/src/agentActivity.ts drops 'reasoning-delta' outright), so
  // suppressing the chip here hid it on every tool/research/agiwork turn with
  // nothing taking its place.
  const hasReasoning =
    isAssistant && message.reasoning !== undefined && modelSupportsThinking(message.model);
  // FlashList v2 recycles component instances across list items for
  // performance -- bare useState here would bleed a PRIOR message's UI state
  // (an expanded artifact, an open export sheet, a half-typed edit draft)
  // onto whichever message this instance now renders after a recycle.
  // editModalVisible/editText are the sharpest case: a recycled instance
  // stuck mid-edit would show one message's draft text inside another
  // message's bubble -- a real correctness bug, not just a visual glitch.
  // useRecyclingState resets each field whenever message.id changes.
  const [expandedArtifact, setExpandedArtifact] = useRecyclingState<Artifact | null>(null, [
    message.id,
  ]);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useRecyclingState<string | null>(null, [
    message.id,
  ]);
  const [showExportSheet, setShowExportSheet] = useRecyclingState(false, [message.id]);
  const [editModalVisible, setEditModalVisible] = useRecyclingState(false, [message.id]);
  const [editText, setEditText] = useRecyclingState('', [message.id]);
  // Seed from persisted metadata.reaction so a rating survives FlashList row
  // recycling and reload (and is restored from the server on Cloud). Re-seeds
  // when the row recycles to a different message.id.
  const [reaction, setReaction] = useRecyclingState<ReactionType>(
    (message.metadata?.reaction as ReactionType) ?? null,
    [message.id],
  );
  const { width } = useWindowDimensions();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const reducedMotion = useReducedMotion();
  const themeColors = useThemeColors();

  // Artifacts are derived into the artifact store as a turn completes
  // (captureArtifactsFromMessage). `message.artifacts` is declared on the type
  // but no writer ever populates it, so reading it here rendered nothing —
  // inline artifact cards were unreachable. Source them from the store, which
  // also means historical turns light up rather than only newly-streamed ones.
  const appMode = useChatAppModeStore((s) => s.appMode);
  const storedArtifacts = useArtifactStore((s) => s.artifacts);
  const inlineArtifacts = useMemo<Artifact[]>(() => {
    // Only the locally-derived store is consulted, not the merged gallery: this
    // runs for every bubble in the list, and a cloud artifact pulled from
    // another device has no message in this transcript to attach to anyway.
    // Scope is still checked so a Local turn can never surface a Cloud artifact.
    return storedArtifacts
      .filter(
        (artifact) =>
          artifact.messageId === message.id && (artifact.provenance?.scope ?? 'local') === appMode,
      )
      .map((artifact) => ({
        id: artifact.id,
        // MobileArtifactKind is a subset of Artifact['type'], so the kinds map
        // across directly.
        type: artifact.kind,
        title: artifact.title,
        content: artifact.content,
        ...(artifact.language ? { language: artifact.language } : {}),
      }));
  }, [appMode, storedArtifacts, message.id]);

  const handleExpandArtifact = useCallback(
    (artifact: Artifact) => {
      setExpandedArtifact(artifact);
    },
    [setExpandedArtifact],
  );

  const handleCloseArtifact = useCallback(() => {
    setExpandedArtifact(null);
  }, [setExpandedArtifact]);

  const handleApprove = useCallback((id: string) => onApprove?.(id), [onApprove]);

  const handleReject = useCallback(
    (id: string, reason?: string) => onReject?.(id, reason),
    [onReject],
  );

  const handleResolveToolApproval = useCallback(
    (toolCallId: string, decision: 'approved' | 'rejected') =>
      onResolveToolApproval?.(message.id, toolCallId, decision),
    [onResolveToolApproval, message.id],
  );

  // Rehydrate a server-owned approval checkpoint from the persisted Cloud
  // message when possible. Only a missing/invalid run reference is expired;
  // restarting the app no longer invalidates a real pending approval.
  const approvalTurnExpired = Boolean(onResolveToolApproval) && !isApprovalTurnLive(message.id);

  const handleImagePress = useCallback(
    (url: string) => {
      setFullScreenImageUrl(url);
    },
    [setFullScreenImageUrl],
  );

  const handleCloseFullScreenImage = useCallback(() => {
    setFullScreenImageUrl(null);
  }, [setFullScreenImageUrl]);

  const handleShowExport = useCallback(() => {
    setShowExportSheet(true);
  }, [setShowExportSheet]);

  const handleCloseExport = useCallback(() => {
    setShowExportSheet(false);
  }, [setShowExportSheet]);

  const handleDoubleTap = useCallback(
    (event: TapGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state === State.ACTIVE && isAssistant) {
        if (hapticsEnabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        // Cycle: null -> thumbsUp -> thumbsDown -> null
        setReaction((prev) => {
          let next: ReactionType;
          if (prev === null) next = 'thumbsUp';
          else if (prev === 'thumbsUp') next = 'thumbsDown';
          else next = null;
          onReaction?.(message.id, next);
          return next;
        });
      }
    },
    [isAssistant, hapticsEnabled, message.id, onReaction, setReaction],
  );

  // Explicit reaction toggle for the always-visible action row: tapping a thumb sets it,
  // tapping the active thumb clears it (double-tap keeps its own null→up→down cycle).
  const applyReaction = useCallback(
    (target: Exclude<ReactionType, null>) => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setReaction((prev) => {
        const next: ReactionType = prev === target ? null : target;
        onReaction?.(message.id, next);
        return next;
      });
    },
    [hapticsEnabled, message.id, onReaction, setReaction],
  );

  const handleOpenEditModal = useCallback(() => {
    setEditText(message.content);
    setEditModalVisible(true);
  }, [message.content, setEditModalVisible, setEditText]);

  const handleSubmitEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed && onEditMessage) {
      onEditMessage(message.id, trimmed);
    }
    setEditModalVisible(false);
  }, [editText, message.id, onEditMessage, setEditModalVisible]);

  const handleLongPress = useCallback(() => {
    const exportOption = isAssistant && message.content.trim() ? ['Export Message...'] : [];
    const deleteOption = onDeleteMessage ? ['Delete Message'] : [];

    let options: string[];
    let cancelIndex: number;
    let destructiveIndex: number;

    if (isUser) {
      // User message: Edit, Copy, Delete, Cancel
      const editOption = onEditMessage ? ['Edit Message'] : [];
      options = [...editOption, 'Copy Message', ...deleteOption, 'Cancel'];
      cancelIndex = options.length - 1;
      destructiveIndex = onDeleteMessage ? options.indexOf('Delete Message') : -1;
    } else {
      // Assistant message: Retry, Copy, Export, Delete, Cancel
      const retryOption = onRetryMessage ? ['Retry'] : [];
      options = [...retryOption, 'Copy Message', ...exportOption, ...deleteOption, 'Cancel'];
      cancelIndex = options.length - 1;
      destructiveIndex = onDeleteMessage ? options.indexOf('Delete Message') : -1;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
        },
        (buttonIndex) => {
          const action = options[buttonIndex];
          if (action === 'Copy Message') {
            copyToClipboard(message.content);
          } else if (action === 'Export Message...') {
            handleShowExport();
          } else if (action === 'Delete Message') {
            onDeleteMessage?.(message.id);
          } else if (action === 'Retry') {
            onRetryMessage?.(message.id);
          } else if (action === 'Edit Message') {
            handleOpenEditModal();
          }
        },
      );
    } else {
      const androidActions: Array<{
        text: string;
        style?: 'destructive' | 'cancel';
        onPress?: () => void;
      }> = [];

      if (isUser && onEditMessage) {
        androidActions.push({ text: 'Edit Message', onPress: handleOpenEditModal });
      }
      if (!isUser && onRetryMessage) {
        androidActions.push({ text: 'Retry', onPress: () => onRetryMessage(message.id) });
      }
      androidActions.push({
        text: 'Copy Message',
        onPress: () => copyToClipboard(message.content),
      });
      if (isAssistant && message.content.trim()) {
        androidActions.push({ text: 'Export Message...', onPress: handleShowExport });
      }
      if (onDeleteMessage) {
        androidActions.push({
          text: 'Delete Message',
          style: 'destructive' as const,
          onPress: () => onDeleteMessage(message.id),
        });
      }
      androidActions.push({ text: 'Cancel', style: 'cancel' as const });

      Alert.alert('Message Actions', undefined, androidActions);
    }
  }, [
    message.id,
    message.content,
    isUser,
    isAssistant,
    onDeleteMessage,
    onRetryMessage,
    onEditMessage,
    handleShowExport,
    handleOpenEditModal,
  ]);

  // Message actions (Copy/Retry/Edit/Delete/Export) are otherwise only reachable
  // via the onLongPress action sheet below, which has no standard discoverable
  // VoiceOver equivalent. Mirror the same option set as native accessibility
  // actions so screen-reader users can reach them from the rotor "Actions" menu
  // without needing to perform a long-press gesture.
  const accessibilityActionsList = useMemo<AccessibilityActionInfo[]>(() => {
    const actions: AccessibilityActionInfo[] = [];
    if (isUser && onEditMessage) actions.push({ name: 'edit', label: 'Edit message' });
    if (isAssistant && onRetryMessage) actions.push({ name: 'retry', label: 'Retry' });
    actions.push({ name: 'copy', label: 'Copy message' });
    if (isAssistant && message.content.trim()) {
      actions.push({ name: 'export', label: 'Export message' });
    }
    if (onDeleteMessage) actions.push({ name: 'delete', label: 'Delete message' });
    // Tool-call rows (ToolCallTimeline) sit inside this same accessible container,
    // so VoiceOver never reaches their own onPress — mirror them here too, same
    // rationale as the message actions above.
    if (isAssistant && !canonicalActivity && message.toolCalls) {
      for (const tool of message.toolCalls) {
        actions.push({
          name: `tool-${tool.id}`,
          label: `View details: ${getToolDisplayLabel(tool.name).displayName}`,
        });
      }
    }
    return actions;
  }, [
    isUser,
    isAssistant,
    onEditMessage,
    onRetryMessage,
    onDeleteMessage,
    message.content,
    message.toolCalls,
    canonicalActivity,
  ]);

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const actionName = event.nativeEvent.actionName;
      if (actionName.startsWith('tool-')) {
        const toolId = actionName.slice('tool-'.length);
        const tool = message.toolCalls?.find((t) => t.id === toolId);
        if (tool) {
          const label = getToolDisplayLabel(tool.name);
          Alert.alert(
            label.displayName,
            tool.output || tool.input || tool.command || 'No details available.',
          );
        }
        return;
      }
      switch (actionName) {
        case 'copy':
          copyToClipboard(message.content);
          break;
        case 'retry':
          onRetryMessage?.(message.id);
          break;
        case 'edit':
          handleOpenEditModal();
          break;
        case 'delete':
          onDeleteMessage?.(message.id);
          break;
        case 'export':
          handleShowExport();
          break;
        default:
          break;
      }
    },
    [
      message.id,
      message.content,
      message.toolCalls,
      onRetryMessage,
      onDeleteMessage,
      handleOpenEditModal,
      handleShowExport,
    ],
  );

  const contentElements = useMemo(
    () => renderMarkdownContent(message.content, themeColors),
    [message.content, themeColors],
  );

  // Compute image display width: full bubble width minus avatar + gap + padding
  const imageWidth = Math.min(width - 80, 320);

  const messageContent = (
    <Animated.View
      testID={isAssistant && message.isStreaming ? 'chat.message.assistant.streaming' : undefined}
      entering={reducedMotion ? undefined : FadeInDown.duration(200).springify()}
      className="px-4 py-3"
    >
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={400}
        accessible={!canonicalActivity}
        accessibilityLabel={`${isUser ? 'Your' : roleLabel} message: ${message.content?.slice(0, 100) || 'empty'}`}
        accessibilityHint="Double tap and hold for message actions"
        accessibilityRole="text"
        accessibilityActions={accessibilityActionsList}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
          {/* Offline queued badge (user messages only) */}
          {isUser && message.isQueued && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                backgroundColor: themeColors.warningSurface,
                paddingHorizontal: 5,
                paddingVertical: 2,
                borderRadius: 4,
                marginBottom: 4,
              }}
              accessibilityLabel="Message queued offline"
            >
              <Clock size={10} color={themeColors.agentWarning} />
              <Text style={{ fontSize: 10, color: themeColors.agentWarning }}>queued</Text>
            </View>
          )}

          {/* Content column: user messages render as a right-aligned rounded
              bubble (ChatGPT-style pill); assistant messages render as plain
              text spanning the full width with no bubble background. */}
          <View
            className="gap-1"
            style={
              isUser
                ? {
                    maxWidth: '85%',
                    backgroundColor: themeColors.surfaceHover,
                    borderRadius: radii['2xl'],
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }
                : { width: '100%' }
            }
          >
            {/* User attachments: images and files sent with the message */}
            {isUser && message.attachments && message.attachments.length > 0 && (
              <View className="mt-1">
                {/* Image attachments */}
                <View className="flex-row flex-wrap gap-2">
                  {message.attachments
                    .filter((a) => a.mimeType.startsWith('image/'))
                    .map((attachment, idx) => (
                      <Pressable
                        key={`att-${idx}`}
                        onPress={() => handleImagePress(attachment.url)}
                        className="rounded-lg overflow-hidden"
                        accessibilityLabel={`Attached image: ${attachment.fileName}`}
                        accessibilityRole="image"
                      >
                        <Image
                          source={{ uri: attachment.url }}
                          style={{
                            width: Math.min(imageWidth, 200),
                            height: Math.min(imageWidth, 200),
                            borderRadius: 8,
                          }}
                          contentFit="cover"
                          transition={200}
                        />
                      </Pressable>
                    ))}
                </View>

                {/* File attachments (non-image) */}
                {message.attachments.filter((a) => !a.mimeType.startsWith('image/')).length > 0 && (
                  <View className="gap-1 mt-2">
                    {message.attachments
                      .filter((a) => !a.mimeType.startsWith('image/'))
                      .map((attachment, idx) => (
                        <View
                          key={`file-att-${idx}`}
                          className="flex-row items-center gap-2 px-3 py-2 rounded-lg"
                          style={{ backgroundColor: themeColors.accentSurface }}
                          accessible={true}
                          accessibilityLabel={`File attachment: ${attachment.fileName}`}
                          accessibilityRole="button"
                        >
                          <FileText size={16} color={themeColors.agentActive} />
                          <Text
                            className="flex-1 text-sm"
                            numberOfLines={1}
                            style={{ color: themeColors.textPrimary }}
                          >
                            {attachment.fileName}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}
              </View>
            )}

            {/* Inline thinking chip (before main content, assistant only) */}
            {canonicalActivity ? (
              <AgentActivityTimeline
                messageId={message.id}
                activity={canonicalActivity}
                onResolveApproval={handleResolveToolApproval}
                approvalExpired={approvalTurnExpired}
                onResendApproval={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
              />
            ) : null}

            {hasReasoning ? (
              <ThinkingChip
                thinkingText={message.reasoning ?? ''}
                isStreaming={message.isStreaming}
                duration={message.metadata?.thinkingDuration as number | undefined}
                startedAtMs={message.metadata?.thinkingStartedAt as number | undefined}
              />
            ) : null}

            {/* Status steps */}
            {isAssistant && !canonicalActivity && message.steps && message.steps.length > 0 ? (
              <View style={{ gap: 2 }}>
                {message.steps.map((step, index) => (
                  <StatusStepComponent
                    key={step.id}
                    step={step}
                    stepNumber={index + 1}
                    totalSteps={message.steps!.length}
                  />
                ))}
              </View>
            ) : null}

            {/* Tool calls — unified connected timeline (Claude-style inline tool use) */}
            {isAssistant &&
            !canonicalActivity &&
            message.toolCalls &&
            message.toolCalls.length > 0 ? (
              <ToolCallTimeline
                messageId={message.id}
                toolCalls={message.toolCalls}
                summary={summarizeToolTimeline(message.toolCalls)}
                onResolveApproval={handleResolveToolApproval}
                approvalExpired={approvalTurnExpired}
                onResendApproval={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
              />
            ) : null}

            {/* Approval requests */}
            {isAssistant && message.approvalRequests && message.approvalRequests.length > 0 ? (
              <View style={{ gap: 4 }}>
                {message.approvalRequests.map((req) => (
                  <ApprovalCard
                    key={req.id}
                    approval={req}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </View>
            ) : null}

            {/* Main text content with inline markdown */}
            {contentElements.length > 0 ? (
              <View>
                {contentElements}
                {message.isStreaming && <StreamingIndicator />}
              </View>
            ) : message.isStreaming && !message.isGeneratingImage ? (
              <StreamingIndicator />
            ) : null}

            {/* Image generation progress indicator */}
            {isAssistant && message.isGeneratingImage && (
              <ImageGenProgress
                prompt={message.imageGenPrompt ?? message.content ?? 'Generating image…'}
                progress={message.imageGenProgress}
                status={message.imageGenStatus ?? 'generating'}
                estimatedTime={message.imageGenEstimatedTime}
                errorMessage={message.imageGenError}
              />
            )}

            {/* Generated image */}
            {isAssistant && (message.type === 'image' || message.imageUrl) && message.imageUrl && (
              <GeneratedImage
                imageUrl={message.imageUrl}
                revisedPrompt={message.revisedPrompt}
                width={imageWidth}
                allowEphemeral={message.imageGenPersisted === false}
                onPress={() => handleImagePress(message.imageUrl!)}
              />
            )}

            {isAssistant &&
            message.imageGenPersisted === false &&
            typeof message.imageGenError === 'string' ? (
              <Pressable
                onPress={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
                disabled={!onRetryMessage}
                accessibilityRole={onRetryMessage ? 'button' : 'text'}
                accessibilityLabel={
                  onRetryMessage
                    ? 'Generated image was not saved. Retry image generation.'
                    : 'Generated image was not saved.'
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: themeColors.dangerSurface,
                  borderWidth: 1,
                  borderColor: themeColors.dangerBorder,
                  borderRadius: radii.md,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginTop: 4,
                }}
              >
                <AlertCircle size={13} color={themeColors.agentError} />
                <Text style={{ flex: 1, fontSize: 12, color: themeColors.textSecondary }}>
                  Image shown for this session only. It was not saved to your library.
                </Text>
                {onRetryMessage ? (
                  <>
                    <RefreshCw size={12} color={themeColors.agentError} />
                    <Text
                      style={{ fontSize: 12, fontWeight: '600', color: themeColors.agentError }}
                    >
                      Retry
                    </Text>
                  </>
                ) : null}
              </Pressable>
            ) : null}

            {/* Citations: chips for 1-3, collapsible card for 4+ */}
            {isAssistant && message.citations && message.citations.length > 0 ? (
              message.citations.length <= 3 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {message.citations.map((cit, i) => (
                    <CitationChip
                      key={`cit-${i}`}
                      index={i + 1}
                      title={cit.title ?? cit.url}
                      url={cit.url}
                    />
                  ))}
                </View>
              ) : (
                <CollapsibleSources sources={message.citations} />
              )
            ) : null}

            {/* Inline artifacts */}
            {isAssistant && inlineArtifacts.length > 0 ? (
              <View style={{ gap: 4 }}>
                {inlineArtifacts.map((artifact) => (
                  <InlineArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    onExpand={handleExpandArtifact}
                  />
                ))}
              </View>
            ) : null}

            {/* Mid-stream provider failure notice: metadata.streamError (additive
                x_stream_error delta) OR the retroactive metadata.finishReason
                ==='error' case (legacy-web has passed that literal through for
                a while, so historical turns can carry it with no marker at
                all — see hasMessageStreamError's doc comment) is the ONLY
                signal that this turn's answer may be cut off — the server
                still ends the stream cleanly, so without this the partial
                content renders as an ordinary completion with zero
                indication anything went wrong. The partial content itself is
                left exactly as it streamed; this only adds a visible notice
                below it. */}
            {isAssistant && !message.isStreaming && hasMessageStreamError(message) && (
              <Pressable
                onPress={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
                disabled={!onRetryMessage}
                accessibilityRole={onRetryMessage ? 'button' : 'text'}
                accessibilityLabel={
                  onRetryMessage
                    ? 'This response may be incomplete. Tap to regenerate.'
                    : 'This response may be incomplete.'
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: themeColors.dangerSurface,
                  borderWidth: 1,
                  borderColor: themeColors.dangerBorder,
                  borderRadius: radii.md,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  marginTop: 4,
                  alignSelf: 'flex-start',
                }}
              >
                <AlertCircle size={13} color={themeColors.agentError} />
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                  {getMessageStreamErrorMessage(message)
                    ? `Response may be incomplete: ${getMessageStreamErrorMessage(message)}`
                    : 'Response may be incomplete'}
                </Text>
                {onRetryMessage && (
                  <>
                    <RefreshCw size={12} color={themeColors.agentError} />
                    <Text
                      style={{ fontSize: 12, fontWeight: '600', color: themeColors.agentError }}
                    >
                      Retry
                    </Text>
                  </>
                )}
              </Pressable>
            )}

            {/* Provenance badge: local or cloud provider context */}
            {provenance && (
              <ProvenanceFooter provider={provenance.provider} model={provenance.model} />
            )}

            {/* Performance chip — on-device inference metadata.
                Regression: this previously also required message.runtimeTier,
                a field chatExecutionStore never sets (only tokensPerSecond is
                populated on local completions), so the chip — and the "Show
                performance chip in chat" settings toggle that promises it —
                was permanently dead. PerformanceChip itself only reads
                tokensPerSecond and no-ops when it's absent, so runtimeTier
                was never actually required. */}
            {isAssistant &&
              !message.isStreaming &&
              message.model &&
              storage.getString(PERF_CHIP_SHOW_KEY) !== 'false' && (
                <PerformanceChip
                  model={message.model}
                  tier={message.runtimeTier}
                  tokensPerSecond={message.tokensPerSecond}
                  firstTokenLatencyMs={message.firstTokenLatencyMs}
                />
              )}

            {/* Report/flag — Google Play GenAI policy: required on every assistant turn */}
            {isAssistant && !message.isStreaming && message.content.trim() && (
              <ReportFlagButton
                messageId={message.id}
                conversationId={(message.metadata?.conversationId as string) ?? message.id}
                contentExcerpt={message.content}
              />
            )}
          </View>
        </View>
      </Pressable>

      {/* Assistant action row (ChatGPT-style, always visible). These actions were
          previously only reachable via a hidden 400ms long-press sheet (copy/retry/
          export/delete) or an undiscoverable double-tap (reactions); surface the core
          ones inline so a completed answer has visible affordances. Reuses the existing
          copyToClipboard / onRetryMessage / onReaction handlers \u2014 the active thumb also
          replaces the old standalone reaction badge. */}
      {isAssistant && !message.isStreaming && message.content.trim() ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 10 }}
          accessibilityLabel="Message actions"
        >
          <MessageActionButton
            label="Copy"
            icon={Copy}
            onPress={() => copyToClipboard(message.content)}
            color={themeColors.textMuted}
          />
          {onRetryMessage ? (
            <MessageActionButton
              label="Regenerate response"
              icon={RefreshCw}
              onPress={() => onRetryMessage(message.id)}
              color={themeColors.textMuted}
            />
          ) : null}
          {onReaction ? (
            <>
              <MessageActionButton
                label="Good response"
                icon={ThumbsUp}
                onPress={() => applyReaction('thumbsUp')}
                color={reaction === 'thumbsUp' ? themeColors.agentSuccess : themeColors.textMuted}
              />
              <MessageActionButton
                label="Bad response"
                icon={ThumbsDown}
                onPress={() => applyReaction('thumbsDown')}
                color={reaction === 'thumbsDown' ? themeColors.agentError : themeColors.textMuted}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {/* Artifact full-screen modal */}
      <ArtifactFullScreen
        artifact={expandedArtifact}
        visible={expandedArtifact !== null}
        onClose={handleCloseArtifact}
        onRegenerate={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
      />

      {/* Full-screen image viewer */}
      <ImageFullScreen
        imageUrl={fullScreenImageUrl}
        prompt={message.imageGenPrompt ?? message.revisedPrompt}
        visible={fullScreenImageUrl !== null}
        allowEphemeral={message.imageGenPersisted === false}
        onClose={handleCloseFullScreenImage}
      />

      {/* File export bottom sheet (assistant messages only) */}
      {isAssistant && (
        <FileExportButton
          content={message.content}
          title={message.model ? `${message.model} response` : undefined}
          visible={showExportSheet}
          onClose={handleCloseExport}
        />
      )}

      {/* Edit message modal */}
      <MessageEditModal
        visible={editModalVisible}
        text={editText}
        onChangeText={setEditText}
        onClose={() => setEditModalVisible(false)}
        onSubmit={handleSubmitEdit}
      />
    </Animated.View>
  );

  // Wrap assistant messages with a double-tap gesture handler for reactions
  if (isAssistant) {
    return (
      <TapGestureHandler
        numberOfTaps={2}
        onHandlerStateChange={handleDoubleTap}
        testID="message-bubble-double-tap"
      >
        <View>{messageContent}</View>
      </TapGestureHandler>
    );
  }

  return messageContent;
});
