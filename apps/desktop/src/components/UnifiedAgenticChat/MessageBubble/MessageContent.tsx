/**
 * MessageContent Component
 *
 * Renders the main message content with markdown, code blocks,
 * math equations, and citation parsing.
 */

import 'katex/dist/katex.min.css';
import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { EnhancedMessage } from '../../../stores/unifiedChatStore';
import { parseCitations } from '../CitationBadge';
import { SourcesFooter } from '../SourcesFooter';
import { CodeBlock } from '../Visualizations/CodeBlock';
import { useSettingsStore } from '../../../stores/settingsStore';

export interface MessageContentProps {
  message: EnhancedMessage;
  isUser: boolean;
  isStreaming?: boolean;
}

const MessageContentComponent: React.FC<MessageContentProps> = ({
  message,
  isUser,
  isStreaming = false,
}) => {
  const compactMode = useSettingsStore((state) => state.chatPreferences.compactMode);

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none transition-opacity ${
        message.pending ? 'opacity-60' : 'opacity-100'
      } ${message.error ? 'text-red-500' : ''}`}
    >
      <div className="prose prose-sm dark:prose-invert max-w-none">
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

              // In compact mode, hide ALL code blocks from assistant messages (not user messages)
              if (compactMode && !inline && !isUser) {
                return null; // Hide all code blocks in compact mode for assistant
              }

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
            table({ children }) {
              return (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                    {children}
                  </table>
                </div>
              );
            },
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                >
                  {children}
                </a>
              );
            },
            p({ children }) {
              if (typeof children === 'string') {
                return <p>{parseCitations(children)}</p>;
              }
              return <p>{children}</p>;
            },
            li({ children }) {
              if (typeof children === 'string') {
                return <li>{parseCitations(children)}</li>;
              }
              return <li>{children}</li>;
            },
            img({ src, alt }) {
              if (src && !/^(https?:|data:image\/)/.test(src)) {
                return null;
              }
              return (
                <img
                  src={src}
                  alt={alt || ''}
                  loading="lazy"
                  className="max-w-full h-auto rounded-lg"
                />
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>

        {/* Streaming cursor */}
        {isStreaming && (
          <span
            className="inline-block w-2 h-4 ml-0.5 bg-amber-400 animate-pulse rounded-xs"
            style={{ animationDuration: '0.5s' }}
          />
        )}

        {/* Sources footer for assistant messages with citations */}
        {!isUser && !isStreaming && <SourcesFooter content={message.content} />}
      </div>
    </div>
  );
};

MessageContentComponent.displayName = 'MessageContent';

export const MessageContent = memo(MessageContentComponent);
