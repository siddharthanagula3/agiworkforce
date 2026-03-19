'use client';

/**
 * InlineFileRead
 *
 * Renders file content with:
 * - File path header (truncated, full path on hover)
 * - Language badge (detected from extension)
 * - Line count / word count metadata
 * - Syntax-highlighted preview (monospace, collapsed by default)
 * - Copy-to-clipboard
 * - Expand/collapse for long files
 */

import { useState } from 'react';
import { FileText, Copy, Check, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { ToolResultProps } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileReadData {
  text?: string;
  content?: string | { text?: string; metadata?: FileMetadata };
  filePath?: string;
  file_path?: string;
  path?: string;
  metadata?: FileMetadata;
  language?: string;
  success?: boolean;
  error?: string;
}

interface FileMetadata {
  file_name?: string;
  file_path?: string;
  page_count?: number;
  word_count?: number;
  line_count?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_LINES_COLLAPSED = 15;

const LANG_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  jsx: 'JSX',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  rb: 'Ruby',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  swift: 'Swift',
  kt: 'Kotlin',
  md: 'Markdown',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sql: 'SQL',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  dockerfile: 'Docker',
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const baseName = filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';

  if (baseName === 'dockerfile') return 'Docker';
  if (baseName === 'makefile') return 'Makefile';

  return LANG_MAP[ext] || ext.toUpperCase() || '';
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const InlineFileRead: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const data = result?.data as FileReadData | undefined;

  // Running state
  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />
        <span className="text-sm text-muted-foreground">Reading file...</span>
      </div>
    );
  }

  // Error state
  if (status === 'error' || status === 'failed') {
    return (
      <div className="mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">File read failed</p>
            {(result?.error || data?.error) && (
              <p className="text-xs text-muted-foreground mt-1">{result?.error || data?.error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Extract text from various shapes
  const metadataFromContent =
    typeof data.content === 'object' && data.content ? data.content.metadata : undefined;
  const textFromContent = typeof data.content === 'object' && data.content ? data.content.text : '';
  const text =
    data.text || (typeof data.content === 'string' ? data.content : textFromContent || '');

  const metadata = data.metadata || metadataFromContent;
  const filePath = data.filePath || data.file_path || data.path || metadata?.file_path || '';
  const fileName = metadata?.file_name
    ? metadata.file_name
    : filePath
      ? filePath.replace(/\\/g, '/').split('/').pop() || 'File'
      : 'File';

  const language = data.language || detectLanguage(filePath || fileName);

  if (!text || text.trim().length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg border border-border/50 bg-muted/20">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Empty file or no content extracted.</span>
        </div>
      </div>
    );
  }

  const allLines = text.split('\n');
  const lineCount = metadata?.line_count ?? allLines.length;
  const wordCount = metadata?.word_count;
  const visibleLines = expanded ? allLines : allLines.slice(0, MAX_LINES_COLLAPSED);
  const hasMore = allLines.length > MAX_LINES_COLLAPSED;

  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Metadata chips (computed inline — no useMemo needed; deps change with data)
  const chips: string[] = [];
  if (lineCount > 0) chips.push(`${lineCount} lines`);
  if (wordCount && wordCount > 0) chips.push(`${wordCount} words`);
  if (metadata?.page_count) chips.push(`${metadata.page_count} pages`);

  return (
    <div className="mt-3 rounded-lg border border-border/50 overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-cyan-500" />
          <span className="text-xs font-mono font-medium text-foreground truncate" title={filePath}>
            {fileName}
          </span>
          {language && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              {language}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {chips.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{chips.join(' / ')}</span>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Copy file content"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* File content */}
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <pre className="font-mono text-xs leading-relaxed">
          {visibleLines.map((line, i) => (
            <div key={i} className={cn('flex', 'text-muted-foreground')}>
              <span className="w-10 shrink-0 text-right pr-2 select-none text-muted-foreground/30 border-r border-border/20">
                {i + 1}
              </span>
              <span className="px-2 whitespace-pre-wrap break-words flex-1">{line || ' '}</span>
            </div>
          ))}
        </pre>

        {hasMore && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full px-3 py-1.5 text-xs text-center text-muted-foreground hover:text-foreground border-t border-border/30 transition-colors"
          >
            Show {allLines.length - MAX_LINES_COLLAPSED} more lines
          </button>
        )}
      </div>
    </div>
  );
};
