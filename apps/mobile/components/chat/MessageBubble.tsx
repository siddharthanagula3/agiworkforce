import {
  View,
  Pressable,
  useWindowDimensions,
  Alert,
  ActionSheetIOS,
  Platform,
  Modal,
  TextInput,
  StyleSheet,
} from 'react-native';
import { memo, useCallback, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Text } from '@/components/ui/text';
import { Avatar } from '@/components/ui/avatar';
import { StreamingIndicator } from './StreamingIndicator';
import { ReasoningAccordion } from './ReasoningAccordion';
import { InlineArtifactCard } from './InlineArtifactCard';
import { ArtifactFullScreen } from './ArtifactFullScreen';
import { ToolCallCard } from './ToolCallCard';
import { ApprovalCard } from './ApprovalCard';
import { StatusStep as StatusStepComponent } from './StatusStep';
import { GeneratedImage } from './GeneratedImage';
import { ImageGenProgress } from './ImageGenProgress';
import { ImageFullScreen } from './ImageFullScreen';
import { CodeBlockCopyButton } from './CodeBlockCopyButton';
import { FileExportButton } from './FileExportButton';
import { copyToClipboard } from '@/lib/clipboard';
import { colors } from '@/lib/theme';
import type { ChatMessage, Artifact } from '@/types/chat';

interface MessageBubbleProps {
  message: ChatMessage;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

/**
 * Render inline math: $...$ (not $$)
 * Returns an array of React Native Text/View nodes.
 */
function renderInlineMath(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match $...$ but not $$
  const mathRegex = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g;
  let lastIdx = 0;
  let keyCounter = 0;
  let match: RegExpExecArray | null;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    parts.push(
      <Text
        key={`${keyBase}-imath-${keyCounter++}`}
        style={{
          fontFamily: 'Menlo',
          fontStyle: 'italic',
          fontSize: 13,
          backgroundColor: 'rgba(33, 128, 141, 0.08)',
          color: colors.textPrimary,
        }}
      >
        {` ${match[1].trim()} `}
      </Text>,
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts;
}

/**
 * Handles inline formatting: **bold**, `code`, and $inline math$.
 */
function renderInlineMarkdown(text: string, keyBase = 'inline'): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match bold and inline code
  const inlineRegex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIdx = 0;
  let inlineMatch: RegExpExecArray | null;
  let inlineKey = 0;

  while ((inlineMatch = inlineRegex.exec(text)) !== null) {
    // Plain text before — pass through inline math renderer
    if (inlineMatch.index > lastIdx) {
      const plain = text.slice(lastIdx, inlineMatch.index);
      parts.push(...renderInlineMath(plain, `${keyBase}-pre-${inlineKey}`));
    }

    if (inlineMatch[2]) {
      // Bold text
      parts.push(
        <Text key={`bold-${inlineKey++}`} style={{ fontWeight: '700' }}>
          {inlineMatch[2]}
        </Text>,
      );
    } else if (inlineMatch[3]) {
      // Inline code
      parts.push(
        <Text
          key={`code-${inlineKey++}`}
          style={{
            fontFamily: 'Menlo',
            fontSize: 13,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: colors.textPrimary,
          }}
        >
          {` ${inlineMatch[3]} `}
        </Text>,
      );
    }

    lastIdx = inlineMatch.index + inlineMatch[0].length;
  }

  // Remaining plain text — pass through inline math renderer
  if (lastIdx < text.length) {
    parts.push(...renderInlineMath(text.slice(lastIdx), `${keyBase}-post`));
  }

  return parts;
}

/**
 * Renders basic inline markdown:
 * - **bold** text
 * - `inline code`
 * - ```code blocks```
 * - $$...$$ block math
 * - $...$ inline math
 *
 * Returns an array of React Native Text/View elements.
 */
function renderMarkdownContent(content: string): React.ReactNode[] {
  if (!content) return [];

  const elements: React.ReactNode[] = [];
  let remaining = content;
  let keyCounter = 0;

  // First pass: extract block math $$...$$ and code blocks ```...```
  // Process them together in document order.
  const blockRegex = /(\$\$([\s\S]*?)\$\$|```(?:\w+)?\n?([\s\S]*?)```)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    // Text before this block
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      elements.push(
        <Text
          key={`text-${keyCounter++}`}
          className="text-[15px] leading-relaxed text-white/90"
          selectable
        >
          {renderInlineMarkdown(textBefore, `il-${keyCounter}`)}
        </Text>,
      );
    }

    if (match[2] !== undefined) {
      // Block math $$...$$
      const mathContent = match[2].trim();
      elements.push(
        <View
          key={`bmath-${keyCounter++}`}
          style={{
            backgroundColor: 'rgba(33, 128, 141, 0.08)',
            borderRadius: 6,
            padding: 8,
            marginVertical: 6,
            borderLeftWidth: 2,
            borderLeftColor: colors.teal,
          }}
        >
          <Text
            style={{
              fontFamily: 'Menlo',
              fontStyle: 'italic',
              fontSize: 14,
              color: colors.textPrimary,
              textAlign: 'center',
              lineHeight: 22,
            }}
            selectable
          >
            {mathContent}
          </Text>
        </View>,
      );
    } else if (match[3] !== undefined) {
      // Code block
      const codeContent = match[3].trim();
      elements.push(
        <View
          key={`code-${keyCounter++}`}
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 8,
            padding: 10,
            paddingTop: 28,
            marginVertical: 6,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.06)',
          }}
        >
          <CodeBlockCopyButton code={codeContent} />
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              fontFamily: 'Menlo',
              color: 'rgba(245, 247, 251, 0.85)',
            }}
            selectable
          >
            {codeContent}
          </Text>
        </View>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last block
  if (lastIndex < content.length) {
    remaining = content.slice(lastIndex);
    elements.push(
      <Text
        key={`text-${keyCounter++}`}
        className="text-[15px] leading-relaxed text-white/90"
        selectable
      >
        {renderInlineMarkdown(remaining, `il-tail-${keyCounter}`)}
      </Text>,
    );
  }

  // If nothing matched, render the entire content as inline text
  if (elements.length === 0 && content.length > 0) {
    elements.push(
      <Text key="text-0" className="text-[15px] leading-relaxed text-white/90" selectable>
        {renderInlineMarkdown(content, 'il-0')}
      </Text>,
    );
  }

  return elements;
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
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const [expandedArtifact, setExpandedArtifact] = useState<Artifact | null>(null);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editText, setEditText] = useState('');
  const { width } = useWindowDimensions();

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

  const contentElements = renderMarkdownContent(message.content);

  // Compute image display width: full bubble width minus avatar + gap + padding
  const imageWidth = Math.min(width - 80, 320);

  return (
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

            {/* Reasoning accordion (before main content, assistant only) */}
            {isAssistant && message.reasoning ? (
              <ReasoningAccordion reasoning={message.reasoning} isStreaming={message.isStreaming} />
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

      {/* Edit message modal (Android + fallback for iOS when Alert.prompt unavailable) */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <Pressable style={editStyles.backdrop} onPress={() => setEditModalVisible(false)}>
          <Pressable style={editStyles.dialog} onPress={() => undefined}>
            <Text style={editStyles.dialogTitle}>Edit Message</Text>
            <TextInput
              style={editStyles.input}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              placeholderTextColor="rgba(255,255,255,0.3)"
              placeholder="Edit your message…"
            />
            <View style={editStyles.buttonRow}>
              <Pressable
                style={editStyles.cancelBtn}
                onPress={() => setEditModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
              >
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={editStyles.submitBtn}
                onPress={handleSubmitEdit}
                accessibilityRole="button"
                accessibilityLabel="Submit edit"
              >
                <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '600' }}>Send</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Animated.View>
  );
});

const editStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    backgroundColor: '#1e2025',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#fff',
    minHeight: 80,
    maxHeight: 200,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  cancelBtn: {
    padding: 8,
  },
  submitBtn: {
    padding: 8,
  },
});
