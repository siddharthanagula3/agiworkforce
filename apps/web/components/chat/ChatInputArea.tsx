'use client';

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { Send, Paperclip, X, Loader2, Square, Image as ImageIcon } from 'lucide-react';
import { clsx } from 'clsx';
import type { Attachment } from '@/stores/chatStore';

interface ChatInputAreaProps {
  onSend: (content: string, attachments?: Attachment[]) => Promise<void>;
  onStopGeneration?: () => void;
  isStreaming?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

const MAX_ROWS = 8;
const ATTACHMENT_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB per file
  MAX_TOTAL_SIZE: 50 * 1024 * 1024, // 50MB total
  MAX_COUNT: 5,
};

export const ChatInputArea = memo(function ChatInputArea({
  onSend,
  onStopGeneration,
  isStreaming = false,
  isLoading = false,
  disabled = false,
  placeholder = 'Ask me anything...',
  maxLength = 10000,
  className = '',
}: ChatInputAreaProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInputDisabled = disabled || isSending;
  const showStopButton = isStreaming && onStopGeneration;

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const lineHeight = 24;
      const maxHeight = lineHeight * MAX_ROWS;
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [content]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Handle file reading as base64
  const readFileAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsDataURL(file);
    });
  }, []);

  // Process added files
  const handleFilesAdded = useCallback(
    async (files: File[]) => {
      setError(null);

      // Validate file sizes
      const oversizedFiles: string[] = [];
      let totalSize = 0;

      for (const file of files) {
        if (file.size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
          oversizedFiles.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        }
        totalSize += file.size;
      }

      if (oversizedFiles.length > 0) {
        setError(`Files exceed 10MB limit: ${oversizedFiles.join(', ')}`);
        return;
      }

      // Check total attachment count
      if (attachments.length + files.length > ATTACHMENT_LIMITS.MAX_COUNT) {
        setError(`Maximum ${ATTACHMENT_LIMITS.MAX_COUNT} attachments allowed`);
        return;
      }

      // Check total size
      const currentTotalSize = attachments.reduce((sum, att) => sum + (att.size || 0), 0);
      if (currentTotalSize + totalSize > ATTACHMENT_LIMITS.MAX_TOTAL_SIZE) {
        setError('Total attachment size would exceed 50MB limit');
        return;
      }

      // Only allow images for now
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        setError('Only image files are supported');
        return;
      }

      setIsProcessingFiles(true);
      try {
        const newAttachments: Attachment[] = await Promise.all(
          imageFiles.map(async (file) => {
            const base64Content = await readFileAsBase64(file);
            return {
              id: crypto.randomUUID(),
              type: 'image' as const,
              name: file.name,
              size: file.size,
              mimeType: file.type,
              content: base64Content,
            };
          }),
        );
        setAttachments((prev) => [...prev, ...newAttachments]);
      } catch (err) {
        console.error('Error processing files:', err);
        setError('Failed to process files. Please try again.');
      } finally {
        setIsProcessingFiles(false);
      }
    },
    [attachments, readFileAsBase64],
  );

  // Drag and drop handlers
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.target === document.body) setIsDragging(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) handleFilesAdded(files);
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [handleFilesAdded]);

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (value.length > maxLength) {
        setError(`Character limit exceeded by ${value.length - maxLength} characters`);
        return;
      }
      setContent(value);
      setError(null);
    },
    [maxLength],
  );

  // Handle submit
  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!content.trim() || isInputDisabled || isSending) return;

      const messageContent = content.trim();
      const messageAttachments = attachments.length > 0 ? attachments : undefined;

      setIsSending(true);
      setContent('');
      setAttachments([]);
      setError(null);

      try {
        await onSend(messageContent, messageAttachments);
      } catch (err) {
        setContent(messageContent);
        if (messageAttachments) setAttachments(messageAttachments);
        setError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        setIsSending(false);
        textareaRef.current?.focus();
      }
    },
    [content, attachments, isInputDisabled, isSending, onSend],
  );

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Handle file input change
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      handleFilesAdded(files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleFilesAdded],
  );

  // Handle paste for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items).filter((item) =>
        item.type.startsWith('image/'),
      );
      if (items.length === 0) return;

      e.preventDefault();
      const files = items.map((item) => item.getAsFile()).filter(Boolean) as File[];
      handleFilesAdded(files);
    },
    [handleFilesAdded],
  );

  // Remove attachment
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <>
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/10">
            <ImageIcon className="w-12 h-12 text-blue-500" />
            <p className="text-lg font-medium text-white">Drop images here</p>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Input area */}
      <div
        className={clsx(
          'relative rounded-2xl',
          'bg-white/95 dark:bg-charcoal-800/95 backdrop-blur-xl',
          'border border-gray-200/80 dark:border-gray-700/80',
          'shadow-xl shadow-gray-200/50 dark:shadow-black/30',
          'focus-within:border-teal-500/50 focus-within:ring-4 focus-within:ring-teal-500/10',
          'transition-all duration-200',
          className,
        )}
      >
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="relative group">
                {attachment.type === 'image' && attachment.content && (
                  <img
                    src={attachment.content}
                    alt={attachment.name}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                )}
                <button
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Processing indicator */}
        {isProcessingFiles && (
          <div className="flex items-center gap-2 px-4 pt-3 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing files...
          </div>
        )}

        {/* Error message */}
        {error && <div className="px-4 pt-3 text-sm text-red-500">{error}</div>}

        {/* Main input row */}
        <div className="flex items-end gap-2 p-3">
          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isInputDisabled}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
              'hover:bg-gray-100 dark:hover:bg-gray-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title="Attach images"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isLoading ? 'Waiting for response...' : placeholder}
            disabled={isInputDisabled}
            rows={1}
            className={clsx(
              'flex-1 resize-none bg-transparent py-2 px-2',
              'text-gray-900 dark:text-gray-100',
              'placeholder-gray-400 dark:placeholder-gray-500',
              'focus:outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'text-[15px] leading-6',
            )}
            style={{ maxHeight: `${24 * MAX_ROWS}px` }}
          />

          {/* Send/Stop button */}
          {showStopButton ? (
            <button
              type="button"
              onClick={onStopGeneration}
              className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
              title="Stop generation"
            >
              <Square className="w-5 h-5" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isInputDisabled || !content.trim()}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                content.trim() && !isInputDisabled
                  ? 'bg-terra-cotta-500 hover:bg-terra-cotta-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed',
              )}
              title="Send message"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 pb-2 text-xs text-gray-400">
          <span>Enter to send • Shift+Enter for new line</span>
          <span className="tabular-nums">
            {content.length} / {maxLength}
          </span>
        </div>
      </div>
    </>
  );
});

export default ChatInputArea;
