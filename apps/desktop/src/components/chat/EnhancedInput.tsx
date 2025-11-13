import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Paperclip,
  Camera,
  Mic,
  MicOff,
  X,
  Folder,
  FileText,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { FileAttachment } from './FileAttachment';
import { CommandSuggestions, DEFAULT_COMMANDS, type CommandSuggestion } from './CommandSuggestions';
import { useInputStore } from '../../stores/inputStore';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';

interface EnhancedInputProps {
  onSend: (content: string, attachments: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  conversationId?: number | null;
  isSending?: boolean;
  className?: string;
}

const MIN_LINES = 3;
const MAX_LINES = 20;
const LINE_HEIGHT_PX = 24;
const MIN_HEIGHT = MIN_LINES * LINE_HEIGHT_PX; // 72px
const MAX_HEIGHT = MAX_LINES * LINE_HEIGHT_PX; // 480px

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total
const MAX_FILES = 10;

const ALLOWED_FILE_TYPES = [
  'image/*',
  'text/*',
  '.pdf',
  '.md',
  '.txt',
  '.csv',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.css',
  '.py',
  '.rs',
  '.go',
  '.java',
];

export function EnhancedInput({
  onSend,
  disabled = false,
  placeholder = 'Describe your task... (Shift+Enter for new line, Enter to submit)',
  conversationId = null,
  isSending = false,
  className,
}: EnhancedInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [isImagePasted, setIsImagePasted] = useState(false);

  const {
    attachments,
    addAttachment,
    removeAttachment,
    clearAttachments,
    isRecording,
    startRecording,
    stopRecording,
    contextMetadata,
    showMarkdownPreview,
    toggleMarkdownPreview,
    getDraft,
    setDraft,
    clearDraft,
  } = useInputStore();

  const controlsDisabled = disabled || isSending;
  const trimmedContent = content.trim();
  const charCount = content.length;
  const showCharCounter = charCount > 500;

  // Calculate total attachment size
  const totalAttachmentSize = attachments.reduce((sum, att) => sum + att.size, 0);

  // Filter commands based on query
  const filteredCommands = commandQuery
    ? DEFAULT_COMMANDS.filter(
        (cmd) =>
          cmd.command.toLowerCase().includes(commandQuery.toLowerCase()) ||
          cmd.description.toLowerCase().includes(commandQuery.toLowerCase()),
      )
    : DEFAULT_COMMANDS;

  // Load draft on mount and when conversation changes
  useEffect(() => {
    const draft = getDraft(conversationId);
    setContent(draft);
  }, [conversationId, getDraft]);

  // Save draft when content changes
  useEffect(() => {
    if (content) {
      setDraft(conversationId, content);
    } else {
      clearDraft(conversationId);
    }
  }, [content, conversationId, setDraft, clearDraft]);

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    textarea.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
  }, [content]);

  // Check for slash commands
  useEffect(() => {
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    const textBeforeCursor = content.slice(0, cursorPos);
    const lastSlash = textBeforeCursor.lastIndexOf('/');

    if (lastSlash !== -1 && lastSlash === textBeforeCursor.length - 1) {
      // Just typed a slash
      setShowCommands(true);
      setCommandQuery('');
      setSelectedCommandIndex(0);
    } else if (lastSlash !== -1 && textBeforeCursor.slice(lastSlash).match(/^\/\w*$/)) {
      // Typing after a slash
      const query = textBeforeCursor.slice(lastSlash + 1);
      setShowCommands(true);
      setCommandQuery(query);
      setSelectedCommandIndex(0);
    } else {
      setShowCommands(false);
      setCommandQuery('');
    }
  }, [content]);

  const canSend =
    !controlsDisabled && (trimmedContent.length > 0 || attachments.length > 0);

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const files = attachments.map((att) => att.file);
    onSend(content, files);

    // Clear state
    setContent('');
    clearAttachments();
    clearDraft(conversationId);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_HEIGHT}px`;
    }
  }, [canSend, content, attachments, onSend, clearAttachments, clearDraft, conversationId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle command suggestions
    if (showCommands) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev === 0 ? filteredCommands.length - 1 : prev - 1,
        );
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const selected = filteredCommands[selectedCommandIndex];
        if (selected) {
          handleCommandSelect(selected);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    // Handle submit
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        handleSend();
      }
      return;
    }

    // Clear input (Cmd/Ctrl+K)
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      setContent('');
      clearAttachments();
      return;
    }

    // Upload file (Cmd/Ctrl+U)
    if ((event.metaKey || event.ctrlKey) && event.key === 'u') {
      event.preventDefault();
      fileInputRef.current?.click();
      return;
    }
  };

  const handleCommandSelect = (command: CommandSuggestion) => {
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    const textBeforeCursor = content.slice(0, cursorPos);
    const lastSlash = textBeforeCursor.lastIndexOf('/');

    if (lastSlash !== -1) {
      const textAfterCursor = content.slice(cursorPos);
      const newContent =
        content.slice(0, lastSlash) + command.command + ' ' + textAfterCursor;
      setContent(newContent);

      // Set cursor position after command
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = lastSlash + command.command.length + 1;
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
          textareaRef.current.focus();
        }
      }, 0);
    }

    setShowCommands(false);
  };

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
    }
    return null;
  };

  const handleFileSelect = (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    // Check file count
    if (attachments.length + fileArray.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    // Check total size
    const newTotalSize = fileArray.reduce((sum, file) => sum + file.size, totalAttachmentSize);
    if (newTotalSize > MAX_TOTAL_SIZE) {
      toast.error(`Total size exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit`);
      return;
    }

    // Validate and add files
    fileArray.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        toast.error(`${file.name}: ${error}`);
      } else {
        addAttachment(file);
      }
    });

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleFileSelect(event.target.files);
    }
  };

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (controlsDisabled) return;

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          addAttachment(file);
          setIsImagePasted(true);
          toast.success('Image pasted successfully');
          setTimeout(() => setIsImagePasted(false), 2000);
        }
      }
    }
  };

  const handleVoiceToggle = () => {
    if (isRecording) {
      // Stop recording (placeholder - will implement later)
      toast.info('Voice recording stopped');
      stopRecording(new Blob(), 0);
    } else {
      // Start recording (placeholder - will implement later)
      toast.info('Voice recording started');
      startRecording();
    }
  };

  const handleScreenshot = async () => {
    // Placeholder for screenshot functionality
    toast.info('Screenshot feature coming soon');
  };

  const handleClearContext = () => {
    clearAttachments();
    toast.success('Context cleared');
  };

  return (
    <div
      className={cn('border-t border-border bg-background', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm"
          >
            <div className="rounded-lg border-2 border-dashed border-primary bg-background/90 p-8 text-center">
              <Paperclip className="mx-auto mb-2 h-8 w-8 text-primary" />
              <p className="text-lg font-medium text-foreground">Drop files here</p>
              <p className="text-sm text-muted-foreground">
                Up to {MAX_FILES} files, {MAX_FILE_SIZE / 1024 / 1024}MB each
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3 p-4">
        {/* Context indicators */}
        {(contextMetadata.workspacePath ||
          contextMetadata.selectedFilesCount > 0 ||
          contextMetadata.openEditorsCount > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {contextMetadata.workspacePath && (
              <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <Folder className="h-3 w-3" />
                <span className="max-w-xs truncate">{contextMetadata.workspacePath}</span>
              </div>
            )}
            {contextMetadata.selectedFilesCount > 0 && (
              <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <FileText className="h-3 w-3" />
                <span>{contextMetadata.selectedFilesCount} files selected</span>
              </div>
            )}
            {contextMetadata.openEditorsCount > 0 && (
              <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <FileText className="h-3 w-3" />
                <span>{contextMetadata.openEditorsCount} editors open</span>
              </div>
            )}
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Attachments ({attachments.length}/{MAX_FILES})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearContext}
                className="h-6 px-2 text-xs"
              >
                Clear all
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <FileAttachment
                  key={attachment.id}
                  id={attachment.id}
                  name={attachment.name}
                  size={attachment.size}
                  type={attachment.type}
                  previewUrl={attachment.previewUrl}
                  onRemove={removeAttachment}
                />
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
            disabled={controlsDisabled}
            accept={ALLOWED_FILE_TYPES.join(',')}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={controlsDisabled || attachments.length >= MAX_FILES}
                onClick={() => fileInputRef.current?.click()}
                className="h-8 gap-1.5"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span className="text-xs">Add files</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Attach files (Cmd/Ctrl+U)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={controlsDisabled}
                onClick={handleScreenshot}
                className="h-8 gap-1.5"
              >
                <Camera className="h-3.5 w-3.5" />
                <span className="text-xs">Screenshot</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Capture screenshot</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={controlsDisabled}
                onClick={handleVoiceToggle}
                className={cn('h-8 gap-1.5', isRecording && 'bg-destructive text-destructive-foreground')}
              >
                {isRecording ? (
                  <MicOff className="h-3.5 w-3.5" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
                <span className="text-xs">{isRecording ? 'Stop' : 'Voice'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isRecording ? 'Stop recording' : 'Record voice'}</p>
            </TooltipContent>
          </Tooltip>

          {attachments.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={controlsDisabled}
              onClick={handleClearContext}
              className="h-8 gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              <span className="text-xs">Clear context</span>
            </Button>
          )}

          <div className="flex-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMarkdownPreview}
                className="h-8 gap-1.5"
              >
                {showMarkdownPreview ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                <span className="text-xs">Preview</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle markdown preview</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Input area */}
        <div className="relative">
          {/* Command suggestions */}
          {showCommands && filteredCommands.length > 0 && (
            <CommandSuggestions
              suggestions={filteredCommands}
              selectedIndex={selectedCommandIndex}
              onSelect={handleCommandSelect}
            />
          )}

          {/* Markdown preview or textarea */}
          {showMarkdownPreview && trimmedContent ? (
            <div className="min-h-[72px] max-h-[480px] overflow-y-auto rounded-md border border-border bg-muted/30 p-3 prose prose-sm dark:prose-invert">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder}
              disabled={controlsDisabled}
              className={cn(
                'w-full resize-none rounded-md border border-border bg-background px-4 py-3 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              )}
              style={{
                minHeight: `${MIN_HEIGHT}px`,
                maxHeight: `${MAX_HEIGHT}px`,
                lineHeight: `${LINE_HEIGHT_PX}px`,
              }}
            />
          )}

          {/* Character counter */}
          {showCharCounter && (
            <div className="absolute right-3 bottom-3 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">
              {charCount} characters
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono">Enter</kbd> to send,{' '}
            <kbd className="rounded bg-muted px-1 py-0.5 font-mono">Shift+Enter</kbd> for new line
          </div>

          <Button
            size="default"
            disabled={!canSend}
            onClick={handleSend}
            className="gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Send</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
