'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { Copy, Check, Download, Code2, ChevronDown, ChevronUp, WrapText, Play } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { InlineCodeExecutor, isExecutableLanguage } from './InlineCodeExecutor';

/**
 * Language color + icon map (40+ languages).
 * Colors sourced from official brand guidelines where available.
 */
const LANGUAGE_CONFIG: Record<string, { color: string; icon: string }> = {
  javascript: { color: '#f7df1e', icon: 'JS' },
  js: { color: '#f7df1e', icon: 'JS' },
  typescript: { color: '#3178c6', icon: 'TS' },
  ts: { color: '#3178c6', icon: 'TS' },
  tsx: { color: '#3178c6', icon: 'TSX' },
  jsx: { color: '#f7df1e', icon: 'JSX' },
  python: { color: '#3776ab', icon: 'PY' },
  py: { color: '#3776ab', icon: 'PY' },
  rust: { color: '#ce422b', icon: 'RS' },
  rs: { color: '#ce422b', icon: 'RS' },
  go: { color: '#00add8', icon: 'GO' },
  java: { color: '#ed8b00', icon: 'JV' },
  cpp: { color: '#00599c', icon: 'C++' },
  'c++': { color: '#00599c', icon: 'C++' },
  c: { color: '#a8b9cc', icon: 'C' },
  'c#': { color: '#512bd4', icon: 'C#' },
  csharp: { color: '#512bd4', icon: 'C#' },
  ruby: { color: '#cc342d', icon: 'RB' },
  rb: { color: '#cc342d', icon: 'RB' },
  php: { color: '#777bb4', icon: 'PHP' },
  swift: { color: '#fa7343', icon: 'SW' },
  kotlin: { color: '#7f52ff', icon: 'KT' },
  dart: { color: '#0175c2', icon: 'DT' },
  scala: { color: '#dc322f', icon: 'SC' },
  elixir: { color: '#6e4a7e', icon: 'EX' },
  haskell: { color: '#5e5086', icon: 'HS' },
  lua: { color: '#000080', icon: 'LUA' },
  perl: { color: '#39457e', icon: 'PL' },
  r: { color: '#276dc3', icon: 'R' },
  html: { color: '#e34f26', icon: 'HTML' },
  css: { color: '#1572b6', icon: 'CSS' },
  scss: { color: '#cc6699', icon: 'SCSS' },
  sass: { color: '#cc6699', icon: 'SASS' },
  less: { color: '#1d365d', icon: 'LESS' },
  json: { color: '#292929', icon: '{ }' },
  jsonc: { color: '#292929', icon: '{ }' },
  yaml: { color: '#cb171e', icon: 'YML' },
  yml: { color: '#cb171e', icon: 'YML' },
  toml: { color: '#9c4121', icon: 'TOML' },
  xml: { color: '#0060ac', icon: 'XML' },
  markdown: { color: '#083fa1', icon: 'MD' },
  md: { color: '#083fa1', icon: 'MD' },
  sql: { color: '#e38c00', icon: 'SQL' },
  graphql: { color: '#e10098', icon: 'GQL' },
  gql: { color: '#e10098', icon: 'GQL' },
  bash: { color: '#4eaa25', icon: '$' },
  shell: { color: '#4eaa25', icon: '$' },
  sh: { color: '#4eaa25', icon: '$' },
  zsh: { color: '#4eaa25', icon: '$' },
  fish: { color: '#4eaa25', icon: '$' },
  powershell: { color: '#5391fe', icon: 'PS' },
  ps1: { color: '#5391fe', icon: 'PS' },
  dockerfile: { color: '#2496ed', icon: 'DF' },
  docker: { color: '#2496ed', icon: 'DF' },
  makefile: { color: '#427819', icon: 'MK' },
  cmake: { color: '#064f8c', icon: 'CM' },
  nginx: { color: '#009639', icon: 'NGX' },
  terraform: { color: '#7b42bc', icon: 'TF' },
  hcl: { color: '#7b42bc', icon: 'HCL' },
  proto: { color: '#4285f4', icon: 'PB' },
  protobuf: { color: '#4285f4', icon: 'PB' },
  diff: { color: '#41b883', icon: 'DIFF' },
  plaintext: { color: '#6b7280', icon: 'TXT' },
  text: { color: '#6b7280', icon: 'TXT' },
  txt: { color: '#6b7280', icon: 'TXT' },
};

/** File extension to language mapping for download filenames */
const LANG_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  python: 'py',
  py: 'py',
  rust: 'rs',
  rs: 'rs',
  go: 'go',
  java: 'java',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  csharp: 'cs',
  'c#': 'cs',
  ruby: 'rb',
  rb: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  dart: 'dart',
  scala: 'scala',
  elixir: 'ex',
  haskell: 'hs',
  lua: 'lua',
  perl: 'pl',
  r: 'r',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yml',
  toml: 'toml',
  xml: 'xml',
  markdown: 'md',
  md: 'md',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  bash: 'sh',
  shell: 'sh',
  sh: 'sh',
  zsh: 'zsh',
  powershell: 'ps1',
  ps1: 'ps1',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  makefile: 'Makefile',
  proto: 'proto',
  diff: 'diff',
  text: 'txt',
  txt: 'txt',
  plaintext: 'txt',
};

/** Threshold for collapsible code blocks (line count) */
const COLLAPSE_THRESHOLD = 25;

// ---------------------------------------------------------------------------
// CodeBlock
// ---------------------------------------------------------------------------

export interface CodeBlockProps {
  /** The raw code string */
  code: string;
  /** Language identifier (e.g. "typescript", "bash") */
  language: string;
  /** Optional filename displayed in the header */
  fileName?: string;
  /** Show line numbers in the gutter */
  showLineNumbers?: boolean;
  /** Enable the copy button (default true) */
  enableCopy?: boolean;
  /** Enable the download button */
  enableDownload?: boolean;
  /** Enable the inline "Run" button for Python / JavaScript (default true for those languages) */
  enableRun?: boolean;
  /** Additional class names on the root element */
  className?: string;
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language,
  fileName,
  showLineNumbers = true,
  enableCopy = true,
  enableDownload = false,
  enableRun,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [showExecutor, setShowExecutor] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedLang = useMemo(() => language.toLowerCase().trim(), [language]);

  // Determine whether the Run button should appear.
  // If the caller explicitly passed enableRun, honour that.
  // Otherwise default to true for executable languages.
  const canRun = useMemo(
    () => (enableRun !== undefined ? enableRun : isExecutableLanguage(normalizedLang)),
    [enableRun, normalizedLang],
  );
  const langConfig = useMemo(
    () => LANGUAGE_CONFIG[normalizedLang] ?? { color: '#6b7280', icon: '' },
    [normalizedLang],
  );

  const lines = useMemo(() => code.split('\n'), [code]);
  const lineCount = lines.length;
  const isLong = lineCount > COLLAPSE_THRESHOLD;

  // Auto-collapse long blocks on mount
  useEffect(() => {
    if (isLong) setIsCollapsed(true);
  }, [isLong]);

  // Cleanup copy timeout
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: textarea copy for older browsers / insecure contexts
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const handleDownload = useCallback(() => {
    const ext = LANG_EXTENSIONS[normalizedLang] ?? normalizedLang;
    const name = fileName ?? `code.${ext}`;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [code, fileName, normalizedLang]);

  // Build display label for the language badge
  const displayLang = useMemo(() => {
    if (normalizedLang === 'plaintext' || normalizedLang === 'text' || normalizedLang === 'txt') {
      return 'plain text';
    }
    return normalizedLang;
  }, [normalizedLang]);

  // Number gutter width calculation based on line count
  const gutterWidth = useMemo(() => {
    const digits = Math.max(2, String(lineCount).length);
    return `${digits + 1}ch`;
  }, [lineCount]);

  return (
    <div
      className={cn(
        'group/codeblock relative overflow-hidden rounded-lg border border-border/60',
        'bg-[#0d1117] text-sm',
        className,
      )}
    >
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-[#161b22] px-3 py-1.5">
        {/* Left: language badge + filename + line count */}
        <div className="flex min-w-0 items-center gap-2">
          {/* Language badge */}
          <div
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none"
            style={{
              backgroundColor: `${langConfig.color}18`,
              color: langConfig.color,
            }}
          >
            {langConfig.icon ? (
              <span className="font-mono">{langConfig.icon}</span>
            ) : (
              <Code2 size={11} />
            )}
            <span className="uppercase tracking-wide">{displayLang}</span>
          </div>
          {/* Filename */}
          {fileName && (
            <span className="truncate font-mono text-[11px] text-gray-400" title={fileName}>
              {fileName}
            </span>
          )}
          {/* Line count */}
          <span className="shrink-0 text-[10px] tabular-nums text-gray-500">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-0.5">
          {/* Run button (Python / JavaScript only) */}
          {canRun && (
            <HeaderButton
              onClick={() => setShowExecutor((s) => !s)}
              active={showExecutor}
              title={showExecutor ? 'Hide executor' : 'Run code'}
              className={showExecutor ? 'text-emerald-400' : undefined}
            >
              <Play size={13} />
            </HeaderButton>
          )}
          {/* Word wrap toggle */}
          <HeaderButton
            onClick={() => setWordWrap((w) => !w)}
            active={wordWrap}
            title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
          >
            <WrapText size={13} />
          </HeaderButton>
          {/* Collapse toggle for long blocks */}
          {isLong && (
            <HeaderButton
              onClick={() => setIsCollapsed((c) => !c)}
              title={isCollapsed ? 'Expand code' : 'Collapse code'}
            >
              {isCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </HeaderButton>
          )}
          {/* Download */}
          {enableDownload && (
            <HeaderButton onClick={handleDownload} title="Download file">
              <Download size={13} />
            </HeaderButton>
          )}
          {/* Copy */}
          {enableCopy && (
            <HeaderButton
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy code'}
              active={copied}
              className={copied ? 'text-green-400' : undefined}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </HeaderButton>
          )}
        </div>
      </div>

      {/* ── Code body ── */}
      <div
        className={cn(
          'overflow-auto',
          isCollapsed ? 'max-h-[260px]' : 'max-h-[80vh]',
          wordWrap && '[&_code]:whitespace-pre-wrap [&_code]:break-words',
        )}
      >
        <div className="relative">
          {/* Line numbers gutter */}
          {showLineNumbers && (
            <div
              className="pointer-events-none absolute left-0 top-0 z-10 select-none border-r border-white/[0.04] bg-[#0d1117] py-4 pr-2 text-right font-mono text-[12px] leading-[1.6] text-gray-600"
              style={{ width: gutterWidth }}
              aria-hidden="true"
            >
              {(isCollapsed ? lines.slice(0, COLLAPSE_THRESHOLD) : lines).map((_, i) => (
                <div key={i} className="px-2">
                  {i + 1}
                </div>
              ))}
            </div>
          )}
          {/* Code content — highlight.js classes applied by rehype-highlight upstream */}
          <pre
            className={cn(
              'm-0 overflow-visible bg-transparent p-4 font-mono text-[13px] leading-[1.6] text-gray-200',
              showLineNumbers && 'pl-[calc(var(--gutter)+0.75rem)]',
            )}
            style={
              showLineNumbers ? ({ '--gutter': gutterWidth } as React.CSSProperties) : undefined
            }
          >
            <code className={`language-${normalizedLang} hljs`}>
              {isCollapsed ? lines.slice(0, COLLAPSE_THRESHOLD).join('\n') : code}
            </code>
          </pre>
        </div>
      </div>

      {/* Inline code executor */}
      {canRun && showExecutor && <InlineCodeExecutor code={code} language={normalizedLang} />}

      {/* Collapse fade + expand button */}
      {isLong && isCollapsed && (
        <div className="relative">
          <div className="pointer-events-none absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-[#0d1117] to-transparent" />
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="flex w-full items-center justify-center gap-1 border-t border-white/[0.06] bg-[#161b22] py-1.5 text-[11px] text-gray-400 transition-colors hover:text-gray-200"
          >
            <ChevronDown size={12} />
            Show {lineCount - COLLAPSE_THRESHOLD} more lines
          </button>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// InlineCode
// ---------------------------------------------------------------------------

export interface InlineCodeProps {
  children: React.ReactNode;
  className?: string;
}

/** Styled inline code span for single backtick usage. */
export const InlineCode = memo(function InlineCode({ children, className }: InlineCodeProps) {
  return (
    <code
      className={cn(
        'rounded-md border border-border/40 bg-muted/70 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground',
        className,
      )}
    >
      {children}
    </code>
  );
});

// ---------------------------------------------------------------------------
// HeaderButton (internal)
// ---------------------------------------------------------------------------

interface HeaderButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  className?: string;
}

function HeaderButton({ children, onClick, title, active, className }: HeaderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded p-1.5 transition-colors',
        active
          ? 'bg-white/10 text-gray-200'
          : 'text-gray-500 hover:bg-white/[0.06] hover:text-gray-300',
        className,
      )}
    >
      {children}
    </button>
  );
}

export default CodeBlock;
