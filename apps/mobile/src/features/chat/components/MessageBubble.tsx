import {
  View,
  Pressable,
  useWindowDimensions,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import { memo, useCallback, useEffect, useMemo } from 'react';
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
  Volume2,
  Share2,
  Square,
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
import * as voiceOutput from '@/src/features/voice/services/voiceOutput';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ArtifactFullScreen } from './ArtifactFullScreen';
import { ToolCallDetailsSheet, ToolCallTimeline } from './ToolCallTimeline';
import { InteractiveCardBlock } from './InteractiveCardBlock';
import { API_URL } from '@/lib/constants';
import { AgentActivityTimeline } from './AgentActivityTimeline';
import { getToolDisplayLabel, summarizeToolTimeline } from '@agiworkforce/types';
import { ApprovalCard } from './ApprovalCard';
import { StatusStep as StatusStepComponent } from './StatusStep';
import { GeneratedImage } from './GeneratedImage';
import { ImageGenProgress } from './ImageGenProgress';
import { GeneratedVideo } from './GeneratedVideo';
import { VideoGenProgress } from './VideoGenProgress';
import { ImageFullScreen } from './ImageFullScreen';
import { FileExportButton } from './FileExportButton';
import { CitationChip } from './CitationChip';
import { CollapsibleSources } from './CollapsibleSources';
import { MessageEditModal } from './MessageEditModal';
import { renderMarkdownContent } from './MessageContentRenderer';
import { parseAssistantThinking } from '@/stores/chat/chatExecutionStore';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { ProvenanceFooter } from './ProvenanceFooter';
import { PerformanceChip } from './PerformanceChip';
import { ReportFlagButton } from './ReportFlagButton';
import { copyToClipboard } from '@/lib/clipboard';
import { storage } from '@/lib/mmkv';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors, radii } from '@/src/ui/theme';
import { getDisplayName, getModelById, isAutoMode } from '@/src/features/model-picker/service';
import {
  hasMessageStreamError,
  getMessageStreamErrorMessage,
} from '@/src/features/chat/utils/messageStreamError';
import { isApprovalTurnLive } from '@/stores/chat/chatExecutionStore';
import type { ChatMessage, Artifact, ToolCall } from '@/types/chat';
import { readAgentActivityState } from '@/src/features/chat/utils/agentActivityState';
import { readPersistedInteractiveCards } from '@agiworkforce/cloud-contracts';
import {
  generatedFileArtifactsFromMetadata,
  mergeDerivedAndGeneratedFileArtifacts,
} from '@/src/features/chat/utils/generatedFileArtifacts';

type ReactionType = 'thumbsUp' | 'thumbsDown' | null;

const PERF_CHIP_SHOW_KEY = 'perf-show-chip-v1';

function modelSupportsThinking(modelId?: string): boolean {
  if (!modelId || isAutoMode(modelId)) return true;
  const def = getModelById(modelId);
  return def?.supportsThinking !== false;
}

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
  onResolveToolApproval?: (
    messageId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
  ) => void;
}

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
  const parsedThinking = useMemo(
    () => (isAssistant ? parseAssistantThinking(message.content) : null),
    [isAssistant, message.content],
  );
  const displayContent = parsedThinking?.hasReasoning ? parsedThinking.content : message.content;
  const reasoningText =
    message.reasoning ?? (parsedThinking?.hasReasoning ? parsedThinking.reasoning : undefined);
  const hasReasoning =
    isAssistant &&
    reasoningText !== undefined &&
    (parsedThinking?.hasReasoning === true || modelSupportsThinking(message.model));
  const [expandedArtifact, setExpandedArtifact] = useRecyclingState<Artifact | null>(null, [
    message.id,
  ]);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useRecyclingState<string | null>(null, [
    message.id,
  ]);
  const [showExportSheet, setShowExportSheet] = useRecyclingState(false, [message.id]);
  const [accessibilityTool, setAccessibilityTool] = useRecyclingState<ToolCall | null>(null, [
    message.id,
  ]);
  const [editModalVisible, setEditModalVisible] = useRecyclingState(false, [message.id]);
  const [editText, setEditText] = useRecyclingState('', [message.id]);
  const [reaction, setReaction] = useRecyclingState<ReactionType>(
    (message.metadata?.reaction as ReactionType) ?? null,
    [message.id],
  );
  const { width } = useWindowDimensions();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const reducedMotion = useReducedMotion();
  const themeColors = useThemeColors();

  const appMode = useChatAppModeStore((s) => s.appMode);
  const handleStopVideoGeneration = useCallback(() => {
    void useChatMessageStore.getState().stopVideoGeneration(message.conversationId, message.id);
  }, [message.conversationId, message.id]);
  const storedArtifacts = useArtifactStore((s) => s.artifacts);
  const inlineArtifacts = useMemo<Artifact[]>(() => {
    const scopedStoreArtifacts: Artifact[] = storedArtifacts
      .filter(
        (artifact) =>
          artifact.messageId === message.id && (artifact.provenance?.scope ?? 'local') === appMode,
      )
      .map((artifact) => ({
        id: artifact.id,
        type: artifact.kind,
        title: artifact.title,
        content: artifact.content,
        ...(artifact.language ? { language: artifact.language } : {}),
      }));

    const persistedFiles =
      appMode === 'cloud'
        ? generatedFileArtifactsFromMetadata(message.metadata?.generatedFiles, message.createdAt)
        : [];
    const byId = new Map<string, Artifact>();
    for (const artifact of [
      ...scopedStoreArtifacts,
      ...persistedFiles,
      ...(message.artifacts ?? []),
    ]) {
      byId.set(artifact.id, artifact);
    }
    const unique = [...byId.values()];
    return mergeDerivedAndGeneratedFileArtifacts(
      unique.filter((artifact) => !artifact.generatedFile),
      unique.filter((artifact) => artifact.generatedFile),
    );
  }, [
    appMode,
    storedArtifacts,
    message.id,
    message.createdAt,
    message.metadata,
    message.artifacts,
  ]);

  const interactiveCards = useMemo(
    () =>
      appMode === 'cloud'
        ? (message.interactiveCards ?? readPersistedInteractiveCards(message.metadata))
        : [],
    [appMode, message.interactiveCards, message.metadata],
  );

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

  const [isSpeaking, setIsSpeaking] = useRecyclingState(false, [message.id]);

  const handleToggleReadAloud = useCallback(() => {
    if (isSpeaking) {
      void voiceOutput.stop();
      setIsSpeaking(false);
      return;
    }
    void voiceOutput.stop();
    setIsSpeaking(true);
    void voiceOutput
      .speak(message.content, {
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
      })
      .catch(() => setIsSpeaking(false));
  }, [isSpeaking, message.content, setIsSpeaking]);

  useEffect(() => {
    return () => {
      if (isSpeaking) void voiceOutput.stop();
    };
  }, [isSpeaking]);

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
      const editOption = onEditMessage ? ['Edit Message'] : [];
      options = [...editOption, 'Copy Message', ...deleteOption, 'Cancel'];
      cancelIndex = options.length - 1;
      destructiveIndex = onDeleteMessage ? options.indexOf('Delete Message') : -1;
    } else {
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

  const accessibilityActionsList = useMemo<AccessibilityActionInfo[]>(() => {
    const actions: AccessibilityActionInfo[] = [];
    if (isUser && onEditMessage) actions.push({ name: 'edit', label: 'Edit message' });
    if (isAssistant && onRetryMessage) actions.push({ name: 'retry', label: 'Retry' });
    actions.push({ name: 'copy', label: 'Copy message' });
    if (isAssistant && message.content.trim()) {
      actions.push({ name: 'export', label: 'Export message' });
    }
    if (onDeleteMessage) actions.push({ name: 'delete', label: 'Delete message' });
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
          setAccessibilityTool(tool);
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
      setAccessibilityTool,
      onRetryMessage,
      onDeleteMessage,
      handleOpenEditModal,
      handleShowExport,
    ],
  );

  const contentElements = useMemo(
    () => renderMarkdownContent(displayContent, themeColors),
    [displayContent, themeColors],
  );

  const imageWidth = Math.min(width - 80, 320);

  const messageContent = (
    <Animated.View
      testID={isAssistant && message.isStreaming ? 'chat.message.assistant.streaming' : undefined}
      entering={reducedMotion ? undefined : FadeInDown.duration(200).springify()}
      className="px-4 py-4"
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
                thinkingText={reasoningText ?? ''}
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

            {/* Tool calls, unified connected timeline (Claude-style inline tool use) */}
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
            ) : message.isStreaming && !message.isGeneratingImage && !message.isGeneratingVideo ? (
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

            {/* Video generation progress */}
            {isAssistant && message.isGeneratingVideo && (
              <VideoGenProgress
                prompt={message.videoGenPrompt ?? message.content ?? 'Generating video…'}
                progress={message.videoGenProgress}
                status={message.videoGenStatus ?? 'processing'}
                errorMessage={message.videoGenError}
                onStop={message.videoTaskId ? handleStopVideoGeneration : undefined}
                stopping={message.videoGenCancelRequested === true}
                stopError={message.videoGenCancelError}
              />
            )}

            {/* Generated video */}
            {isAssistant && (message.type === 'video' || message.videoUrl) && message.videoUrl && (
              <GeneratedVideo
                videoUrl={message.videoUrl}
                thumbnailUrl={message.videoThumbnailUrl}
                width={imageWidth}
                prompt={message.videoGenPrompt}
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

            {/* Interactive cards (map search). Placed AFTER the prose that
                motivated them and before citations, matching where the model
                emitted them and mirroring the web transcript's ordering. */}
            {isAssistant && interactiveCards.length > 0 ? (
              <InteractiveCardBlock
                cards={interactiveCards}
                tileBaseUrl={API_URL}
                canLoadManagedCloudTiles={appMode === 'cloud'}
              />
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
                all, see hasMessageStreamError's doc comment) is the ONLY
                signal that this turn's answer may be cut off, the server
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

            {/* Performance chip, on-device inference metadata.
                Regression: this previously also required message.runtimeTier,
                a field chatExecutionStore never sets (only tokensPerSecond is
                populated on local completions), so the chip, and the "Show
                performance chip in chat" settings toggle that promises it.
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

            {/* Report/flag, Google Play GenAI policy: required on every assistant turn */}
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
          copyToClipboard / onRetryMessage / onReaction handlers, the active thumb also
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
          {/* Read aloud, reuses the on-device TTS service the voice companion
              already uses. Toggles, so a long answer can be stopped without
              waiting it out. */}
          <MessageActionButton
            label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
            icon={isSpeaking ? Square : Volume2}
            onPress={handleToggleReadAloud}
            color={isSpeaking ? themeColors.teal : themeColors.textMuted}
          />
          {/* Share/export, the same sheet the long-press menu opens, surfaced
              inline to match the reference apps. */}
          <MessageActionButton
            label="Share message"
            icon={Share2}
            onPress={handleShowExport}
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

      {/* VoiceOver rotor actions cannot reach the nested timeline controls while
          the message wrapper owns the accessibility focus. Open the same
          structured sheet used by the visible timeline instead of exposing a
          raw provider/tool JSON alert. */}
      <ToolCallDetailsSheet tool={accessibilityTool} onClose={() => setAccessibilityTool(null)} />

      {/* File export bottom sheet (assistant messages only) */}
      {isAssistant && (
        <FileExportButton
          content={message.content}
          title={message.model ? `${getDisplayName(message.model)} response` : undefined}
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
