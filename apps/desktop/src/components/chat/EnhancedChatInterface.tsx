import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Bot,
  Copy,
  Check,
  MoreVertical,
  RefreshCcw,
  Loader2,
  Pencil,
  Trash2,
  Send,
  Paperclip,
  Mic,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Image as ImageIcon,
  FileText,
  Code,
  Terminal,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';
import 'katex/dist/katex.min.css';

import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Progress } from '../ui/Progress';
import { Badge } from '../ui/Badge';
import { Separator } from '../ui/Separator';
import { ScrollArea } from '../ui/ScrollArea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { Card } from '../ui/Card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../ui/DropdownMenu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/Collapsible';

import {
  useChatStore,
  selectMessages,
  selectLoading,
  selectIsStreaming,
} from '../../stores/chatStore';
import type { MessageUI } from '../../types/chat';

// ============================================================================
// Types
// ============================================================================

interface ProcessingStep {
  id: string;
  type: 'prompt_enhancement' | 'routing' | 'tool_call' | 'reasoning' | 'generation';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  title: string;
  description?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
  startTime?: number;
  endTime?: number;
}

interface ToolExecution {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  duration?: number;
}

interface EnhancedMessage extends MessageUI {
  processingSteps?: ProcessingStep[];
  toolExecutions?: ToolExecution[];
  reasoning?: string;
  provider?: string;
  model?: string;
}

// ============================================================================
// Code Block Component with Copy Button
// ============================================================================

function CodeBlock({ inline, className, children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const rawCode = String(children ?? '').replace(/\n$/, '');
  const match = /language-(\w+)/.exec(className || '');
  const language = match?.[1] ?? 'plaintext';

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  if (inline) {
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground" {...props}>
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-4">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {language}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 bg-background/90 backdrop-blur-sm text-xs opacity-0 transition-opacity group-hover/code:opacity-100"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        style={(isDark ? oneDark : oneLight) as SyntaxHighlighterProps['style']}
        language={language}
        PreTag="div"
        wrapLongLines
        showLineNumbers
        customStyle={{
          margin: 0,
          borderRadius: '0.75rem',
          paddingTop: '3rem',
          fontSize: '0.875rem',
        }}
      >
        {rawCode}
      </SyntaxHighlighter>
    </div>
  );
}

// ============================================================================
// Processing Visualization Component
// ============================================================================

interface ProcessingVisualizationProps {
  steps: ProcessingStep[];
  isOpen: boolean;
  onToggle: () => void;
}

function ProcessingVisualization({ steps, isOpen, onToggle }: ProcessingVisualizationProps) {
  const getStepIcon = (type: ProcessingStep['type']) => {
    switch (type) {
      case 'prompt_enhancement':
        return <Sparkles className="h-4 w-4" />;
      case 'routing':
        return <Zap className="h-4 w-4" />;
      case 'tool_call':
        return <Terminal className="h-4 w-4" />;
      case 'reasoning':
        return <Bot className="h-4 w-4" />;
      case 'generation':
        return <Code className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'in_progress':
        return 'text-blue-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const activeSteps = steps.filter((s) => s.status !== 'pending');
  const hasActiveSteps = activeSteps.length > 0;

  if (!hasActiveSteps) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mb-3"
    >
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-medium hover:bg-accent/50 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>AI Processing ({activeSteps.length} steps)</span>
            </div>
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 p-3 pt-0">
              {activeSteps.map((step, index) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="space-y-2"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5', getStatusColor(step.status))}>
                      {step.status === 'in_progress' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : step.status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : step.status === 'error' ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        getStepIcon(step.type)
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{step.title}</span>
                        {step.endTime && step.startTime && (
                          <span className="text-xs text-muted-foreground">
                            {((step.endTime - step.startTime) / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                      {step.description && (
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      )}
                      {step.progress !== undefined && step.status === 'in_progress' && (
                        <Progress value={step.progress} className="h-1.5" />
                      )}
                      {step.metadata && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Object.entries(step.metadata).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key}: {String(value)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </motion.div>
  );
}

// ============================================================================
// Tool Execution Display
// ============================================================================

interface ToolExecutionDisplayProps {
  executions: ToolExecution[];
}

function ToolExecutionDisplay({ executions }: ToolExecutionDisplayProps) {
  if (executions.length === 0) return null;

  return (
    <div className="space-y-2 mt-3">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
        <Terminal className="h-3.5 w-3.5" />
        <span>Tool Executions ({executions.length})</span>
      </div>
      <div className="space-y-2">
        {executions.map((execution) => (
          <motion.div
            key={execution.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border bg-card p-3 text-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    execution.status === 'completed'
                      ? 'default'
                      : execution.status === 'error'
                        ? 'destructive'
                        : 'secondary'
                  }
                  className="text-xs"
                >
                  {execution.name}
                </Badge>
                {execution.status === 'running' && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
              {execution.duration && (
                <span className="text-xs text-muted-foreground">{execution.duration}ms</span>
              )}
            </div>
            {execution.input && (
              <div className="text-xs mb-2">
                <span className="text-muted-foreground">Input: </span>
                <code className="bg-muted px-1 rounded">
                  {JSON.stringify(execution.input, null, 2)}
                </code>
              </div>
            )}
            {execution.output && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Output:</span>
                <pre className="mt-1 bg-muted p-2 rounded overflow-auto text-xs">
                  {execution.output}
                </pre>
              </div>
            )}
            {execution.error && (
              <div className="text-xs text-destructive mt-2">Error: {execution.error}</div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Enhanced Message Bubble Component
// ============================================================================

interface MessageBubbleProps {
  message: EnhancedMessage;
  onRegenerate?: (message: EnhancedMessage) => void;
  onEdit?: (message: EnhancedMessage, content: string) => void;
  onDelete?: (message: EnhancedMessage) => void;
}

function MessageBubble({ message, onRegenerate, onEdit, onDelete }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [showProcessing, setShowProcessing] = useState(true);
  const [showReasoning, setShowReasoning] = useState(false);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isStreaming = Boolean(message.streaming);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (onEdit && editValue.trim()) {
      onEdit(message, editValue.trim());
      setIsEditing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative flex gap-4 px-4 py-5',
        isUser ? 'bg-muted/30' : 'bg-background',
        'hover:bg-accent/30 transition-colors',
      )}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            isUser
              ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20'
              : 'bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground shadow-lg shadow-secondary/20',
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </motion.div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{isUser ? 'You' : 'Assistant'}</span>
            <span className="text-xs text-muted-foreground">
              {message.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {message.provider && message.model && (
              <Badge variant="outline" className="text-xs">
                {message.provider}/{message.model}
              </Badge>
            )}
            {isStreaming && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Generating...</span>
              </div>
            )}
          </div>
          {message.tokens && (
            <span className="text-xs text-muted-foreground">{message.tokens} tokens</span>
          )}
        </div>

        {/* Processing Visualization (for assistant messages) */}
        {isAssistant && message.processingSteps && (
          <ProcessingVisualization
            steps={message.processingSteps}
            isOpen={showProcessing}
            onToggle={() => setShowProcessing(!showProcessing)}
          />
        )}

        {/* Message Content */}
        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={Math.min(editValue.split('\n').length + 2, 15)}
              className="resize-none"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSaveEdit}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code: CodeBlock,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Reasoning Section (collapsible) */}
        {isAssistant && message.reasoning && (
          <Collapsible open={showReasoning} onOpenChange={setShowReasoning}>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Sparkles className="h-3.5 w-3.5" />
              <span>View Reasoning</span>
              {showReasoning ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  AI Reasoning Process
                </div>
                <p className="text-xs text-muted-foreground">{message.reasoning}</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Tool Executions */}
        {isAssistant && message.toolExecutions && (
          <ToolExecutionDisplay executions={message.toolExecutions} />
        )}

        {/* Cost Display */}
        {message.cost && (
          <div className="text-xs text-muted-foreground">Cost: ${message.cost.toFixed(4)}</div>
        )}
      </div>

      {/* Actions Menu */}
      {!isEditing && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="ml-2">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span className="ml-2">Copy</span>
                  </>
                )}
              </DropdownMenuItem>
              {isAssistant && onRegenerate && (
                <DropdownMenuItem onClick={() => onRegenerate(message)}>
                  <RefreshCcw className="h-4 w-4" />
                  <span className="ml-2">Regenerate</span>
                </DropdownMenuItem>
              )}
              {isUser && onEdit && (
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  <span className="ml-2">Edit</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(message)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="ml-2">Delete</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// Enhanced Input Area Component
// ============================================================================

interface EnhancedInputProps {
  onSend: (content: string, attachments?: File[]) => void;
  disabled?: boolean;
  isSending?: boolean;
}

function EnhancedInput({ onSend, disabled, isSending }: EnhancedInputProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const charCount = content.length;
  const tokenEstimate = Math.ceil(charCount / 4);
  const canSend = content.trim().length > 0 && !disabled && !isSending;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
    }
  }, [content]);

  const handleSend = () => {
    if (canSend) {
      onSend(content, attachments);
      setContent('');
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className={cn(
        'border-t border-border bg-background/80 backdrop-blur-sm',
        isDragging && 'bg-primary/5 border-primary',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        setAttachments((prev) => [...prev, ...files]);
      }}
    >
      <div className="p-4 space-y-3">
        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2"
              >
                {file.type.startsWith('image/') ? (
                  <ImageIcon className="h-4 w-4 text-primary" />
                ) : (
                  <FileText className="h-4 w-4 text-primary" />
                )}
                <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="flex items-end gap-2">
          {/* File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Attach Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="flex-shrink-0"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach files</TooltipContent>
          </Tooltip>

          {/* Voice Input Button (UI only) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={disabled} className="flex-shrink-0">
                <Mic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Voice input (coming soon)</TooltipContent>
          </Tooltip>

          {/* Text Input */}
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              disabled={disabled}
              className="min-h-[52px] max-h-[240px] resize-none pr-24"
              rows={1}
            />
            {/* Character/Token Counter */}
            <div className="absolute right-3 bottom-3 flex items-center gap-2 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded">
              <span>{charCount} chars</span>
              <Separator orientation="vertical" className="h-3" />
              <span>~{tokenEstimate} tokens</span>
            </div>
          </div>

          {/* Send Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!canSend}
                className={cn(
                  'flex-shrink-0 transition-all',
                  canSend &&
                    'bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/20',
                )}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message (Enter)</TooltipContent>
          </Tooltip>
        </div>

        {/* Helper Text */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Shift+Enter for new line</span>
          <span>Drag & drop files to attach</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Enhanced Chat Interface Component
// ============================================================================

interface EnhancedChatInterfaceProps {
  className?: string;
}

export function EnhancedChatInterface({ className }: EnhancedChatInterfaceProps) {
  const messages = useChatStore(selectMessages);
  const loading = useChatStore(selectLoading);
  const isStreaming = useChatStore(selectIsStreaming);
  const { sendMessage, editMessage, deleteMessage } = useChatStore();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Enhanced messages with processing info (mock data for now)
  const enhancedMessages = useMemo<EnhancedMessage[]>(() => {
    return messages.map((msg) => ({
      ...msg,
      // Add mock processing steps for demo
      processingSteps:
        msg.role === 'assistant' && msg.streaming
          ? [
              {
                id: '1',
                type: 'prompt_enhancement' as const,
                status: 'completed' as const,
                title: 'Prompt Enhancement',
                description: 'Analyzing and enhancing user prompt',
                startTime: Date.now() - 2000,
                endTime: Date.now() - 1800,
              },
              {
                id: '2',
                type: 'routing' as const,
                status: 'completed' as const,
                title: 'API Routing',
                description: 'Selected optimal model: GPT-4',
                metadata: { provider: 'OpenAI', model: 'gpt-4-turbo' },
                startTime: Date.now() - 1800,
                endTime: Date.now() - 1600,
              },
              {
                id: '3',
                type: 'generation' as const,
                status: 'in_progress' as const,
                title: 'Generating Response',
                description: 'Streaming response from model',
                progress: 65,
                startTime: Date.now() - 1600,
              },
            ]
          : undefined,
    }));
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]',
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [enhancedMessages, autoScroll]);

  const handleSend = useCallback(
    (content: string, attachments?: File[]) => {
      sendMessage(content, attachments);
    },
    [sendMessage],
  );

  const handleRegenerate = useCallback(
    (message: EnhancedMessage) => {
      // Find the previous user message
      const messageIndex = messages.findIndex((m) => m.id === message.id);
      if (messageIndex > 0) {
        const prevUserMsg = messages
          .slice(0, messageIndex)
          .reverse()
          .find((m) => m.role === 'user');
        if (prevUserMsg) {
          sendMessage(prevUserMsg.content);
        }
      }
    },
    [messages, sendMessage],
  );

  const handleEdit = useCallback(
    (message: EnhancedMessage, content: string) => {
      editMessage(message.id, content);
    },
    [editMessage],
  );

  const handleDelete = useCallback(
    (message: EnhancedMessage) => {
      if (window.confirm('Delete this message?')) {
        deleteMessage(message.id);
      }
    },
    [deleteMessage],
  );

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Messages Area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="min-h-full">
          {enhancedMessages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-full items-center justify-center p-8"
            >
              <div className="text-center space-y-4 max-w-md">
                <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                  <Sparkles className="h-8 w-8 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold">Start a Conversation</h3>
                <p className="text-sm text-muted-foreground">
                  Ask me anything! I can help with code, answer questions, or assist with tasks.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Badge variant="secondary">Code generation</Badge>
                  <Badge variant="secondary">Problem solving</Badge>
                  <Badge variant="secondary">Task automation</Badge>
                </div>
              </div>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {enhancedMessages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onRegenerate={handleRegenerate}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          )}

          {/* Typing Indicator */}
          {loading && !isStreaming && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex gap-4 px-4 py-5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-secondary to-secondary/80">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                    className="h-2 w-2 rounded-full bg-muted-foreground"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                    className="h-2 w-2 rounded-full bg-muted-foreground"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                    className="h-2 w-2 rounded-full bg-muted-foreground"
                  />
                </div>
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Auto-scroll Toggle */}
      {enhancedMessages.length > 0 && (
        <div className="px-4 py-2 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            className="text-xs"
          >
            {autoScroll ? (
              <Pause className="h-3 w-3 mr-1.5" />
            ) : (
              <Play className="h-3 w-3 mr-1.5" />
            )}
            {autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
          </Button>
        </div>
      )}

      {/* Input Area */}
      <EnhancedInput onSend={handleSend} disabled={loading} isSending={loading} />
    </div>
  );
}
