import { Check, ChevronDown, ChevronUp, Copy, FileCode } from 'lucide-react';
import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  maxCollapsedHeight?: number;
}

/**
 * Claude-style code block component with:
 * - Header with language/filename
 * - Copy button
 * - Collapsible for long code
 * - Syntax highlighting
 */
export function CodeBlock({
  code,
  language = 'text',
  filename,
  className,
  collapsible = true,
  defaultCollapsed = true,
  maxCollapsedHeight = 200,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const lineCount = code.split('\n').length;
  const shouldCollapse = collapsible && lineCount > 10;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const languageIcon = getLanguageIcon(language);

  return (
    <div className={cn('code-block-wrapper', className)}>
      {/* Header */}
      <div className="code-block-header">
        <div className="code-block-header-left">
          {languageIcon}
          {filename ? (
            <span className="code-block-filename">{filename}</span>
          ) : (
            <span className="code-block-language">{language}</span>
          )}
        </div>
        <div className="code-block-actions">
          {shouldCollapse && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="code-block-action-btn"
              aria-label={isCollapsed ? 'Expand code' : 'Collapse code'}
            >
              {isCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="code-block-action-btn"
            aria-label="Copy code"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Code Content */}
      <div
        className={cn(
          'code-block-content relative',
          shouldCollapse && isCollapsed && 'code-block-collapsed',
        )}
        style={shouldCollapse && isCollapsed ? { maxHeight: maxCollapsedHeight } : undefined}
      >
        {/* @ts-expect-error - SyntaxHighlighter type incompatibility with React 18 */}
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
            fontSize: '13px',
            lineHeight: '1.6',
          }}
          showLineNumbers={lineCount > 3}
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1em',
            color: '#4b5563',
            userSelect: 'none',
          }}
        >
          {code}
        </SyntaxHighlighter>

        {/* Expand button for collapsed code */}
        {shouldCollapse && isCollapsed && (
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="code-block-expand-btn"
          >
            Show more ({lineCount} lines)
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Get an icon for the programming language
 */
function getLanguageIcon(_language: string): React.ReactNode {
  const iconClass = 'h-3.5 w-3.5 text-gray-400';

  // Could extend with specific icons per language
  // For now, use a generic code icon
  return <FileCode className={iconClass} />;
}

export default CodeBlock;
