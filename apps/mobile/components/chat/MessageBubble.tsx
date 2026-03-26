import {
  View,
  Pressable,
  useWindowDimensions,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { memo, useCallback, useMemo, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { TapGestureHandler, State } from 'react-native-gesture-handler';
import type { TapGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Avatar } from '@/components/ui/avatar';
import { StreamingIndicator } from './StreamingIndicator';
import { ThinkingLine } from './ThinkingLine';
import { InlineArtifactCard } from './InlineArtifactCard';
import { ArtifactFullScreen } from './ArtifactFullScreen';
import { ToolCallCard } from './ToolCallCard';
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
import { copyToClipboard } from '@/lib/clipboard';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import type { ChatMessage, Artifact } from '@/types/chat';

/** Reaction state: cycles thumbsUp -> thumbsDown -> null */
type ReactionType = 'thumbsUp' | 'thumbsDown' | null;

interface MessageBubbleProps {
  message: ChatMessage;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onReaction?: (messageId: string, reaction: ReactionType) => void;
  /** Called to open the shared thinking bottom sheet with this message's reasoning */
  onOpenThinking?: (content: string, duration?: number) => void;
}

/**
 * Single chat message bubble.
 * Uses avatar-based layout (like ChatGPT/Claude):
 * - Avatar on the left
 * - Role label (You / model name)
 * - Content, reasoning, tool calls, artifacts rendered inline
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  onApprove,
  onReject,
  onDeleteMessage,
  onRetryMessage,
  onEditMessage,
  onReaction,
  onOpenThinking,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const [expandedArtifact, setExpandedArtifact] = useState<Artifact | null>(null);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editText, setEditText] = useState('');
  const [reaction, setReaction] = useState<ReactionType>(null);
  const { width } = useWindowDimensions();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handleExpandArtifact = useCallback((artifact: Artifact) => {
    setExpandedArtifact(artifact);
  }, []);

  const handleCloseArtifact = useCallback(() => {
    setExpandedArtifact(null);
  }, []);

  const handleApprove = useCallback((id: string) => onApprove?.(id), [onApprove]);

  const handleReject = useCallback(
    (id: string, reason?: string) => onReject?.(id, reason),
    [onReject],
  );

  const handleImagePress = useCallback((url: string) => {
    setFullScreenImageUrl(url);
  }, []);

  const handleCloseFullScreenImage = useCallback(() => {
    setFullScreenImageUrl(null);
  }, []);

  const handleShowExport = useCallback(() => {
    setShowExportSheet(true);
  }, []);

  const handleCloseExport = useCallback(() => {
    setShowExportSheet(false);
  }, []);

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
    [isAssistant, hapticsEnabled, message.id, onReaction],
  );

  const handleOpenThinkingSheet = useCallback(() => {
    if (message.reasoning && onOpenThinking) {
      onOpenThinking(message.reasoning, message.metadata?.thinkingDuration as number | undefined);
    }
  }, [message.reasoning, message.metadata?.thinkingDuration, onOpenThinking]);

  const handleOpenEditModal = useCallback(() => {
    setEditText(message.content);
    setEditModalVisible(true);
  }, [message.content]);

  const handleSubmitEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed && onEditMessage) {
      onEditMessage(message.id, trimmed);
    }
    setEditModalVisible(false);
  }, [editText, message.id, onEditMessage]);

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

  const contentElements = useMemo(() => renderMarkdownContent(message.content), [message.content]);

  // Compute image display width: full bubble width minus avatar + gap + padding
  const imageWidth = Math.min(width - 80, 320);

  const messageContent = (
    <Animated.View
      entering={FadeInDown.duration(200).springify()}
      className={`px-4 py-3 ${isAssistant ? 'bg-white/[0.02]' : ''}`}
    >
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={400}
        accessible={true}
        accessibilityLabel={`${isUser ? 'Your' : (message.model ?? 'Assistant')} message: ${message.content?.slice(0, 100) || 'empty'}`}
        accessibilityRole="text"
      >
        <View className="flex-row gap-3">
          {/* Avatar */}
          <Avatar size="sm" variant={isUser ? 'user' : 'assistant'} />

          {/* Content column */}
          <View className="flex-1 gap-1">
            {/* Role label */}
            <Text className="text-xs text-white/40 font-medium">
              {isUser ? 'You' : (message.model ?? 'Assistant')}
            </Text>

            {/* User attachments (images sent with the message) */}
            {isUser && message.attachments && message.attachments.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mt-1">
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
            )}

            {/* Thinking line (before main content, assistant only) */}
            {isAssistant && message.reasoning ? (
              <ThinkingLine
                isStreaming={message.isStreaming}
                duration={message.metadata?.thinkingDuration as number | undefined}
                onPress={handleOpenThinkingSheet}
              />
            ) : null}

            {/* Status steps */}
            {isAssistant && message.steps && message.steps.length > 0 ? (
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

            {/* Tool calls */}
            {isAssistant && message.toolCalls && message.toolCalls.length > 0 ? (
              <View style={{ gap: 4 }}>
                {message.toolCalls.map((tool) => (
                  <ToolCallCard key={tool.id} toolCall={tool} />
                ))}
              </View>
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
                progress={message.imageGenProgress ?? 0}
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
                onPress={() => handleImagePress(message.imageUrl!)}
              />
            )}

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
            {isAssistant && message.artifacts && message.artifacts.length > 0 ? (
              <View style={{ gap: 4 }}>
                {message.artifacts.map((artifact) => (
                  <InlineArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    onExpand={handleExpandArtifact}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      {/* Reaction badge (assistant messages only) */}
      {isAssistant && reaction && (
        <View
          style={{
            flexDirection: 'row',
            paddingLeft: 48,
            paddingTop: 2,
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(33, 128, 141, 0.15)',
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 14 }}>
              {reaction === 'thumbsUp' ? '\uD83D\uDC4D' : '\uD83D\uDC4E'}
            </Text>
          </View>
        </View>
      )}

      {/* Artifact full-screen modal */}
      <ArtifactFullScreen
        artifact={expandedArtifact}
        visible={expandedArtifact !== null}
        onClose={handleCloseArtifact}
      />

      {/* Full-screen image viewer */}
      <ImageFullScreen
        imageUrl={fullScreenImageUrl}
        visible={fullScreenImageUrl !== null}
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
      <TapGestureHandler numberOfTaps={2} onHandlerStateChange={handleDoubleTap}>
        <View>{messageContent}</View>
      </TapGestureHandler>
    );
  }

  return messageContent;
});
