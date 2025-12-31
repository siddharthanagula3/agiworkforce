import { Check, ChevronDown, ChevronUp, Copy, FileCode, Minus, Plus } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  maxCollapsedHeight?: number;
  showDiff?: boolean;
}

// Detect if code is in unified diff format
function detectDiffFormat(code: string): boolean {
  const lines = code.split('\n');
  let diffLineCount = 0;
  let totalLines = 0;

  for (const line of lines) {
    if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
      diffLineCount++;
    } else if (line.startsWith('+') || line.startsWith('-')) {
      diffLineCount++;
    }
    totalLines++;
  }

  // Consider it a diff if more than 20% of lines are diff markers
  return totalLines > 0 && diffLineCount / totalLines > 0.2;
}

// Parse diff stats
function getDiffStats(code: string): { additions: number; deletions: number } {
  const lines = code.split('\n');
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { additions, deletions };
}

export function CodeBlock({
  code,
  language = 'text',
  filename,
  className,
  collapsible = true,
  defaultCollapsed = true,
  maxCollapsedHeight = 200,
  showDiff,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const lineCount = code.split('\n').length;
  const shouldCollapse = collapsible && lineCount > 10;

  // Auto-detect diff format or use explicit prop
  const isDiff = useMemo(() => {
    if (showDiff !== undefined) return showDiff;
    if (language === 'diff') return true;
    return detectDiffFormat(code);
  }, [code, language, showDiff]);

  const diffStats = useMemo(() => {
    if (!isDiff) return null;
    return getDiffStats(code);
  }, [code, isDiff]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Copied to clipboard', {
      icon: <Check className="h-4 w-4" />,
      duration: 2000,
    });
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
            <span className="code-block-language">{isDiff ? 'diff' : language}</span>
          )}
          {/* Diff stats badge */}
          {isDiff && diffStats && (
            <div className="flex items-center gap-2 ml-2">
              {diffStats.additions > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs text-emerald-400">
                  <Plus className="h-3 w-3" />
                  {diffStats.additions}
                </span>
              )}
              {diffStats.deletions > 0 && (
                <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
                  <Minus className="h-3 w-3" />
                  {diffStats.deletions}
                </span>
              )}
            </div>
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

      {/* Content */}
      <div
        className={cn(
          'code-block-content relative',
          shouldCollapse && isCollapsed && 'code-block-collapsed',
        )}
        style={shouldCollapse && isCollapsed ? { maxHeight: maxCollapsedHeight } : undefined}
      >
        {isDiff ? (
          // Render diff with line-by-line highlighting
          <div className="p-4 font-mono text-[13px] leading-[1.6] overflow-x-auto">
            {code.split('\n').map((line, idx) => {
              let bgColor = 'transparent';
              let textColor = 'text-gray-300';
              let prefix = '';

              if (line.startsWith('+++') || line.startsWith('---')) {
                bgColor = 'rgba(59, 130, 246, 0.1)';
                textColor = 'text-blue-400';
              } else if (line.startsWith('@@')) {
                bgColor = 'rgba(139, 92, 246, 0.1)';
                textColor = 'text-purple-400';
              } else if (line.startsWith('+')) {
                bgColor = 'rgba(34, 197, 94, 0.15)';
                textColor = 'text-emerald-300';
                prefix = '+';
              } else if (line.startsWith('-')) {
                bgColor = 'rgba(239, 68, 68, 0.15)';
                textColor = 'text-red-300';
                prefix = '-';
              }

              return (
                <div
                  key={idx}
                  className={cn('flex', textColor)}
                  style={{ backgroundColor: bgColor }}
                >
                  <span
                    className="select-none text-gray-600 pr-4 text-right"
                    style={{ minWidth: '2.5em' }}
                  >
                    {idx + 1}
                  </span>
                  {prefix && (
                    <span
                      className={cn(
                        'w-4 flex-shrink-0',
                        prefix === '+' ? 'text-emerald-400' : 'text-red-400',
                      )}
                    >
                      {prefix}
                    </span>
                  )}
                  <span className="flex-1 whitespace-pre">{prefix ? line.slice(1) : line}</span>
                </div>
              );
            })}
          </div>
        ) : (
          // Regular syntax highlighting
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
        )}

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

function getLanguageIcon(_language: string): React.ReactNode {
  const iconClass = 'h-3.5 w-3.5 text-gray-400';

  return <FileCode className={iconClass} />;
}

export default CodeBlock;
