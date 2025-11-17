import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Paperclip, Mic, Camera, X, Image as ImageIcon } from 'lucide-react';
import { useUnifiedChatStore, ContextItem, Attachment } from '../../stores/unifiedChatStore';

export interface SendOptions {
  attachments?: Attachment[];
  context?: ContextItem[];
}

export interface ChatInputAreaProps {
  onSend: (content: string, options: SendOptions) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  enableAttachments?: boolean;
  enableVoice?: boolean;
  enableScreenshot?: boolean;
  className?: string;
}

const MAX_ROWS = 10;
const APPROX_TOKENS_PER_CHAR = 0.25; // Rough approximation

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  maxLength = 10000,
  enableAttachments = true,
  enableVoice = false,
  enableScreenshot = true,
  className = '',
}) => {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Updated Nov 16, 2025: Added ref to track FileReader instances for cleanup
  const fileReadersRef = useRef<FileReader[]>([]);

  const activeContext = useUnifiedChatStore((state) => state.activeContext) || [];
  const removeContextItem = useUnifiedChatStore((state) => state.removeContextItem);
  const isLoading = useUnifiedChatStore((state) => state.isLoading);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const lineHeight = 24; // Approximate line height
      const maxHeight = lineHeight * MAX_ROWS;
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [content]);

  // Updated Nov 16, 2025: Cleanup FileReader instances and object URLs on unmount
  useEffect(() => {
    return () => {
      // Abort any pending FileReader operations
      fileReadersRef.current.forEach((reader) => {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
        }
      });
      fileReadersRef.current = [];

      // Revoke object URLs to prevent memory leaks
      attachments.forEach((attachment) => {
        if (attachment.path && attachment.path.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.path);
        }
      });
    };
  }, [attachments]);

  // Updated Nov 16, 2025: Memoized token estimation to avoid recalculation on every render
  const estimatedTokens = useMemo(
    () => Math.ceil(content.length * APPROX_TOKENS_PER_CHAR),
    [content.length],
  );
  const charCount = content.length;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim() || disabled || isLoading) return;

    onSend(content, {
      attachments: attachments.length > 0 ? attachments : undefined,
      context: activeContext.length > 0 ? activeContext : undefined,
    });

    // Reset state
    setContent('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments: Attachment[] = files.map((file) => ({
      id: crypto.randomUUID(),
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      // In a real app, you'd upload the file and get a path/URL
      path: URL.createObjectURL(file),
    }));
    setAttachments([...attachments, ...newAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Updated Nov 16, 2025: Revoke object URL when removing attachment
  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.path && attachment.path.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.path);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  // Updated Nov 16, 2025: Fixed memory leak and stale closure in handlePaste
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          // Track reader for cleanup
          fileReadersRef.current.push(reader);

          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            const attachment: Attachment = {
              id: crypto.randomUUID(),
              type: 'image',
              name: 'pasted-image.png',
              size: file.size,
              mimeType: file.type,
              content: base64,
            };
            // Use functional update to avoid stale closure
            setAttachments((prev) => [...prev, attachment]);

            // Remove reader from tracking after completion
            fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
          };

          reader.onerror = () => {
            // Remove reader from tracking on error
            fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
          };

          reader.readAsDataURL(file);
        }
      });
    }
  };

  const isDisabled = disabled || isLoading;

  return (
    <div
      className={`chat-input-area border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 ${className}`}
    >
      {/* Context Pills */}
      {activeContext.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-600 dark:text-gray-400">Context:</span>
            {activeContext.map((item) => (
              <div
                key={item.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-md text-xs"
              >
                <span>{item.icon || '📄'}</span>
                <span className="max-w-xs truncate">{item.name}</span>
                {item.size && (
                  <span className="text-blue-600 dark:text-blue-400">
                    ({Math.round(item.size / 1024)}KB)
                  </span>
                )}
                <button
                  onClick={() => removeContextItem(item.id)}
                  className="ml-1 hover:text-blue-900 dark:hover:text-blue-200"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 flex-wrap">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="relative group inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg"
              >
                {attachment.type === 'image' ? (
                  <ImageIcon size={16} className="text-gray-600 dark:text-gray-400" />
                ) : (
                  <Paperclip size={16} className="text-gray-600 dark:text-gray-400" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
                  {attachment.name}
                </span>
                {attachment.size && (
                  <span className="text-xs text-gray-500">
                    ({Math.round(attachment.size / 1024)}KB)
                  </span>
                )}
                <button
                  onClick={() => removeAttachment(attachment.id)}
                  className="ml-1 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <X size={14} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-end gap-2 px-4 py-3">
          {/* File Attachment Button */}
          {enableAttachments && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isDisabled}
                className="flex-shrink-0 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Attach file"
              >
                <Paperclip size={20} className="text-gray-600 dark:text-gray-400" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept="*/*"
              />
            </>
          )}

          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder}
              disabled={isDisabled}
              maxLength={maxLength}
              rows={1}
              className="w-full px-4 py-2 pr-20 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              style={{ minHeight: '42px' }}
            />
            {/* Character/Token Counter */}
            <div className="absolute bottom-2 right-2 flex items-center gap-2 text-xs text-gray-500 pointer-events-none">
              <span>{estimatedTokens} tokens</span>
              <span>·</span>
              <span className={charCount > maxLength * 0.9 ? 'text-orange-500' : ''}>
                {charCount}/{maxLength}
              </span>
            </div>
          </div>

          {/* Screenshot Button */}
          {enableScreenshot && (
            <button
              type="button"
              disabled={isDisabled}
              className="flex-shrink-0 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Capture screenshot"
            >
              <Camera size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}

          {/* Voice Input Button */}
          {enableVoice && (
            <button
              type="button"
              disabled={isDisabled}
              className="flex-shrink-0 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Voice input"
            >
              <Mic size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}

          {/* Send Button */}
          <button
            type="submit"
            disabled={!content.trim() || isDisabled}
            className="flex-shrink-0 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400"
            title="Send message"
          >
            <Send size={20} />
          </button>
        </div>
      </form>

      {/* Keyboard Shortcuts Hint */}
      <div className="px-4 pb-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="font-mono">Enter</span> to send,{' '}
        <span className="font-mono">Shift+Enter</span> for new line
      </div>
    </div>
  );
};

export default ChatInputArea;
