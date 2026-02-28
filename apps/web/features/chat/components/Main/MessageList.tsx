import React, { memo, useCallback, useState } from 'react';
import { ScrollArea } from '@shared/ui/scroll-area';
import { Loader2, Bot } from 'lucide-react';
import type { ChatMessage } from '../../types';
import type { SearchResponse } from '@core/integrations/web-search-handler';
import type { MediaGenerationResult } from '@core/integrations/media-generation-handler';
import type { GeneratedDocument } from '../../services/document-generation-service';
import { MessageBubble } from '../messages/MessageBubble';
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
  if (typeof md.employeeId === 'string') {
    result.employeeId = md.employeeId;
  }
  if (typeof md.employeeName === 'string') {
    result.employeeName = md.employeeName;
  }
  if (typeof md.employeeAvatar === 'string') {
    result.employeeAvatar = md.employeeAvatar;
  }
  if (typeof md.model === 'string') {
    result.model = md.model;
  }
  if (typeof md.selectionReason === 'string') {
    result.selectionReason = md.selectionReason;
  }

  // Number fields
  if (typeof md.inputTokens === 'number') {
    result.inputTokens = md.inputTokens;
  }
  if (typeof md.outputTokens === 'number') {
    result.outputTokens = md.outputTokens;
  }
  if (typeof md.tokens === 'number') {
    result.tokens = md.tokens;
  }
  if (typeof md.tokensUsed === 'number') {
    result.tokensUsed = md.tokensUsed;
  }
  if (typeof md.cost === 'number') {
    result.cost = md.cost;
  }

  // Boolean fields
  if (typeof md.isPinned === 'boolean') {
    result.isPinned = md.isPinned;
  }
  if (typeof md.isThinking === 'boolean') {
    result.isThinking = md.isThinking;
  }
  if (typeof md.isSearching === 'boolean') {
    result.isSearching = md.isSearching;
  }
  if (typeof md.isToolProcessing === 'boolean') {
    result.isToolProcessing = md.isToolProcessing;
  }

  // Array fields
  if (
    Array.isArray(md.thinkingSteps) &&
    (md.thinkingSteps as unknown[]).every((step: unknown) => typeof step === 'string')
  ) {
    result.thinkingSteps = md.thinkingSteps as string[];
  }

  // Tool execution result fields for inline display
  if (typeof md.toolType === 'string') {
    result.toolType = md.toolType;
  }
  if (md.toolResult !== undefined) {
    result.toolResult = md.toolResult;
  }
  if (typeof md.imageUrl === 'string') {
    result.imageUrl = md.imageUrl;
  }
  if (md.imageData && typeof md.imageData === 'object') {
    result.imageData = md.imageData as MessageMetadata['imageData'];
  }
  if (typeof md.videoUrl === 'string') {
    result.videoUrl = md.videoUrl;
  }
  if (typeof md.thumbnailUrl === 'string') {
    result.thumbnailUrl = md.thumbnailUrl;
  }
  if (md.videoData && typeof md.videoData === 'object') {
    result.videoData = md.videoData as MessageMetadata['videoData'];
  }
  if (Array.isArray(md.searchResults)) {
    result.searchResults = md.searchResults as MessageMetadata['searchResults'];
  }
  if (md.documentData && typeof md.documentData === 'object') {
    result.documentData = md.documentData as MessageMetadata['documentData'];
  }
  if (md.downloadData && typeof md.downloadData === 'object') {
    result.downloadData = md.downloadData as MessageMetadata['downloadData'];
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
        isPinned: !meta?.isPinned,
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
      <ScrollArea className="flex-1">
        <div className="space-y-0">
          {messages.map((message) => {
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
                message={{
                  id: message.id,
                  content: message.content,
                  role: message.role === 'user' ? 'user' : 'assistant',
                  timestamp,
                  employeeId: meta.employeeId,
                  employeeName: meta.employeeName,
                  employeeAvatar: meta.employeeAvatar,
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

          {/* Loading indicator - fallback if not using thinking indicator */}
          {isLoading && messages.every((m) => !getValidatedMetadata(m.metadata).isThinking) && (
            <EmployeeThinkingIndicator message="Processing your request..." />
          )}
        </div>
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
