'use client';

import React, { useState, useCallback, memo } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, FileCode } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
}

// Language display names
const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  jsx: 'JSX',
  py: 'Python',
  python: 'Python',
  rs: 'Rust',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  cs: 'C#',
  csharp: 'C#',
  rb: 'Ruby',
  ruby: 'Ruby',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  md: 'Markdown',
  markdown: 'Markdown',
  xml: 'XML',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  swift: 'Swift',
  kotlin: 'Kotlin',
  php: 'PHP',
  r: 'R',
  scala: 'Scala',
  text: 'Text',
  txt: 'Text',
  diff: 'Diff',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
};

// Token types for syntax highlighting
type TokenType =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'operator'
  | 'type'
  | 'function'
  | 'plain';

interface Token {
  type: TokenType;
  value: string;
}

// Keyword sets per language family
const KEYWORDS: Record<string, string[]> = {
  javascript: [
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'new',
    'delete',
    'typeof',
    'instanceof',
    'in',
    'of',
    'import',
    'export',
    'default',
    'class',
    'extends',
    'super',
    'this',
    'async',
    'await',
    'try',
    'catch',
    'finally',
    'throw',
    'null',
    'undefined',
    'true',
    'false',
    'void',
    'static',
    'get',
    'set',
    'from',
    'as',
  ],
  typescript: [
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'new',
    'delete',
    'typeof',
    'instanceof',
    'in',
    'of',
    'import',
    'export',
    'default',
    'class',
    'extends',
    'super',
    'this',
    'async',
    'await',
    'try',
    'catch',
    'finally',
    'throw',
    'null',
    'undefined',
    'true',
    'false',
    'void',
    'static',
    'get',
    'set',
    'from',
    'as',
    'interface',
    'type',
    'enum',
    'implements',
    'abstract',
    'readonly',
    'private',
    'public',
    'protected',
    'declare',
    'namespace',
    'module',
    'keyof',
    'typeof',
    'infer',
    'never',
    'any',
    'unknown',
    'string',
    'number',
    'boolean',
    'object',
    'symbol',
    'bigint',
  ],
  python: [
    'def',
    'class',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'in',
    'not',
    'and',
    'or',
    'import',
    'from',
    'as',
    'with',
    'try',
    'except',
    'finally',
    'raise',
    'pass',
    'break',
    'continue',
    'yield',
    'lambda',
    'del',
    'global',
    'nonlocal',
    'True',
    'False',
    'None',
    'async',
    'await',
    'is',
  ],
  rust: [
    'fn',
    'let',
    'mut',
    'pub',
    'use',
    'mod',
    'struct',
    'enum',
    'impl',
    'trait',
    'for',
    'in',
    'if',
    'else',
    'while',
    'loop',
    'match',
    'return',
    'break',
    'continue',
    'true',
    'false',
    'self',
    'Self',
    'super',
    'crate',
    'type',
    'where',
    'async',
    'await',
    'move',
    'ref',
    'const',
    'static',
    'extern',
    'unsafe',
    'dyn',
    'box',
    'as',
    'and',
    'or',
    'not',
    'in',
  ],
  go: [
    'func',
    'var',
    'const',
    'type',
    'struct',
    'interface',
    'package',
    'import',
    'return',
    'if',
    'else',
    'for',
    'range',
    'switch',
    'case',
    'default',
    'break',
    'continue',
    'goto',
    'defer',
    'go',
    'chan',
    'map',
    'make',
    'new',
    'nil',
    'true',
    'false',
    'fallthrough',
    'select',
  ],
};

// Resolve language family
function getLanguageFamily(lang: string): string {
  const l = lang.toLowerCase();
  if (['ts', 'tsx'].includes(l)) return 'typescript';
  if (['js', 'jsx'].includes(l)) return 'javascript';
  if (['py'].includes(l)) return 'python';
  if (['rs'].includes(l)) return 'rust';
  return l;
}

// Simple line-level tokenizer
function tokenizeLine(line: string, lang: string): Token[] {
  const family = getLanguageFamily(lang);
  const keywords = KEYWORDS[family] || KEYWORDS.javascript;
  const tokens: Token[] = [];

  // Single-line comment patterns
  const commentPrefixes = family === 'python' ? ['#'] : ['//'];
  for (const prefix of commentPrefixes) {
    const idx = line.indexOf(prefix);
    if (idx !== -1) {
      // Everything before comment
      const before = line.slice(0, idx);
      const comment = line.slice(idx);
      if (before) tokens.push(...tokenizeInline(before, keywords));
      tokens.push({ type: 'comment', value: comment });
      return tokens;
    }
  }

  return tokenizeInline(line, keywords);
}

function tokenizeInline(text: string, keywords: string[]): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    // String literals (single, double, backtick quotes)
    if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
      const quote = text[i];
      let j = i + 1;
      while (j < text.length && text[j] !== quote) {
        if (text[j] === '\\') j++; // escape
        j++;
      }
      j++; // include closing quote
      tokens.push({ type: 'string', value: text.slice(i, j) });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(text[i]) && (i === 0 || !/[a-zA-Z_$]/.test(text[i - 1]))) {
      let j = i;
      while (j < text.length && /[0-9._xXbBoO]/.test(text[j])) j++;
      tokens.push({ type: 'number', value: text.slice(i, j) });
      i = j;
      continue;
    }

    // Identifiers / keywords
    if (/[a-zA-Z_$]/.test(text[i])) {
      let j = i;
      while (j < text.length && /[a-zA-Z0-9_$]/.test(text[j])) j++;
      const word = text.slice(i, j);
      // Check if it looks like a function call (followed by '(')
      const afterWord = text[j];
      if (keywords.includes(word)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (afterWord === '(') {
        tokens.push({ type: 'function', value: word });
      } else if (/^[A-Z]/.test(word)) {
        tokens.push({ type: 'type', value: word });
      } else {
        tokens.push({ type: 'plain', value: word });
      }
      i = j;
      continue;
    }

    // Plain character
    tokens.push({ type: 'plain', value: text[i] });
    i++;
  }

  return tokens;
}

// Token color classes
const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: 'text-purple-400',
  string: 'text-green-400',
  comment: 'text-gray-500 italic',
  number: 'text-orange-400',
  operator: 'text-cyan-400',
  type: 'text-cyan-300',
  function: 'text-blue-400',
  plain: 'text-gray-200',
};

interface HighlightedLineProps {
  line: string;
  language: string;
  lineNumber: number;
  showLineNumbers: boolean;
}

const HighlightedLine = memo(function HighlightedLine({
  line,
  language,
  lineNumber,
  showLineNumbers,
}: HighlightedLineProps) {
  const tokens = tokenizeLine(line, language);

  return (
    <div className="flex min-h-[1.5em]">
      {showLineNumbers && (
        <span className="select-none pr-4 text-gray-600 text-right min-w-[2.5rem] shrink-0 tabular-nums">
          {lineNumber}
        </span>
      )}
      <span className="flex-1 break-all whitespace-pre-wrap">
        {tokens.map((token, i) => (
          <span key={i} className={TOKEN_COLORS[token.type]}>
            {token.value}
          </span>
        ))}
      </span>
    </div>
  );
});

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
  const displayLanguage = LANGUAGE_LABELS[language.toLowerCase()] || language.toUpperCase();

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
    <div className="rounded-lg overflow-hidden border border-gray-700 bg-gray-950 text-gray-100 text-sm my-2 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {isLongCode && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-0.5 hover:bg-gray-700 rounded transition-colors"
              aria-label={collapsed ? 'Expand code' : 'Collapse code'}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
          )}
          <FileCode className="w-3.5 h-3.5 text-gray-500" />
          {filename ? (
            <span className="text-xs font-medium text-gray-300">{filename}</span>
          ) : (
            <span className="text-xs font-medium text-gray-400 px-1.5 py-0.5 rounded bg-gray-700/60">
              {displayLanguage}
            </span>
          )}
          {lines.length > 1 && (
            <span className="text-xs text-gray-600 tabular-nums">{lines.length} lines</span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200',
            copied
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'hover:bg-gray-700 text-gray-400 hover:text-gray-200 border border-transparent',
          )}
          aria-label={copied ? 'Copied to clipboard' : 'Copy code'}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied!
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
          <pre className="p-4 font-mono text-sm leading-6">
            <code className="block">
              {lines.map((line, i) => (
                <HighlightedLine
                  key={i}
                  line={line}
                  language={language}
                  lineNumber={i + 1}
                  showLineNumbers={showLineNumbers}
                />
              ))}
            </code>
          </pre>
        </div>
      )}

      {/* Collapsed indicator */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full px-4 py-2.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors text-left"
        >
          {lines.length} lines hidden — click to expand
        </button>
      )}
    </div>
  );
});

export default CodeBlock;
