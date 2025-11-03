import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { FileDropZone } from './FileDropZone';
import { FileAttachmentPreview } from './FileAttachmentPreview';
import { cn } from '../../lib/utils';
import { generateId, readFileAsDataURL, validateFile } from '../../utils/fileUtils';
import type { FileAttachment, ChatRoutingPreferences } from '../../types/chat';
import { toast } from 'sonner';

interface InputComposerProps {
  onSend: (
    content: string,
    attachments?: FileAttachment[],
    captures?: unknown,
    routing?: ChatRoutingPreferences
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

export function InputComposer({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  maxLength = 4000,
  className,
}: InputComposerProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (!content.trim() && attachments.length === 0) return;
    if (isProcessing) return;

    // Filter out attachments with errors
    const validAttachments = attachments.filter(a => !a.error);

    onSend(content, validAttachments.length > 0 ? validAttachments : undefined);
    setContent('');
    setAttachments([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileDrop = async (files: File[]) => {
    await processFiles(files);
  };

  const handleFileError = (errors: Array<{ file: File; error: string }>) => {
    errors.forEach(({ file, error }) => {
      toast.error(`${file.name}: ${error}`);
    });
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setIsProcessing(true);

    const newAttachments: FileAttachment[] = [];

    for (const file of files) {
      const validation = validateFile(file);
      const attachment: FileAttachment = {
        id: generateId(),
        name: file.name,
        size: file.size,
        type: file.type,
      };

      if (!validation.valid) {
        if (validation.error !== undefined) {
          attachment.error = validation.error;
        }
        newAttachments.push(attachment);
        toast.error(`${file.name}: ${validation.error ?? 'Unknown error'}`);
        continue;
      }

      try {
        // Read file as data URL for preview
        const dataUrl = await readFileAsDataURL(file);
        attachment.data = dataUrl;
        newAttachments.push(attachment);
      } catch (error) {
        attachment.error = 'Failed to read file';
        newAttachments.push(attachment);
        toast.error(`${file.name}: Failed to read file`);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsProcessing(false);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const charCount = content.length;
  const isOverLimit = charCount > maxLength;
  const hasErrors = attachments.some(a => a.error);
  const canSend = !disabled && !isProcessing && !isOverLimit && !hasErrors &&
    (content.trim() || attachments.length > 0);

  return (
    <div className={cn('border-t border-border bg-background', className)}>
      <FileDropZone
        onFilesSelected={handleFileDrop}
        onError={handleFileError}
        maxFiles={5}
      >
        <div className="p-4">
          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Attachments ({attachments.length})
                </span>
                {hasErrors && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>Some files have errors</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {attachments.map((attachment) => (
                  <FileAttachmentPreview
                    key={attachment.id}
                    attachment={attachment}
                    onRemove={() => removeAttachment(attachment.id)}
                    removable={!isProcessing}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {/* File attachment button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.html,.css"
              className="hidden"
              onChange={handleFileSelect}
              disabled={disabled || isProcessing}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled || isProcessing}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach files"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Attach files (images, PDFs, code)</p>
              </TooltipContent>
            </Tooltip>

            {/* Text input */}
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled || isProcessing}
                className={cn(
                  'min-h-[44px] max-h-[200px] resize-none pr-16',
                  isOverLimit && 'border-destructive focus-visible:ring-destructive'
                )}
                rows={1}
                aria-label="Message input"
              />

              {/* Character count */}
              <div
                className={cn(
                  'absolute right-3 bottom-3 text-xs text-muted-foreground',
                  isOverLimit && 'text-destructive'
                )}
              >
                {charCount}/{maxLength}
              </div>
            </div>

            {/* Send button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  disabled={!canSend}
                  onClick={handleSend}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Send message (Enter)</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">
              Press Enter to send, Shift+Enter for new line
            </p>
            {isProcessing && (
              <p className="text-xs text-muted-foreground">
                Processing files...
              </p>
            )}
          </div>
        </div>
      </FileDropZone>
    </div>
  );
}
