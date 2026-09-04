export type HighlightKind = 'plain' | 'comment' | 'string' | 'number' | 'keyword';

export interface HighlightToken {
  text: string;
  kind: HighlightKind;
}

const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cc',
  'cpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'sql',
  'yml',
  'yaml',
  'toml',
  'css',
  'scss',
  'html',
  'xml',
]);

const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'rst', 'csv', 'log', 'license']);

const KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'def',
  'default',
  'do',
  'echo',
  'elif',
  'else',
  'end',
  'enum',
  'export',
  'extends',
  'false',
  'fi',
  'finally',
  'fn',
  'for',
  'from',
  'func',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'interface',
  'let',
  'match',
  'new',
  'null',
  'package',
  'private',
  'public',
  'return',
  'select',
  'self',
  'static',
  'struct',
  'switch',
  'then',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'var',
  'void',
  'where',
  'while',
  'yield',
]);

const LINE_COMMENT_PREFIXES = ['//', '#', '--'];
const QUOTES = new Set(['"', "'", '`']);
const WORD_PATTERN = /[A-Za-z_$][\w$]*/y;
const NUMBER_PATTERN = /\d[\d._]*/y;

export function fileExtension(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base.toLowerCase();
  return base.slice(dot + 1).toLowerCase();
}

export function isCodeFile(path: string): boolean {
  return CODE_EXTENSIONS.has(fileExtension(path));
}

export function isTextFile(path: string): boolean {
  const extension = fileExtension(path);
  return TEXT_EXTENSIONS.has(extension) || CODE_EXTENSIONS.has(extension);
}

function push(tokens: HighlightToken[], text: string, kind: HighlightKind): void {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) last.text += text;
  else tokens.push({ text, kind });
}

export function highlightLine(line: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let index = 0;
  while (index < line.length) {
    const rest = line.slice(index);
    const commentPrefix = LINE_COMMENT_PREFIXES.find((prefix) => rest.startsWith(prefix));
    if (commentPrefix) {
      push(tokens, rest, 'comment');
      break;
    }
    const character = line[index] as string;
    if (QUOTES.has(character)) {
      let cursor = index + 1;
      while (cursor < line.length) {
        if (line[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (line[cursor] === character) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      push(tokens, line.slice(index, cursor), 'string');
      index = cursor;
      continue;
    }
    WORD_PATTERN.lastIndex = index;
    const word = WORD_PATTERN.exec(line);
    if (word) {
      push(tokens, word[0], KEYWORDS.has(word[0]) ? 'keyword' : 'plain');
      index += word[0].length;
      continue;
    }
    NUMBER_PATTERN.lastIndex = index;
    const number = NUMBER_PATTERN.exec(line);
    if (number) {
      push(tokens, number[0], 'number');
      index += number[0].length;
      continue;
    }
    push(tokens, character, 'plain');
    index += 1;
  }
  return tokens;
}

export function splitLines(content: string): string[] {
  return content.replace(/\n$/, '').split('\n');
}
