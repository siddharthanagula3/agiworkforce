/**
 * MessageBubble - Clean, minimal message display
 *
 * Redesigned with:
 * - Progressive disclosure (details on hover/click)
 * - Minimal metadata inline
 * - Clean visual hierarchy
 * - Token usage hidden by default
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, type Variants } from 'framer-motion';
import NextImage from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/ui/collapsible';
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Brain,
  Download,
  MoreHorizontal,
  Pin,
  Pencil,
  RefreshCw,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  GitFork,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import { cn } from '@shared/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';
import { toast } from 'sonner';
import { ArtifactPreview } from '../artifacts/ArtifactPreview';
import { InlineArtifactCards } from '../artifacts/InlineArtifactCards';
import { extractArtifacts, removeArtifactBlocks } from '../../utils/artifact-detector';
import { useArtifactStore } from '@shared/stores/artifact-store';
import { SearchResults } from '../search/SearchResults';
import type { SearchResponse } from '@core/integrations/web-search-handler';
import type { MediaGenerationResult } from '@core/integrations/media-generation-handler';
import type { GeneratedDocument } from '../../services/document-generation-service';
import { ThinkingBlock } from '../ThinkingBlock';
import { ArtifactBlock } from '../ArtifactBlock';
import { CitationFooter } from './InlineCitation';

/**
 * Framer-motion variants for message bubble entrance animations.
 * Exported so parent list components can apply staggered entry.
 *
 * Usage in a list:
 *   <motion.div variants={messageListVariants} initial="hidden" animate="visible">
 *     {messages.map((m, i) => (
 *       <MessageBubble key={m.id} message={m} animationIndex={i} />
 *     ))}
 *   </motion.div>
 */
export const messageListVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

export const messageBubbleVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: 'easeOut' },
  },
};

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  employeeId?: string;
  employeeName?: string;
  employeeAvatar?: string;
  employeeColor?: string;
  isStreaming?: boolean;
  reactions?: Array<{ type: string; userId: string }>;
  attachments?: Attachment[];
  metadata?: {
    isDocument?: boolean;
    documentTitle?: string;
    hasWorkStream?: boolean;
    workStreamData?: Record<string, unknown>;
    isPinned?: boolean;
    tokensUsed?: number;
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    cost?: number;
    selectionReason?: string;
    thinkingSteps?: string[];
    /** Raw extended thinking text (used by ThinkingBlock) */
    thinkingContent?: string;
    /** True while the thinking content is still streaming */
    isThinkingStreaming?: boolean;
    /** ISO timestamp when thinking started */
    thinkingStartedAt?: string;
    /** ISO timestamp when thinking completed */
    thinkingCompletedAt?: string;
    /** Duration of thinking phase in seconds */
    thinkingDurationSeconds?: number;
    isThinking?: boolean;
    isStreaming?: boolean;
    isCollaboration?: boolean;
    collaborationType?: 'contribution' | 'discussion' | 'synthesis';
    collaborationTo?: string;
    isMultiAgent?: boolean;
    employeesInvolved?: string[];
    isSynthesis?: boolean;
    searchResults?: SearchResponse;
    isSearching?: boolean;
    toolResult?: boolean;
    toolType?: string;
    imageUrl?: string;
    imageData?: MediaGenerationResult;
    videoUrl?: string;
    thumbnailUrl?: string;
    videoData?: MediaGenerationResult;
    documentData?: GeneratedDocument;
    collaborationMessages?: Array<{
      employeeName: string;
      employeeAvatar: string;
      content: string;
      messageType?: string;
    }>;
    /** Web search citations from server-managed tools (e.g., Anthropic web_search) */
    citations?: Array<{
      type?: string;
      cited_text?: string;
      title?: string;
      url?: string;
    }>;
  };
}

interface MessageBubbleProps {
  message: Message;
  onEdit?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onReact?: (messageId: string, reactionType: 'up' | 'down' | 'helpful') => void;
  onBranch?: (messageId: string) => void;
  hasBranches?: boolean;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  enableActions?: boolean;
  /**
   * When provided and the parent renders a motion container with
   * `messageListVariants`, this prop is unused (stagger is driven by the
   * parent). When the bubble renders standalone (no motion parent), the
   * index drives a custom delay so rapid-mount sequences look staggered.
   */
  animationIndex?: number;
}

/** Format a message timestamp as a relative or absolute time string. */
function formatMessageTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Code block with copy button
const CodeBlock = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!match) {
    // Inline code — matches desktop .message-text code:not(pre code)
    return (
      <code className="rounded-md bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[13px] font-mono text-gray-800 dark:text-gray-200">
        {children}
      </code>
    );
  }

  // Fenced code block — matches desktop .code-block-wrapper + .code-block-header + .code-block-content
  return (
    <div className="code-block-container group relative my-4">
      {/* Header bar — gray-800 bg, language label + copy action */}
      <div className="code-block-header-bar">
        <span className="code-block-lang-label">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 gap-1.5 px-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={copied ? 'Code copied' : 'Copy code'}
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {/* Body — gray-900 bg, 13 px mono font (desktop .code-block-content) */}
      <div className="code-block-body">
        <pre>
          <code className={className}>{children}</code>
        </pre>
      </div>
    </div>
  );
};

const markdownComponents: Components = {
  code: CodeBlock as Components['code'],
  h1: ({ children }) => <h1 className="mb-4 mt-6 text-xl font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-5 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal pl-6">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

const MessageBubbleComponent = function MessageBubble({
  message,
  onEdit,
  onRegenerate,
  onDelete,
  onPin,
  onReact,
  onBranch,
  hasBranches,
  animationIndex = 0,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [showContributions, setShowContributions] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const isUser = message.role === 'user';

  const { addArtifact, getMessageArtifacts } = useArtifactStore();

  // Artifact handling
  const existingArtifacts = getMessageArtifacts(message.id);
  const extractedArtifacts = useMemo(() => {
    if (isUser) return [];
    return extractArtifacts(message.content);
  }, [message.content, isUser]);

  const artifacts = existingArtifacts.length > 0 ? existingArtifacts : extractedArtifacts;

  useEffect(() => {
    if (isUser || existingArtifacts.length > 0 || extractedArtifacts.length === 0) return;
    extractedArtifacts.forEach((artifact) => addArtifact(message.id, artifact));
  }, [message.id, isUser, existingArtifacts.length, extractedArtifacts, addArtifact]);

  const cleanedContent = useMemo(() => {
    if (artifacts.length === 0) return message.content;
    return removeArtifactBlocks(message.content, artifacts);
  }, [message.content, artifacts]);

  // Avatar info derived from message metadata only (no external service)
  const employeeInitials = message.employeeName
    ? message.employeeName
        .split(/\s+/)
        .map((w) => w.charAt(0))
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'AI';
  const employeeColor = message.employeeColor || '';

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const hasThinkingSteps =
    message.metadata?.thinkingSteps && message.metadata.thinkingSteps.length > 0;
  const hasContributions =
    message.metadata?.isMultiAgent &&
    message.metadata?.collaborationMessages &&
    message.metadata.collaborationMessages.length > 0;

  return (
    <motion.div
      variants={messageBubbleVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay: animationIndex * 0.06 }}
      className={cn(
        /* Row — py-6 px-4 matches desktop .message-row / .message-container */
        'group message-row message-bubble',
        isUser ? 'message-row-user' : 'message-row-assistant',
      )}
    >
      {/* Inner content row — constrained to max-w-3xl */}
      <div className={cn('message-inner', isUser && 'flex-row-reverse')}>
        {/* Avatar — 32 × 32 circle */}
        {!isUser ? (
          <Avatar className="message-avatar mt-0.5">
            <AvatarImage
              src={message.employeeAvatar?.startsWith('/') ? message.employeeAvatar : undefined}
            />
            <AvatarFallback
              className="text-xs font-semibold text-white"
              style={{ backgroundColor: employeeColor }}
            >
              {employeeInitials}
            </AvatarFallback>
          </Avatar>
        ) : (
          /* User: show a gradient avatar on the right — desktop .message-avatar-user */
          <div className="message-avatar message-avatar-user mt-0.5" aria-hidden="true">
            U
          </div>
        )}

        {/* Content */}
        <div className={cn('message-body', isUser ? 'user-bubble' : 'flex-1 min-w-0')}>
          {/* Header: Name + Time */}
          <div className="mb-1 flex items-center gap-2 text-sm">
            <span className="font-medium">
              {isUser
                ? 'You'
                : message.employeeName
                    ?.split('-')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ') || 'AI'}
            </span>
            <span className="message-timestamp">{formatMessageTime(message.timestamp)}</span>
            {message.metadata?.isPinned && (
              <Pin className="h-3 w-3 text-amber-500" aria-hidden="true" />
            )}
            {hasBranches && <GitFork className="h-3 w-3 text-primary" aria-hidden="true" />}
          </div>

          {/* ThinkingBlock — extended reasoning content (shown above the main reply) */}
          {!isUser && message.metadata?.thinkingContent && (
            <div className="mb-3">
              <ThinkingBlock
                content={message.metadata.thinkingContent}
                isStreaming={message.metadata.isThinkingStreaming ?? false}
                startedAt={message.metadata.thinkingStartedAt}
                completedAt={message.metadata.thinkingCompletedAt}
                durationSeconds={message.metadata.thinkingDurationSeconds}
                defaultExpanded={message.metadata.isThinkingStreaming ?? false}
              />
            </div>
          )}

          {/* Message Content — 15 px body matching desktop .message-text */}
          <div
            className={cn(
              'prose dark:prose-invert max-w-none',
              'message-text', // 15 px / 1.6 lh (defined in globals.css .message-text)
              'break-words overflow-wrap-anywhere text-left',
            )}
          >
            {message.isStreaming && !cleanedContent.trim() ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span className="text-sm">Thinking...</span>
              </div>
            ) : (
              <>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
                  rehypePlugins={[rehypeHighlight, rehypeRaw]}
                  components={markdownComponents}
                >
                  {cleanedContent}
                </ReactMarkdown>
                {message.isStreaming && cleanedContent.trim() && (
                  <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-primary" />
                )}
              </>
            )}
          </div>

          {/* ArtifactBlock — rendered code blocks (html/csv/json/mermaid/generic) */}
          {!isUser && cleanedContent.trim() && (
            <div className="mt-1">
              <ArtifactBlock content={cleanedContent} />
            </div>
          )}

          {/* Inline artifact thumbnail cards — quick visual summary, click to open panel */}
          {!isUser && artifacts.length > 0 && <InlineArtifactCards artifacts={artifacts} />}

          {/* Artifacts — full detail view (below inline cards) */}
          {!isUser && artifacts.length > 0 && (
            <div className="mt-4 space-y-3">
              {artifacts.map((artifact) => (
                <ArtifactPreview key={artifact.id} artifact={artifact} />
              ))}
            </div>
          )}

          {/* Image Result with Error Handling */}
          {!isUser &&
            message.metadata?.toolType === 'image-generation' &&
            message.metadata?.imageUrl && (
              <div className="mt-4">
                <div className="overflow-hidden rounded-xl border border-border">
                  {imageError ? (
                    <div className="flex items-center justify-center p-8 bg-muted/50 text-muted-foreground">
                      <span className="text-sm">Image failed to load</span>
                    </div>
                  ) : (
                    <NextImage
                      src={message.metadata.imageUrl as string}
                      alt="Generated image"
                      width={800}
                      height={600}
                      className="max-h-96 w-auto"
                      onError={() => setImageError(true)}
                    />
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <a href={message.metadata.imageUrl} download>
                      <Download className="mr-1.5 h-3 w-3" aria-hidden="true" />
                      Download
                    </a>
                  </Button>
                </div>
              </div>
            )}

          {/* Video Result with Error Handling */}
          {!isUser &&
            message.metadata?.toolType === 'video-generation' &&
            message.metadata?.videoUrl && (
              <div className="mt-4">
                {videoError ? (
                  <div className="flex items-center justify-center p-8 bg-muted/50 text-muted-foreground rounded-xl">
                    <span className="text-sm">Video failed to load</span>
                  </div>
                ) : (
                  <video
                    src={message.metadata.videoUrl}
                    controls
                    className="max-h-96 rounded-xl"
                    poster={message.metadata.thumbnailUrl}
                    onError={() => setVideoError(true)}
                  />
                )}
              </div>
            )}

          {/* Search Results */}
          {!isUser && message.metadata?.searchResults && (
            <div className="mt-4">
              <SearchResults searchResponse={message.metadata.searchResults} showAnswer />
            </div>
          )}

          {/* Citations (from server-managed web search tools) */}
          {!isUser && message.metadata?.citations && message.metadata.citations.length > 0 && (
            <CitationFooter
              citations={message.metadata.citations
                .filter(
                  (c): c is { url: string; title: string; cited_text?: string; type?: string } =>
                    !!(c.url && c.title),
                )
                .map((c, i) => ({
                  index: i + 1,
                  url: c.url,
                  title: c.title,
                  snippet: c.cited_text,
                }))}
            />
          )}

          {/* Thinking Steps (Collapsible) */}
          {hasThinkingSteps && (
            <Collapsible open={showThinking} onOpenChange={setShowThinking} className="mt-3">
              <CollapsibleTrigger asChild>
                <button
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={showThinking}
                  aria-label="Toggle thinking process visibility"
                >
                  {showThinking ? (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  )}
                  <Brain className="h-3 w-3" aria-hidden="true" />
                  Thinking process ({message.metadata?.thinkingSteps?.length} steps)
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                  {message.metadata?.thinkingSteps?.map((step, stepIndex) => (
                    <div
                      key={`thinking-step-${stepIndex}-${step.slice(0, 20)}`}
                      className="flex gap-2 text-xs text-muted-foreground"
                    >
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                        {stepIndex + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Agent Contributions (Collapsible) */}
          {hasContributions && (
            <Collapsible
              open={showContributions}
              onOpenChange={setShowContributions}
              className="mt-3"
            >
              <CollapsibleTrigger asChild>
                <button
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={showContributions}
                  aria-label="Toggle agent contributions visibility"
                >
                  {showContributions ? (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  )}
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  {message.metadata?.collaborationMessages?.length} agents contributed
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {message.metadata?.collaborationMessages?.map((collab, collabIndex) => (
                  <div
                    key={`collab-${collabIndex}-${collab.employeeName}`}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        {collab.employeeAvatar &&
                          (collab.employeeAvatar.startsWith('http') ||
                            collab.employeeAvatar.startsWith('/')) && (
                            <AvatarImage src={collab.employeeAvatar} />
                          )}
                        <AvatarFallback
                          className="text-[10px] font-semibold text-white"
                          style={{
                            backgroundColor:
                              collab.employeeAvatar &&
                              !collab.employeeAvatar.startsWith('http') &&
                              !collab.employeeAvatar.startsWith('/')
                                ? collab.employeeAvatar
                                : '#6366f1',
                          }}
                        >
                          {collab.employeeName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{collab.employeeName}</span>
                      {collab.messageType && (
                        <Badge variant="secondary" className="h-4 text-[10px]">
                          {collab.messageType}
                        </Badge>
                      )}
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{collab.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Actions (show on hover) */}
          {!message.isStreaming && (
            <div
              className={cn(
                'mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
                isUser && 'justify-end',
              )}
            >
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCopy}
                      aria-label={copied ? 'Message copied' : 'Copy message'}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy</TooltipContent>
                </Tooltip>

                {!isUser && onReact && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onReact(message.id, 'up')}
                          aria-label="Rate as good response"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Good response</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onReact(message.id, 'down')}
                          aria-label="Rate as poor response"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Poor response</TooltipContent>
                    </Tooltip>
                  </>
                )}

                {/* More actions menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="More message actions"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={isUser ? 'end' : 'start'}>
                    {onPin && (
                      <DropdownMenuItem onClick={() => onPin(message.id)}>
                        <Pin className="mr-2 h-4 w-4" aria-hidden="true" />
                        {message.metadata?.isPinned ? 'Unpin' : 'Pin'}
                      </DropdownMenuItem>
                    )}
                    {onBranch && (
                      <DropdownMenuItem onClick={() => onBranch(message.id)}>
                        <GitFork className="mr-2 h-4 w-4" aria-hidden="true" />
                        Create branch from here
                      </DropdownMenuItem>
                    )}
                    {isUser && onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(message.id)}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {!isUser && onRegenerate && (
                      <DropdownMenuItem onClick={() => onRegenerate(message.id)}>
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Regenerate
                      </DropdownMenuItem>
                    )}
                    {message.metadata?.tokensUsed && (
                      <>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          {message.metadata.tokensUsed.toLocaleString()} tokens
                          {message.metadata.model && ` · ${message.metadata.model}`}
                        </div>
                      </>
                    )}
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(message.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipProvider>
            </div>
          )}
        </div>
        {/* closes .message-inner */}
      </div>
    </motion.div>
  );
};

/**
 * MessageBubble with memoization to prevent unnecessary re-renders.
 *
 * Custom comparison function checks:
 * - message.id, message.content, message.role, message.timestamp
 * - Callback references (onEdit, onRegenerate, etc.)
 * - metadata hash for deep equality
 *
 * This reduces MessageBubble re-renders from ~40/message to <5.
 */
export const MessageBubble = React.memo(MessageBubbleComponent, (prev, next) => {
  // Return true if props are EQUAL (skip re-render), false if different (re-render)

  // Check message identity
  if (
    prev.message.id !== next.message.id ||
    prev.message.content !== next.message.content ||
    prev.message.role !== next.message.role
  ) {
    return false;
  }

  // Check timestamp (may update for streaming messages)
  if (prev.message.timestamp.getTime() !== next.message.timestamp.getTime()) {
    return false;
  }

  // Check metadata equality (simple hash of stringified metadata)
  const prevMetaStr = JSON.stringify(prev.message.metadata || {});
  const nextMetaStr = JSON.stringify(next.message.metadata || {});
  if (prevMetaStr !== nextMetaStr) {
    return false;
  }

  // Check callback references (they should be memoized by parent)
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.onRegenerate !== next.onRegenerate) return false;
  if (prev.onDelete !== next.onDelete) return false;
  if (prev.onPin !== next.onPin) return false;
  if (prev.onReact !== next.onReact) return false;
  if (prev.onBranch !== next.onBranch) return false;

  // Check flags
  if (prev.hasBranches !== next.hasBranches) return false;
  if (prev.animationIndex !== next.animationIndex) return false;

  // All props are equal, skip re-render
  return true;
});
