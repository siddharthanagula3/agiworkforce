import React, { memo, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@shared/ui/scroll-area';
import { Bot } from 'lucide-react';
import type { ChatMessage } from '../../types';
import type { SearchResponse } from '@core/integrations/web-search-handler';
import type { MediaGenerationResult } from '@core/integrations/media-generation-handler';
import type { GeneratedDocument } from '../../services/document-generation-service';
import { MessageBubble, messageListVariants } from '../messages/MessageBubble';
import { EmployeeThinkingIndicator } from '../agents/EmployeeThinkingIndicator';
import { useChatStore } from '@shared/stores/chat-store';
import ErrorBoundary from '@shared/components/ErrorBoundary';
import { Button } from '@shared/ui/button';
import { AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@shared/ui/dialog';
import { Textarea } from '@shared/ui/textarea';

/**
 * Type-safe interface for message metadata fields
 * Includes tool-related fields for inline display
 */
interface MessageMetadata {
  employeeId?: string;
  employeeName?: string;
  employeeAvatar?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokens?: number;
  tokensUsed?: number;
  model?: string;
  cost?: number;
  isPinned?: boolean;
  selectionReason?: string;
  thinkingSteps?: string[];
  isThinking?: boolean;
  isSearching?: boolean;
  isToolProcessing?: boolean;
  // Extended thinking (ThinkingBlock)
  thinkingContent?: string;
  isThinkingStreaming?: boolean;
  thinkingStartedAt?: string;
  thinkingCompletedAt?: string;
  thinkingDurationSeconds?: number;
  // Streaming state
  isStreaming?: boolean;
  // Multi-agent collaboration
  isMultiAgent?: boolean;
  collaborationMessages?: Array<{
    employeeName: string;
    employeeAvatar: string;
    content: string;
    messageType?: string;
  }>;
  employeesInvolved?: string[];
  isSynthesis?: boolean;
  // Tool execution result fields for inline display
  toolType?: string;
  toolResult?: unknown;
  imageUrl?: string;
  imageData?: { url?: string; base64?: string; prompt?: string };
  videoUrl?: string;
  thumbnailUrl?: string;
  videoData?: { url?: string; thumbnailUrl?: string; duration?: number };
  searchResults?: Array<{ title: string; url: string; snippet: string }>;
  documentData?: { title?: string; content?: string; format?: string };
  downloadData?: { filename: string; content: string; contentType: string };
  // Citations from server-managed web search tools
  citations?: Array<{
    type?: string;
    cited_text?: string;
    title?: string;
    url?: string;
  }>;
}

/**
 * Validates a single metadata field against a runtime type check.
 * Returns the value cast to T if it matches, or undefined otherwise.
 */
function validateField<T>(value: unknown, type: string): T | undefined {
  return typeof value === type ? (value as T) : undefined;
}

/**
 * Type guard to safely extract metadata from ChatMessage
 * Returns a validated MessageMetadata object with proper types
 */
function getValidatedMetadata(
  metadata: ChatMessage['metadata'] | Record<string, unknown> | undefined,
): MessageMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }

  // Cast to Record<string, unknown> to uniformly access dynamic metadata fields
  const md = metadata as Record<string, unknown>;
  const result: MessageMetadata = {};

  // String fields
  result.employeeId = validateField<string>(md['employeeId'], 'string');
  result.employeeName = validateField<string>(md['employeeName'], 'string');
  result.employeeAvatar = validateField<string>(md['employeeAvatar'], 'string');
  result.model = validateField<string>(md['model'], 'string');
  result.selectionReason = validateField<string>(md['selectionReason'], 'string');

  // Number fields
  result.inputTokens = validateField<number>(md['inputTokens'], 'number');
  result.outputTokens = validateField<number>(md['outputTokens'], 'number');
  result.tokens = validateField<number>(md['tokens'], 'number');
  result.tokensUsed = validateField<number>(md['tokensUsed'], 'number');
  result.cost = validateField<number>(md['cost'], 'number');

  // Boolean fields
  result.isPinned = validateField<boolean>(md['isPinned'], 'boolean');
  result.isThinking = validateField<boolean>(md['isThinking'], 'boolean');
  result.isSearching = validateField<boolean>(md['isSearching'], 'boolean');
  result.isToolProcessing = validateField<boolean>(md['isToolProcessing'], 'boolean');

  // Array fields
  if (
    Array.isArray(md['thinkingSteps']) &&
    (md['thinkingSteps'] as unknown[]).every((step: unknown) => typeof step === 'string')
  ) {
    result.thinkingSteps = md['thinkingSteps'] as string[];
  }

  // Extended thinking (ThinkingBlock)
  result.thinkingContent = validateField<string>(md['thinkingContent'], 'string');
  result.isThinkingStreaming = validateField<boolean>(md['isThinkingStreaming'], 'boolean');
  result.thinkingStartedAt = validateField<string>(md['thinkingStartedAt'], 'string');
  result.thinkingCompletedAt = validateField<string>(md['thinkingCompletedAt'], 'string');
  result.thinkingDurationSeconds = validateField<number>(md['thinkingDurationSeconds'], 'number');

  // Streaming state
  result.isStreaming = validateField<boolean>(md['isStreaming'], 'boolean');

  // Multi-agent collaboration
  result.isMultiAgent = validateField<boolean>(md['isMultiAgent'], 'boolean');
  result.isSynthesis = validateField<boolean>(md['isSynthesis'], 'boolean');
  if (Array.isArray(md['collaborationMessages'])) {
    result.collaborationMessages = md[
      'collaborationMessages'
    ] as MessageMetadata['collaborationMessages'];
  }
  if (Array.isArray(md['employeesInvolved'])) {
    result.employeesInvolved = md['employeesInvolved'] as string[];
  }

  // Tool execution result fields for inline display
  result.toolType = validateField<string>(md['toolType'], 'string');
  if (md['toolResult'] !== undefined) {
    result.toolResult = md['toolResult'];
  }
  result.imageUrl = validateField<string>(md['imageUrl'], 'string');
  if (md['imageData'] && typeof md['imageData'] === 'object') {
    result.imageData = md['imageData'] as MessageMetadata['imageData'];
  }
  result.videoUrl = validateField<string>(md['videoUrl'], 'string');
  result.thumbnailUrl = validateField<string>(md['thumbnailUrl'], 'string');
  if (md['videoData'] && typeof md['videoData'] === 'object') {
    result.videoData = md['videoData'] as MessageMetadata['videoData'];
  }
  if (Array.isArray(md['searchResults'])) {
    result.searchResults = md['searchResults'] as MessageMetadata['searchResults'];
  }
  if (md['documentData'] && typeof md['documentData'] === 'object') {
    result.documentData = md['documentData'] as MessageMetadata['documentData'];
  }
  if (md['downloadData'] && typeof md['downloadData'] === 'object') {
    result.downloadData = md['downloadData'] as MessageMetadata['downloadData'];
  }

  // Citations from server-managed web search tools
  if (Array.isArray(md['citations'])) {
    result.citations = md['citations'] as MessageMetadata['citations'];
  }

  return result;
}

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onRegenerate: (messageId: string) => void;
  onEdit: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
  onToolExecute: (toolId: string, args?: Record<string, unknown>) => void;
  toolResults?: Record<string, unknown>;
  activeTool?: string | null;
}

const MessageListComponent: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  onRegenerate,
  onEdit,
  onDelete,
}) => {
  const reactToMessage = useChatStore((state) => state.reactToMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleEdit = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;

      setEditingMessageId(messageId);
      setEditContent(message.content);
      setEditDialogOpen(true);
    },
    [messages],
  );

  const handleEditSave = useCallback(() => {
    if (editingMessageId && editContent.trim()) {
      onEdit(editingMessageId, editContent.trim());
    }
    setEditDialogOpen(false);
    setEditingMessageId(null);
    setEditContent('');
  }, [editingMessageId, editContent, onEdit]);

  const handleEditCancel = useCallback(() => {
    setEditDialogOpen(false);
    setEditingMessageId(null);
    setEditContent('');
  }, []);

  const handlePin = (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    const meta = msg?.metadata as Record<string, unknown> | undefined;
    updateMessage(messageId, {
      metadata: {
        ...meta,
        isPinned: !meta?.['isPinned'],
      } as ChatMessage['metadata'],
    });
  };

  const handleReact = (messageId: string, reactionType: 'up' | 'down' | 'helpful') => {
    reactToMessage(messageId, reactionType);
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="flex h-full items-center justify-center p-8">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <h3 className="mb-2 text-lg font-semibold">Message Display Error</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Something went wrong displaying the chat messages.
            </p>
            <Button onClick={() => window.location.reload()} variant="outline" size="sm">
              Reload Chat
            </Button>
          </div>
        </div>
      }
    >
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="max-w-md space-y-4">
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Bot className="h-8 w-8 text-white" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Welcome to AGI Workforce</h2>
            <p className="text-muted-foreground">
              Start a conversation by typing a message below...
            </p>
            <div className="space-y-2 text-sm text-left">
              <p className="font-medium text-foreground">Try asking me to:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Research any topic in depth</li>
                <li>Write and review code</li>
                <li>Generate images and videos</li>
                <li>Analyze data and documents</li>
                <li>Help with creative writing</li>
              </ul>
            </div>
          </div>
        </div>
      )}
      <ScrollArea className="flex-1">
        <motion.div
          className="space-y-0"
          variants={messageListVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence initial={false}>
            {messages.map((message, messageIndex) => {
              // Ensure createdAt is a Date object
              // Use a stable fallback (epoch start) to avoid impure Date.now() during render
              const timestamp =
                message.createdAt instanceof Date
                  ? message.createdAt
                  : new Date(message.createdAt || 0);

              // Get validated metadata using type guard
              const meta = getValidatedMetadata(message.metadata);

              // Check if this is a thinking/processing indicator message
              if (meta.isThinking || meta.isSearching || meta.isToolProcessing) {
                return (
                  <EmployeeThinkingIndicator
                    key={message.id}
                    employeeName={meta.employeeName}
                    employeeAvatar={meta.employeeAvatar}
                    message={message.content}
                  />
                );
              }

              return (
                <MessageBubble
                  key={message.id}
                  animationIndex={messageIndex}
                  message={{
                    id: message.id,
                    content: message.content,
                    role: message.role === 'user' ? 'user' : 'assistant',
                    timestamp,
                    employeeId: meta.employeeId,
                    employeeName: meta.employeeName,
                    employeeAvatar: meta.employeeAvatar,
                    isStreaming: meta.isStreaming || message.isStreaming,
                    reactions: [],
                    metadata: {
                      tokensUsed: meta.tokens ?? meta.tokensUsed,
                      inputTokens: meta.inputTokens,
                      outputTokens: meta.outputTokens,
                      model: meta.model,
                      cost: meta.cost,
                      isPinned: meta.isPinned,
                      selectionReason: meta.selectionReason,
                      thinkingSteps: meta.thinkingSteps,
                      // Extended thinking (ThinkingBlock)
                      thinkingContent: meta.thinkingContent,
                      isThinkingStreaming: meta.isThinkingStreaming,
                      thinkingStartedAt: meta.thinkingStartedAt,
                      thinkingCompletedAt: meta.thinkingCompletedAt,
                      thinkingDurationSeconds: meta.thinkingDurationSeconds,
                      // Multi-agent collaboration
                      isMultiAgent: meta.isMultiAgent,
                      collaborationMessages: meta.collaborationMessages,
                      employeesInvolved: meta.employeesInvolved,
                      isSynthesis: meta.isSynthesis,
                      // Tool execution result fields - cast to expected types
                      toolType: meta.toolType,
                      toolResult: meta.toolResult as boolean | undefined,
                      imageUrl: meta.imageUrl,
                      imageData: meta.imageData as MediaGenerationResult | undefined,
                      videoUrl: meta.videoUrl,
                      thumbnailUrl: meta.thumbnailUrl,
                      videoData: meta.videoData as MediaGenerationResult | undefined,
                      searchResults: meta.searchResults as unknown as SearchResponse | undefined,
                      documentData: meta.documentData as GeneratedDocument | undefined,
                      citations: meta.citations,
                    },
                  }}
                  onEdit={handleEdit}
                  onRegenerate={onRegenerate}
                  onDelete={onDelete}
                  onPin={handlePin}
                  onReact={handleReact}
                />
              );
            })}
          </AnimatePresence>

          {/* Loading indicator - fallback if not using thinking indicator */}
          {isLoading && messages.every((m) => !getValidatedMetadata(m.metadata).isThinking) && (
            <EmployeeThinkingIndicator message="Processing your request..." />
          )}
        </motion.div>
      </ScrollArea>

      {/* Edit Message Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Message</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Edit your message..."
              className="min-h-[150px] resize-y"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleEditCancel}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={!editContent.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  );
};

// Memoize the component to prevent unnecessary re-renders when parent state changes
// This is important since MessageList can render 1000+ messages
export const MessageList = memo(MessageListComponent);
