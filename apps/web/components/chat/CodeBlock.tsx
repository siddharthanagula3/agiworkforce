'use client';

import React, { useState, useCallback, memo } from 'react';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
}

// Simple syntax highlighting patterns for common languages
const languageColors: Record<string, Record<string, string>> = {
  javascript: {
    keyword: 'text-purple-400',
    string: 'text-green-400',
    comment: 'text-gray-500',
    number: 'text-orange-400',
    function: 'text-blue-400',
  },
  typescript: {
    keyword: 'text-purple-400',
    string: 'text-green-400',
    comment: 'text-gray-500',
    number: 'text-orange-400',
    function: 'text-blue-400',
    type: 'text-cyan-400',
  },
  python: {
    keyword: 'text-purple-400',
    string: 'text-green-400',
    comment: 'text-gray-500',
    number: 'text-orange-400',
    function: 'text-blue-400',
  },
  rust: {
    keyword: 'text-purple-400',
    string: 'text-green-400',
    comment: 'text-gray-500',
    number: 'text-orange-400',
    function: 'text-blue-400',
    macro: 'text-cyan-400',
  },
};

// Simple tokenizer for basic syntax highlighting
function highlightCode(code: string, language: string): React.ReactNode[] {
  const colors = languageColors[language.toLowerCase()] || languageColors.javascript;
  const lines = code.split('\n');

  return lines.map((line, lineIndex) => {
    // Comments
    if (line.trim().startsWith('//') || line.trim().startsWith('#')) {
      return (
        <span key={lineIndex} className={colors.comment}>
          {line}
          {'\n'}
        </span>
      );
    }

    // For simplicity, just return the plain text with basic coloring
    // A production app would use prism-react-renderer or similar
    return (
      <span key={lineIndex}>
        {line}
        {lineIndex < lines.length - 1 ? '\n' : ''}
      </span>
    );
  });
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language = 'text',
  filename,
  showLineNumbers = true,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const lines = code.split('\n');
  const isLongCode = lines.length > 20;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  }, [code]);

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-900 text-gray-100 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {isLongCode && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-0.5 hover:bg-gray-700 rounded transition-colors"
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
          )}
          <span className="text-xs font-medium text-gray-400">{filename || language}</span>
          {lines.length > 1 && <span className="text-xs text-gray-500">{lines.length} lines</span>}
        </div>
        <button
          onClick={handleCopy}
          className={clsx(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
            copied
              ? 'bg-green-500/20 text-green-400'
              : 'hover:bg-gray-700 text-gray-400 hover:text-gray-300',
          )}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <pre className="p-4 font-mono text-sm leading-relaxed">
            <code className="flex">
              {showLineNumbers && (
                <span
                  className="select-none pr-4 text-gray-600 text-right"
                  style={{ minWidth: '2rem' }}
                >
                  {lines.map((_, i) => (
                    <span key={i} className="block">
                      {i + 1}
                    </span>
                  ))}
                </span>
              )}
              <span className="flex-1 overflow-x-auto">{highlightCode(code, language)}</span>
            </code>
          </pre>
        </div>
      )}

      {/* Collapsed indicator */}
      {collapsed && (
        <div className="px-4 py-2 text-xs text-gray-500">
          {lines.length} lines collapsed • Click to expand
        </div>
      )}
    </div>
  );
});

export default CodeBlock;
