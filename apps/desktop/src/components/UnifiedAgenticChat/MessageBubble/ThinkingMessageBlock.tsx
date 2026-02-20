/**
 * ThinkingMessageBlock Component
 *
 * Renders a message with thinking/reasoning content, including
 * the reasoning accordion and remaining content.
 */

import 'katex/dist/katex.min.css';
import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Bookmark, BookmarkCheck, Check, Copy } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { EnhancedMessage } from '../../../stores/unifiedChatStore';
import { ReasoningAccordion } from '../ReasoningAccordion';
import { SourcesFooter } from '../SourcesFooter';
import { StatusTrail } from '../StatusTrail';
import { CodeBlock } from '../Visualizations/CodeBlock';
import { MessageAttachments } from './MessageAttachments';
import { ThinkingMatch, ThinkingMessageMetadata, LightboxImage } from './types';

export interface ThinkingMessageBlockProps {
  message: EnhancedMessage;
  thinkingMatch: ThinkingMatch;
  showAvatar: boolean;
  showActions: boolean;
  enableActions: boolean;
  copied: boolean;
  onCopy: () => void;
  onBookmark: () => void;
  onImageClick: (image: LightboxImage) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const ThinkingMessageBlockComponent: React.FC<ThinkingMessageBlockProps> = ({
  message,
  thinkingMatch,
  showAvatar,
  showActions,
  enableActions,
  copied,
  onCopy,
  onBookmark,
  onImageClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const thinkingMeta = message.metadata as ThinkingMessageMetadata | undefined;
  const summary = thinkingMeta?.thinkingSummary || thinkingMeta?.summary;
  const duration = thinkingMeta?.duration;
  const steps = thinkingMeta?.steps;

  const thinkingBlock = thinkingMatch.content;

  // Remove all thinking-related tags from the remaining content
  const remainingContent = message.content
    .replace(/<thinking>[\s\S]*?(?:<\/thinking>|$)/gi, '')
    .replace(/<antthinking>[\s\S]*?(?:<\/antthinking>|$)/gi, '')
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/\[THINKING\][\s\S]*?(?:\[\/THINKING\]|$)/gi, '')
    .replace(/<reasoning>[\s\S]*?(?:<\/reasoning>|$)/gi, '')
    .replace(/<cot>[\s\S]*?(?:<\/cot>|$)/gi, '')
    .trim();

  return (
    <div
      className="group flex gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {showAvatar && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white text-sm font-medium">
          AI
        </div>
      )}
      <div className="min-w-0 relative max-w-full flex-1">
        {/* Status Trail - Using inline variant to prevent overlap */}
        <StatusTrail messageId={message.id} variant="inline" />

        {/* Reasoning Accordion */}
        <ReasoningAccordion
          content={thinkingBlock}
          summary={summary}
          metadata={{ duration, steps, thinkingPattern: thinkingMatch.pattern }}
          isStreaming={Boolean(message.metadata?.streaming)}
        />

        {/* Remaining content after thinking block */}
        {remainingContent && (
          <div className="prose prose-sm dark:prose-invert max-w-none mt-4">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code(props) {
                  const { inline, className, children, ...rest } =
                    props as React.HTMLAttributes<HTMLElement> & { inline?: boolean };
                  const match = /language-(\w+)/.exec(className || '');
                  const language = match ? match[1] : 'text';
                  const code = String(children).replace(/\n$/, '');

                  return !inline ? (
                    <CodeBlock
                      code={code}
                      language={language || 'text'}
                      showLineNumbers={true}
                      enableCopy={true}
                    />
                  ) : (
                    <code
                      className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-sm font-mono"
                      {...rest}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {remainingContent}
            </ReactMarkdown>

            {/* Sources footer for messages with citations */}
            {!message.metadata?.streaming && <SourcesFooter content={remainingContent} />}
          </div>
        )}

        {/* Attachments */}
        {Array.isArray(message.attachments) && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} onImageClick={onImageClick} />
        )}

        {/* Action buttons - visible on hover or focus-within for keyboard accessibility */}
        {enableActions && (
          <div
            className={cn(
              'flex items-center gap-1 mt-2 transition-opacity focus-within:opacity-100',
              showActions ? 'opacity-100' : 'opacity-0 focus-within:opacity-100',
            )}
            role="group"
            aria-label="Message actions"
          >
            <button
              onClick={onCopy}
              className="p-1 text-zinc-500 hover:text-zinc-300"
              title="Copy message"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
            <button
              onClick={onBookmark}
              className="p-1 text-zinc-500 hover:text-zinc-300"
              title={message.bookmarked ? 'Remove bookmark' : 'Bookmark message'}
            >
              {message.bookmarked ? (
                <BookmarkCheck size={13} className="text-amber-400" />
              ) : (
                <Bookmark size={13} />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

ThinkingMessageBlockComponent.displayName = 'ThinkingMessageBlock';

export const ThinkingMessageBlock = memo(ThinkingMessageBlockComponent);
