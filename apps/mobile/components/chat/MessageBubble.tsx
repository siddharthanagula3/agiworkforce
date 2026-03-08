import { View, useWindowDimensions } from 'react-native';
import { memo, useCallback, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
import { colors } from '@/lib/theme';
import type { ChatMessage, Artifact } from '@/types/chat';

interface MessageBubbleProps {
  message: ChatMessage;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
}

/**
 * Renders basic inline markdown:
 * - **bold** text
 * - `inline code`
 * - ```code blocks```
 *
 * Returns an array of React Native Text/View elements.
 */
function renderMarkdownContent(content: string): React.ReactNode[] {
  if (!content) return [];

  const elements: React.ReactNode[] = [];
  const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Text before the code block
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      elements.push(
        <Text
          key={`text-${keyCounter++}`}
          className="text-[15px] leading-relaxed text-white/90"
          selectable
        >
          {renderInlineMarkdown(textBefore)}
        </Text>,
      );
    }

    // Code block
    const codeContent = match[1].trim();
    elements.push(
      <View
        key={`code-${keyCounter++}`}
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          borderRadius: 8,
          padding: 10,
          marginVertical: 6,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.06)',
        }}
      >
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

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    elements.push(
      <Text
        key={`text-${keyCounter++}`}
        className="text-[15px] leading-relaxed text-white/90"
        selectable
      >
        {renderInlineMarkdown(remaining)}
      </Text>,
    );
  }

  return elements;
}

/**
 * Handles inline formatting: **bold** and `code`.
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const inlineRegex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIdx = 0;
  let inlineMatch: RegExpExecArray | null;
  let inlineKey = 0;

  while ((inlineMatch = inlineRegex.exec(text)) !== null) {
    // Plain text before
    if (inlineMatch.index > lastIdx) {
      parts.push(text.slice(lastIdx, inlineMatch.index));
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

  // Remaining plain text
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
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
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const [expandedArtifact, setExpandedArtifact] = useState<Artifact | null>(null);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
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

  const contentElements = renderMarkdownContent(message.content);

  // Compute image display width: full bubble width minus avatar + gap + padding
  const imageWidth = Math.min(width - 80, 320);

  return (
    <Animated.View
      entering={FadeInDown.duration(200).springify()}
      className={`px-4 py-3 ${isAssistant ? 'bg-white/[0.02]' : ''}`}
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
    </Animated.View>
  );
});
