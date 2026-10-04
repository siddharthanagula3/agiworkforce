import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { CSSProperties } from 'react';

export const LANGUAGE_LOADERS = {
  bash: () => import('@shikijs/langs/bash'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  diff: () => import('@shikijs/langs/diff'),
  docker: () => import('@shikijs/langs/docker'),
  elixir: () => import('@shikijs/langs/elixir'),
  go: () => import('@shikijs/langs/go'),
  graphql: () => import('@shikijs/langs/graphql'),
  haskell: () => import('@shikijs/langs/haskell'),
  html: () => import('@shikijs/langs/html'),
  ini: () => import('@shikijs/langs/ini'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsx: () => import('@shikijs/langs/jsx'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  latex: () => import('@shikijs/langs/latex'),
  less: () => import('@shikijs/langs/less'),
  lua: () => import('@shikijs/langs/lua'),
  makefile: () => import('@shikijs/langs/makefile'),
  markdown: () => import('@shikijs/langs/markdown'),
  nginx: () => import('@shikijs/langs/nginx'),
  'objective-c': () => import('@shikijs/langs/objective-c'),
  perl: () => import('@shikijs/langs/perl'),
  php: () => import('@shikijs/langs/php'),
  powershell: () => import('@shikijs/langs/powershell'),
  prisma: () => import('@shikijs/langs/prisma'),
  proto: () => import('@shikijs/langs/proto'),
  python: () => import('@shikijs/langs/python'),
  r: () => import('@shikijs/langs/r'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  scala: () => import('@shikijs/langs/scala'),
  scss: () => import('@shikijs/langs/scss'),
  sql: () => import('@shikijs/langs/sql'),
  svelte: () => import('@shikijs/langs/svelte'),
  swift: () => import('@shikijs/langs/swift'),
  terraform: () => import('@shikijs/langs/terraform'),
  toml: () => import('@shikijs/langs/toml'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  vue: () => import('@shikijs/langs/vue'),
  xml: () => import('@shikijs/langs/xml'),
  yaml: () => import('@shikijs/langs/yaml'),
  zig: () => import('@shikijs/langs/zig'),
} as const;

export type LanguageId = keyof typeof LANGUAGE_LOADERS;

const LANGUAGE_ALIASES: Readonly<Record<string, LanguageId>> = {
  'c++': 'cpp',
  'c#': 'csharp',
  cc: 'cpp',
  cfg: 'ini',
  cjs: 'javascript',
  cmd: 'bash',
  conf: 'ini',
  console: 'bash',
  cs: 'csharp',
  cts: 'typescript',
  cxx: 'cpp',
  dockerfile: 'docker',
  dotnet: 'csharp',
  ex: 'elixir',
  exs: 'elixir',
  golang: 'go',
  gql: 'graphql',
  hcl: 'terraform',
  hs: 'haskell',
  htm: 'html',
  js: 'javascript',
  json5: 'json',
  jsonc: 'json',
  jsonl: 'json',
  kt: 'kotlin',
  kts: 'kotlin',
  make: 'makefile',
  md: 'markdown',
  mdx: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  node: 'javascript',
  objc: 'objective-c',
  patch: 'diff',
  pl: 'perl',
  properties: 'ini',
  protobuf: 'proto',
  ps: 'powershell',
  ps1: 'powershell',
  pwsh: 'powershell',
  py: 'python',
  python3: 'python',
  rb: 'ruby',
  rs: 'rust',
  sass: 'scss',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  svg: 'xml',
  tex: 'latex',
  tf: 'terraform',
  tfvars: 'terraform',
  ts: 'typescript',
  udiff: 'diff',
  xsl: 'xml',
  yml: 'yaml',
  zsh: 'bash',
} as const;

export const THEME_LOADERS = {
  light: () => import('@shikijs/themes/github-light-high-contrast'),
  dark: () => import('@shikijs/themes/github-dark-default'),
} as const;

type ThemeName = keyof typeof THEME_LOADERS;
type ThemeRegistration = Awaited<ReturnType<(typeof THEME_LOADERS)[ThemeName]>>['default'];
type LoadedThemes = Readonly<Record<ThemeName, ThemeRegistration>>;

const CSS_VARIABLE_PREFIX = '--shiki-';

const CACHE_LIMIT = 32;
const CACHE_KEY_SEPARATOR = '\u0000';
const CUSTOM_PROPERTY_PREFIX = '--';
const KEBAB_BOUNDARY = /-([a-z])/g;
const HASH_PRIME = 0x01000193;
const HASH_SEED_A = 0x811c9dc5;
const HASH_SEED_B = 0x9e3779b9;

// Tokenising is synchronous once the grammar is in memory, so an unbounded
// block is a main-thread stall. A pasted dump stays readable unhighlighted, and
// a minified single line leaves only that line uncoloured.
const MAX_HIGHLIGHT_LENGTH = 100_000;
const MAX_LINE_LENGTH = 1_000;

export interface HighlightedToken {
  readonly content: string;
  readonly style: CSSProperties;
}

export type HighlightedLine = readonly HighlightedToken[];

interface ResolvedHighlighter {
  readonly highlighter: HighlighterCore;
  readonly themes: LoadedThemes;
}

interface HighlightCacheEntry {
  readonly code: string;
  readonly lines: readonly HighlightedLine[];
}

const lineCache = new Map<string, readonly HighlightCacheEntry[]>();
const loadedLanguages = new Map<LanguageId, Promise<void>>();
let resolvedHighlighter: Promise<ResolvedHighlighter> | null = null;

function hashText(seed: number, text: string): number {
  let hash = seed;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, HASH_PRIME);
  }
  return hash >>> 0;
}

function cacheKey(code: string, language: LanguageId): string {
  const languageHashA = hashText(hashText(HASH_SEED_A, language), CACHE_KEY_SEPARATOR);
  const languageHashB = hashText(hashText(HASH_SEED_B, language), CACHE_KEY_SEPARATOR);
  const hashA = hashText(languageHashA, code).toString(36);
  const hashB = hashText(languageHashB, code).toString(36);
  return `${language}:${code.length.toString(36)}:${hashA}:${hashB}`;
}

function readCached(key: string, code: string): readonly HighlightedLine[] | null {
  return lineCache.get(key)?.find((entry) => entry.code === code)?.lines ?? null;
}

function remember(key: string, code: string, lines: readonly HighlightedLine[]): void {
  const bucket = lineCache.get(key) ?? [];
  const next = [...bucket.filter((entry) => entry.code !== code), { code, lines }];
  lineCache.delete(key);
  lineCache.set(key, next);
  while (lineCache.size > CACHE_LIMIT) {
    const oldest = lineCache.keys().next().value;
    if (oldest === undefined) break;
    lineCache.delete(oldest);
  }
}

export function clearHighlightCache(): void {
  lineCache.clear();
}

export function resolveHighlightLanguage(language: string): LanguageId | null {
  const normalized = language.trim().toLowerCase();
  if (normalized in LANGUAGE_LOADERS) return normalized as LanguageId;
  return LANGUAGE_ALIASES[normalized] ?? null;
}

function toStyleProperty(property: string): string {
  if (property.startsWith(CUSTOM_PROPERTY_PREFIX)) return property;
  return property.replace(KEBAB_BOUNDARY, (_, letter: string) => letter.toUpperCase());
}

function toReactStyle(htmlStyle: Record<string, string> | undefined): CSSProperties {
  if (!htmlStyle) return {};
  const style: Record<string, string> = {};
  for (const [property, value] of Object.entries(htmlStyle)) {
    style[toStyleProperty(property)] = value;
  }
  return style as CSSProperties;
}

async function loadThemes(): Promise<LoadedThemes> {
  const entries = await Promise.all(
    Object.entries(THEME_LOADERS).map(
      async ([name, load]) => [name, (await load()).default] as const,
    ),
  );
  return Object.fromEntries(entries) as LoadedThemes;
}

function resolveHighlighter(): Promise<ResolvedHighlighter> {
  resolvedHighlighter ??= (async () => {
    const themes = await loadThemes();
    const highlighter = await createHighlighterCore({
      themes: Object.values(themes),
      engine: createJavaScriptRegexEngine(),
    });
    return { highlighter, themes };
  })().catch((error: unknown) => {
    resolvedHighlighter = null;
    throw error;
  });
  return resolvedHighlighter;
}

function loadLanguage(highlighter: HighlighterCore, language: LanguageId): Promise<void> {
  let pending = loadedLanguages.get(language);
  if (!pending) {
    pending = highlighter.loadLanguage(LANGUAGE_LOADERS[language]).catch((error: unknown) => {
      loadedLanguages.delete(language);
      throw error;
    });
    loadedLanguages.set(language, pending);
  }
  return pending;
}

export function readHighlightCache(
  code: string,
  language: string,
): readonly HighlightedLine[] | null {
  const resolved = resolveHighlightLanguage(language);
  if (!resolved) return null;
  return readCached(cacheKey(code, resolved), code);
}

export async function highlightToLines(
  code: string,
  language: string,
): Promise<readonly HighlightedLine[] | null> {
  const resolved = resolveHighlightLanguage(language);
  if (!resolved || code.length > MAX_HIGHLIGHT_LENGTH) return null;

  const key = cacheKey(code, resolved);
  const cached = readCached(key, code);
  if (cached) return cached;

  const { highlighter, themes } = await resolveHighlighter();
  await loadLanguage(highlighter, resolved);

  const { tokens } = highlighter.codeToTokens(code, {
    lang: resolved,
    themes,
    defaultColor: false,
    cssVariablePrefix: CSS_VARIABLE_PREFIX,
    tokenizeMaxLineLength: MAX_LINE_LENGTH,
  });

  const lines: readonly HighlightedLine[] = tokens.map((line) =>
    line.map((token) => ({ content: token.content, style: toReactStyle(token.htmlStyle) })),
  );
  remember(key, code, lines);
  return lines;
}
