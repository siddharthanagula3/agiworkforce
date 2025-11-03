import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Send, Paperclip, X, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { ScreenCaptureButton } from '../ScreenCapture/ScreenCaptureButton';
import { CapturePreview } from '../ScreenCapture/CapturePreview';
import type { CaptureResult } from '../../hooks/useScreenCapture';
import { cn } from '../../lib/utils';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileDropZone } from './FileDropZone';
import { validateFiles, formatFileSize, generateId } from '../../utils/fileUtils';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { useSettingsStore, type Provider } from '../../stores/settingsStore';
import type { ChatRoutingPreferences } from '../../types/chat';
import { MODEL_PRESETS, PROVIDER_LABELS, PROVIDERS_IN_ORDER } from '../../constants/llm';

interface InputComposerProps {
  onSend: (
    content: string,
    attachments?: File[],
    captures?: CaptureResult[],
    routing?: ChatRoutingPreferences
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  conversationId?: number;
  isSending?: boolean;
}

interface AttachmentEntry {
  id: string;
  file: File;
  previewUrl?: string;
}

const MAX_ATTACHMENTS = 5;
const MAX_LINES = 10;
const LINE_HEIGHT_PX = 24;
const MAX_TEXTAREA_HEIGHT = MAX_LINES * LINE_HEIGHT_PX;

function cleanupAttachmentPreview(attachment: AttachmentEntry) {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

export function InputComposer({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  maxLength = 4000,
  className,
  conversationId,
  isSending = false,
}: InputComposerProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [captures, setCaptures] = useState<CaptureResult[]>([]);
  const [selectedCapture, setSelectedCapture] = useState<CaptureResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<AttachmentEntry[]>([]);

  const { llmConfig, setDefaultProvider, setDefaultModel } = useSettingsStore((state) => ({
    llmConfig: state.llmConfig,
    setDefaultProvider: state.setDefaultProvider,
    setDefaultModel: state.setDefaultModel,
  }));

  const [selectedProvider, setSelectedProvider] = useState<Provider>(llmConfig.defaultProvider);
  const [selectedModel, setSelectedModel] = useState(
    llmConfig.defaultModels[llmConfig.defaultProvider] ?? ''
  );

  const controlsDisabled = disabled || isSending;
  const trimmedContent = content.trim();
  const charCount = content.length;
  const isOverLimit = charCount > maxLength;
  const tokenEstimate = trimmedContent.length === 0 ? 0 : Math.ceil(trimmedContent.length / 4);
  const canSend =
    !controlsDisabled &&
    !isOverLimit &&
    (trimmedContent.length > 0 || attachments.length > 0 || captures.length > 0);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    const textarea = textareaRef.current;
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
  }, [content]);

  useEffect(() => {
    setSelectedProvider(llmConfig.defaultProvider);
    setSelectedModel(llmConfig.defaultModels[llmConfig.defaultProvider] ?? '');
  }, [llmConfig.defaultProvider, llmConfig.defaultModels]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(
    () => () => {
      attachmentsRef.current.forEach(cleanupAttachmentPreview);
    },
    []
  );

  const modelOptions = useMemo(() => {
    const presets = MODEL_PRESETS[selectedProvider] ?? [];
    const current = llmConfig.defaultModels[selectedProvider];
    if (current && !presets.some((option) => option.value === current)) {
      return [...presets, { value: current, label: current }];
    }
    return presets;
  }, [selectedProvider, llmConfig.defaultModels]);

  const selectedModelLabel =
    modelOptions.find((option) => option.value === selectedModel)?.label ?? selectedModel;

  const handleSend = () => {
    if (!trimmedContent && attachments.length === 0 && captures.length === 0) {
      return;
    }

    onSend(
      content,
      attachments.map((attachment) => attachment.file),
      captures,
      {
        provider: selectedProvider,
        model: selectedModel || undefined,
      }
    );
    setContent('');
    attachments.forEach(cleanupAttachmentPreview);
    setAttachments([]);
    setCaptures([]);
    setSelectedCapture(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        handleSend();
      }
    }
  };

  const addAttachments = (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setAttachments((previous) => {
      const remaining = MAX_ATTACHMENTS - previous.length;
      if (remaining <= 0) {
        toast.error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
        return previous;
      }

      const entries: AttachmentEntry[] = [];
      files.forEach((file, index) => {
        if (index < remaining) {
          const entry: AttachmentEntry = { id: generateId(), file };
          if (file.type.startsWith('image/')) {
            entry.previewUrl = URL.createObjectURL(file);
          }
          entries.push(entry);
        }
      });

      if (files.length > remaining) {
        toast.error(`Only ${remaining} more file${remaining === 1 ? '' : 's'} can be attached.`);
      }

      return [...previous, ...entries];
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const { valid, invalid } = validateFiles(files);
    if (invalid.length > 0) {
      invalid.forEach(({ file, error }) => toast.error(`${file.name}: ${error}`));
    }
    addAttachments(valid);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDropFiles = (files: File[]) => {
    if (controlsDisabled) {
      return;
    }
    addAttachments(files);
  };

  const handleDropErrors = (errors: Array<{ file: File; error: string }>) => {
    errors.forEach(({ file, error }) => toast.error(`${file.name}: ${error}`));
  };

  const removeAttachment = (id: string) => {
    setAttachments((previous) => {
      const target = previous.find((attachment) => attachment.id === id);
      if (target) {
        cleanupAttachmentPreview(target);
      }
      return previous.filter((attachment) => attachment.id !== id);
    });
  };

  const handleCaptureComplete = (result: CaptureResult) => {
    setCaptures((previous) => [...previous, result]);
  };

  const removeCapture = (index: number) => {
    setCaptures((previous) => previous.filter((_, idx) => idx !== index));
  };

  const handleProviderChange = (value: string) => {
    const provider = value as Provider;
    setSelectedProvider(provider);
    const storedModel = llmConfig.defaultModels[provider];
    const fallback = storedModel || MODEL_PRESETS[provider]?.[0]?.value || '';
    setSelectedModel(fallback);
    void setDefaultProvider(provider);
    if (!storedModel && fallback) {
      void setDefaultModel(provider, fallback);
    }
  };

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    void setDefaultModel(selectedProvider, value);
  };

  return (
    <div className={cn('border-t border-border bg-background', className)}>
      <FileDropZone
        onFilesSelected={handleDropFiles}
        onError={handleDropErrors}
        maxFiles={MAX_ATTACHMENTS}
        className="h-full"
      >
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <div className="w-full sm:w-auto sm:min-w-[180px]">
              <Select value={selectedProvider} onValueChange={handleProviderChange}>
                <SelectTrigger aria-label="Model provider" disabled={controlsDisabled}>
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS_IN_ORDER.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {PROVIDER_LABELS[provider]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:flex-1 sm:min-w-[220px]">
              <Select value={selectedModel} onValueChange={handleModelChange}>
                <SelectTrigger aria-label="Model" disabled={controlsDisabled}>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Attachments ({attachments.length}/{MAX_ATTACHMENTS})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="group flex items-center gap-3 rounded-lg border border-border/60 bg-muted/50 px-3 py-2"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background shadow-sm">
                      {attachment.previewUrl ? (
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.file.name}
                          className="h-10 w-10 rounded-md object-cover"
                        />
                      ) : (
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {attachment.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {`${attachment.file.type || 'Unknown type'} | ${formatFileSize(attachment.file.size)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {captures.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Screen captures</div>
              <div className="flex flex-wrap gap-2">
                {captures.map((capture, index) => (
                  <div
                    key={capture.id}
                    className="relative group rounded-lg border bg-muted/60"
                  >
                    <img
                      src={capture.thumbnailPath ? convertFileSrc(capture.thumbnailPath) : convertFileSrc(capture.path)}
                      alt="Screen capture"
                      className="h-20 w-auto rounded-lg object-cover"
                      onClick={() => setSelectedCapture(capture)}
                    />
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeCapture(index);
                      }}
                      className="absolute top-1 right-1 rounded-full bg-destructive/90 p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remove capture"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              disabled={controlsDisabled}
              accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.html,.css"
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={controlsDisabled}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach files"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Attach files</p>
              </TooltipContent>
            </Tooltip>

            <ScreenCaptureButton
              {...(conversationId !== undefined && { conversationId })}
              onCaptureComplete={handleCaptureComplete}
              variant="ghost"
              size="icon"
            />

            <div className="relative flex-1">
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={controlsDisabled}
                className={cn(
                  'min-h-[44px] max-h-[240px] resize-none pr-20',
                  isOverLimit && 'border-destructive focus-visible:ring-destructive'
                )}
                rows={1}
              />

              <div
                className={cn(
                  'pointer-events-none absolute right-3 bottom-3 flex items-center gap-1 rounded bg-background/80 px-2 py-0.5 text-xs text-muted-foreground',
                  isOverLimit && 'text-destructive'
                )}
              >
                <span>{charCount}/{maxLength}</span>
                <span>~{tokenEstimate} tok</span>
              </div>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  disabled={!canSend}
                  onClick={handleSend}
                  aria-label="Send message"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Send message (Enter)</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Press Enter to send, Shift+Enter for a new line</span>
            <span>
              {PROVIDER_LABELS[selectedProvider]}
              {selectedModelLabel && ` | ${selectedModelLabel}`}
            </span>
          </div>
        </div>
      </FileDropZone>

      {selectedCapture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="m-4 w-full max-w-2xl">
            <CapturePreview
              capture={selectedCapture}
              onClose={() => setSelectedCapture(null)}
              onDelete={() => {
                const index = captures.findIndex((capture) => capture.id === selectedCapture.id);
                if (index !== -1) {
                  removeCapture(index);
                }
                setSelectedCapture(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
