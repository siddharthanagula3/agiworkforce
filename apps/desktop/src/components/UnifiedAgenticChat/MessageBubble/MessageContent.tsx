/**
 * MessageContent Component
 *
 * Renders the main message content with markdown, code blocks,
 * math equations, and citation parsing.
 */

import 'katex/dist/katex.min.css';
import React, { memo, useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Code2 } from 'lucide-react';
import { toast } from 'sonner';
import { EnhancedMessage } from '../../../stores/unifiedChatStore';
import { parseCitations } from '../CitationBadge';
import { SourcesFooter } from '../SourcesFooter';
import { CodeBlock } from '../Visualizations/CodeBlock';
import { InlineCodeOutput, CodeExecutionResult } from '../InlineCodeOutput';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useCanvasStore } from '../../../stores/canvasStore';
import { invoke } from '../../../lib/tauri-mock';

const EXECUTABLE_LANGUAGES = new Set([
  'python',
  'javascript',
  'typescript',
  'bash',
  'sh',
  'ruby',
  'perl',
  'r',
]);

/**
 * Strip raw tool-result JSON code blocks from assistant message content.
 * The InlineSearchResults / InlineToolResults components already render these
 * nicely — showing them again as raw code blocks is redundant and confusing.
 *
 * Targets blocks that contain:
 *  - JSON with a "results" array (search_web output)
 *  - JSON with a "query" key (search_web output)
 *  - JSON with a "success" key and a "url" key (browser_navigate output)
 */
function stripToolResultJsonBlocks(content: string): string {
  // Remove fenced code blocks (```...```) containing raw tool JSON
  return content.replace(/```(?:json|JSON)?\s*\n?\{[\s\S]*?\}\s*```/g, (block) => {
    try {
      // Extract JSON body
      const jsonBody = block.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonBody);
      // Only strip if it looks like a tool result payload
      if (
        ('results' in parsed && Array.isArray(parsed.results)) ||
        ('query' in parsed && 'results' in parsed) ||
        ('success' in parsed && 'url' in parsed) ||
        ('query' in parsed && 'provider' in parsed)
      ) {
        return ''; // Remove the block
      }
    } catch {
      // Not valid JSON — leave it alone
    }
    return block;
  });
}

// Determine the CanvasArtifact type from a code language string
function inferArtifactType(lang: string): 'code' | 'html' | 'markdown' {
  const l = lang.toLowerCase();
  if (l === 'html') return 'html';
  if (l === 'markdown' || l === 'md') return 'markdown';
  return 'code';
}

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
  const { createArtifact, openPanel } = useCanvasStore();

  // Map from code-block index → execution result
  const [codeResults, setCodeResults] = useState<Map<string, CodeExecutionResult>>(new Map());
  // Map from code-block key → running state
  const [runningBlocks, setRunningBlocks] = useState<Set<string>>(new Set());
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleRunCode = useCallback(async (language: string, code: string, blockKey: string) => {
    setRunningBlocks((prev) => new Set(prev).add(blockKey));
    // Clear any previous result so the panel shows immediately in loading state
    setCodeResults((prev) => {
      const next = new Map(prev);
      next.delete(blockKey);
      return next;
    });
    try {
      const result = await invoke<CodeExecutionResult>('execute_code', { language, code });
      if (!isMountedRef.current) return;
      setCodeResults((prev) => new Map(prev).set(blockKey, result));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Code execution failed: ${errMsg}`);
      setCodeResults((prev) =>
        new Map(prev).set(blockKey, {
          success: false,
          stdout: '',
          stderr: errMsg,
          output: '',
          error: errMsg,
          exit_code: 1,
          execution_time_ms: 0,
          language,
          timed_out: false,
        }),
      );
    } finally {
      setRunningBlocks((prev) => {
        const next = new Set(prev);
        next.delete(blockKey);
        return next;
      });
    }
  }, []);

  const applyCitations = (children: React.ReactNode) =>
    React.Children.map(children, (child) =>
      typeof child === 'string' ? parseCitations(child) : child,
    );

  const handleOpenInCanvas = useCallback(
    (code: string, language: string) => {
      const artifactType = inferArtifactType(language);
      const id = createArtifact(artifactType, code, language, undefined, message.id);
      openPanel(id);
      toast.success('Opened in Canvas');
    },
    [createArtifact, openPanel, message.id],
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
          // Strip raw tool-result JSON blocks before rendering — they are already
          // displayed by the InlineToolResults renderers (e.g. InlineSearchResults).
          children={isUser ? message.content : stripToolResultJsonBlocks(message.content)}
          components={{
            code(props) {
              const { inline, className, children, ...rest } =
                props as React.HTMLAttributes<HTMLElement> & {
                  inline?: boolean;
                };
              const match = /language-(\w+)/.exec(className || '');
              const language: string = match?.[1] ?? 'text';
              const code = String(children).replace(/\n$/, '');
              const isBlockCode = inline !== true;
              // Use a stable key from code content + language as block index substitute
              const blockKey = `${language}:${code.length}:${code.slice(0, 40)}`;

              // In compact mode, hide ALL code blocks from assistant messages (not user messages)
              if (compactMode && isBlockCode && !isUser) {
                return null; // Hide all code blocks in compact mode for assistant
              }

              if (!isBlockCode) {
                return (
                  <code
                    className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-sm font-mono"
                    {...rest}
                  >
                    {children}
                  </code>
                );
              }

              const canRun = !isUser && EXECUTABLE_LANGUAGES.has(language.toLowerCase());
              const executionResult = codeResults.get(blockKey);
              const isRunning = runningBlocks.has(blockKey);

              return (
                <>
                  <div className="relative group/codeblock">
                    <CodeBlock
                      code={code}
                      language={language || 'text'}
                      showLineNumbers={true}
                      enableCopy={true}
                      enableRun={canRun}
                      onRun={canRun ? () => handleRunCode(language, code, blockKey) : undefined}
                    />
                    {/* Open in Canvas button — shown on hover for assistant messages */}
                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => handleOpenInCanvas(code, language || 'text')}
                        className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-teal-500/20 text-teal-400 border border-teal-500/30 opacity-0 group-hover/codeblock:opacity-100 transition-opacity hover:bg-teal-500/30"
                      >
                        <Code2 className="h-3 w-3" />
                        Open in Canvas
                      </button>
                    )}
                  </div>
                  {(isRunning || executionResult) && (
                    <InlineCodeOutput
                      result={
                        executionResult ?? {
                          success: false,
                          stdout: '',
                          stderr: '',
                          output: '',
                          error: null,
                          exit_code: 0,
                          execution_time_ms: 0,
                          language,
                          timed_out: false,
                        }
                      }
                      isRunning={isRunning}
                      onRerun={canRun ? () => handleRunCode(language, code, blockKey) : undefined}
                    />
                  )}
                </>
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
              if (!src || !/^(https?:|data:image\/)/.test(src)) {
                return null;
              }
              const handleDownload = () => {
                const link = document.createElement('a');
                link.href = src;
                link.download = alt || `image_${Date.now()}.png`;
                link.click();
              };
              return (
                <span className="group relative inline-block my-2 rounded-xl overflow-hidden shadow-lg border border-zinc-700/50 bg-zinc-900/50">
                  <img
                    src={src}
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
        />

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
