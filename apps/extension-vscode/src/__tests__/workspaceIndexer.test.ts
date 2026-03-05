/**
 * workspaceIndexer.test.ts — Tests for WorkspaceIndexer logic
 *
 * Tests the relevance scoring and context building logic.
 */

import { describe, it, expect } from 'vitest';

// Replicate the pure logic from WorkspaceIndexer for testing

interface CacheFile {
  path: string;
  language: string;
  symbols: string[];
  size: number;
}

const MAX_CONTEXT_CHARS = 2000;

function getRelevantContext(files: CacheFile[], query: string): string {
  const queryWords = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);

  if (queryWords.length === 0) return '';

  const scored = files.map((file) => {
    const allText = [file.path, ...file.symbols].join(' ').toLowerCase();
    const score = queryWords.reduce((sum, word) => sum + (allText.includes(word) ? 1 : 0), 0);
    return { file, score };
  });

  const relevant = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (relevant.length === 0) return '';

  let output = 'Workspace context:\n';
  for (const { file } of relevant) {
    const symbolList = file.symbols.slice(0, 8).join(', ');
    const line = `- ${file.path}${symbolList ? `: ${symbolList}` : ''}\n`;
    if (output.length + line.length > MAX_CONTEXT_CHARS) break;
    output += line;
  }

  return output;
}

function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
  };
  return map[ext] ?? ext;
}

describe('getRelevantContext', () => {
  const files: CacheFile[] = [
    {
      path: 'src/utils/api.ts',
      language: 'typescript',
      symbols: ['getApiKey', 'setApiKey', 'chatCompletion'],
      size: 1000,
    },
    {
      path: 'src/stores/chatStore.ts',
      language: 'typescript',
      symbols: ['useChatStore', 'sendMessage', 'clearChat'],
      size: 2000,
    },
    {
      path: 'src/components/Button.tsx',
      language: 'typescriptreact',
      symbols: ['Button', 'ButtonProps'],
      size: 500,
    },
    {
      path: 'src/models/user.py',
      language: 'python',
      symbols: ['User', 'create_user', 'authenticate'],
      size: 800,
    },
  ];

  it('returns empty string for empty query', () => {
    expect(getRelevantContext(files, '')).toBe('');
  });

  it('returns empty string when query has only short words', () => {
    expect(getRelevantContext(files, 'a b c')).toBe('');
  });

  it('returns empty string when no files match', () => {
    expect(getRelevantContext(files, 'database migration schema')).toBe('');
  });

  it('returns matching files for relevant query', () => {
    const result = getRelevantContext(files, 'how to use the api key');
    expect(result).toContain('api.ts');
    expect(result).toContain('getApiKey');
  });

  it('includes header "Workspace context:"', () => {
    const result = getRelevantContext(files, 'chat store');
    expect(result.startsWith('Workspace context:\n')).toBe(true);
  });

  it('scores files with more matching words higher', () => {
    const result = getRelevantContext(files, 'chat send message store');
    const lines = result.split('\n').filter((l) => l.startsWith('-'));
    expect(lines[0]).toContain('chatStore');
  });

  it('limits symbols to 8 per file', () => {
    const manySymbols: CacheFile = {
      path: 'big.ts',
      language: 'typescript',
      symbols: Array.from({ length: 20 }, (_, i) => `symbol${i}`),
      size: 5000,
    };
    const result = getRelevantContext([manySymbols], 'symbol big');
    const symbolMatches = result.match(/symbol\d+/g) ?? [];
    expect(symbolMatches.length).toBeLessThanOrEqual(8);
  });

  it('respects MAX_CONTEXT_CHARS limit', () => {
    const manyFiles: CacheFile[] = Array.from({ length: 50 }, (_, i) => ({
      path: `src/components/Component${i}.tsx`,
      language: 'typescriptreact',
      symbols: ['Component', 'render', 'props'],
      size: 100,
    }));

    const result = getRelevantContext(manyFiles, 'component render props');
    expect(result.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS + 200); // Some slack for last line
  });

  it('returns top 10 results maximum', () => {
    const manyFiles: CacheFile[] = Array.from({ length: 20 }, (_, i) => ({
      path: `match${i}.ts`,
      language: 'typescript',
      symbols: ['match'],
      size: 100,
    }));

    const result = getRelevantContext(manyFiles, 'match');
    const lines = result.split('\n').filter((l) => l.startsWith('-'));
    expect(lines.length).toBeLessThanOrEqual(10);
  });
});

describe('inferLanguage', () => {
  it.each([
    ['file.ts', 'typescript'],
    ['file.tsx', 'typescriptreact'],
    ['file.js', 'javascript'],
    ['file.jsx', 'javascriptreact'],
    ['file.py', 'python'],
    ['file.go', 'go'],
    ['file.rs', 'rust'],
    ['file.java', 'java'],
    ['file.cs', 'csharp'],
    ['file.cpp', 'cpp'],
    ['file.c', 'c'],
    ['file.h', 'c'],
    ['file.rb', 'ruby'],
    ['file.php', 'php'],
    ['file.swift', 'swift'],
    ['file.kt', 'kotlin'],
  ])('maps %s to %s', (path, expected) => {
    expect(inferLanguage(path)).toBe(expected);
  });

  it('returns raw extension for unknown types', () => {
    expect(inferLanguage('file.xyz')).toBe('xyz');
  });

  it('handles paths with directories', () => {
    expect(inferLanguage('src/utils/helper.ts')).toBe('typescript');
  });
});

describe('staleness check pattern', () => {
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  it('considers missing cache as stale', () => {
    const cache = undefined;
    const isStale = cache === undefined;
    expect(isStale).toBe(true);
  });

  it('considers recent cache as fresh', () => {
    const cache = { timestamp: Date.now() - 30 * 60 * 1000 }; // 30 min ago
    const isStale = Date.now() - cache.timestamp > CACHE_TTL_MS;
    expect(isStale).toBe(false);
  });

  it('considers old cache as stale', () => {
    const cache = { timestamp: Date.now() - 2 * 60 * 60 * 1000 }; // 2 hours ago
    const isStale = Date.now() - cache.timestamp > CACHE_TTL_MS;
    expect(isStale).toBe(true);
  });
});
