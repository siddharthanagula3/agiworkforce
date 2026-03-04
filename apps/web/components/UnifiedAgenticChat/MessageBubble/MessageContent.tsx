/* eslint-disable @typescript-eslint/no-explicit-any -- store selectors use untyped state access */
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
import { EnhancedMessage } from '@/stores/unified/unifiedChatStore';
import { parseCitations } from '../CitationBadge';
import { SourcesFooter } from '../SourcesFooter';
import { CodeBlock } from '../Visualizations/CodeBlock';
import { useSettingsStore } from '@/stores/unified/settingsStore';

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
  const compactMode = useSettingsStore((state: any) => state.chatPreferences?.compactMode);

  const applyCitations = (children: React.ReactNode) =>
    React.Children.map(children, (child) =>
      typeof child === 'string' ? parseCitations(child) : child,
    );

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
              const isBlockCode = inline !== true;

              // In compact mode, hide ALL code blocks from assistant messages (not user messages)
              if (compactMode && isBlockCode && !isUser) {
                return null; // Hide all code blocks in compact mode for assistant
              }

              return isBlockCode ? (
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
              return <p>{applyCitations(children)}</p>;
            },
            li({ children }) {
              return <li>{applyCitations(children)}</li>;
            },
            img({ src, alt }) {
              const srcStr = typeof src === 'string' ? src : '';
              if (!srcStr || !/^(https?:|data:image\/)/.test(srcStr)) {
                return null;
              }
              const handleDownload = () => {
                const link = document.createElement('a');
                link.href = srcStr;
                link.download = alt || `image_${Date.now()}.png`;
                link.click();
              };
              return (
                <span className="group relative inline-block my-2 rounded-xl overflow-hidden shadow-lg border border-zinc-700/50 bg-zinc-900/50">
                  <img
                    src={srcStr}
                    alt={alt || 'Generated image'}
                    loading="lazy"
                    className="max-w-full h-auto block rounded-xl"
                    style={{ maxHeight: '480px' }}
                  />
                  <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="inline-flex items-center gap-1 rounded-md bg-black/70 backdrop-blur-sm px-2 py-1 text-xs text-white hover:bg-black/90 transition-colors"
                      title="Download image"
                    >
                      ↓ Download
                    </button>
                  </span>
                  {alt && (
                    <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                      {alt}
                    </span>
                  )}
                </span>
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
