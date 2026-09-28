import { resolveHighlightLanguage, type LanguageId } from './shikiHighlighter';

const CODE_FILE_BASE_NAME = 'code';
const PLAIN_TEXT_EXTENSION = 'txt';

const HIGHLIGHT_LANGUAGE_EXTENSIONS: Readonly<Record<LanguageId, string>> = {
  bash: 'sh',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  css: 'css',
  diff: 'diff',
  docker: 'dockerfile',
  elixir: 'ex',
  go: 'go',
  graphql: 'graphql',
  haskell: 'hs',
  html: 'html',
  ini: 'ini',
  java: 'java',
  javascript: 'js',
  json: 'json',
  jsx: 'jsx',
  kotlin: 'kt',
  latex: 'tex',
  less: 'less',
  lua: 'lua',
  makefile: 'mk',
  markdown: 'md',
  nginx: 'conf',
  'objective-c': 'm',
  perl: 'pl',
  php: 'php',
  powershell: 'ps1',
  prisma: 'prisma',
  proto: 'proto',
  python: 'py',
  r: 'r',
  ruby: 'rb',
  rust: 'rs',
  scala: 'scala',
  scss: 'scss',
  sql: 'sql',
  svelte: 'svelte',
  swift: 'swift',
  terraform: 'tf',
  toml: 'toml',
  tsx: 'tsx',
  typescript: 'ts',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  zig: 'zig',
};

const WHOLE_FILE_NAMES: Readonly<Partial<Record<LanguageId, string>>> = {
  docker: 'Dockerfile',
  makefile: 'Makefile',
};

const EXTENSION_LANGUAGE_TOKENS: ReadonlySet<string> = new Set([
  'cc',
  'cjs',
  'cts',
  'cxx',
  'exs',
  'h',
  'hcl',
  'hpp',
  'htm',
  'json5',
  'jsonc',
  'jsonl',
  'kts',
  'mdx',
  'mjs',
  'mts',
  'patch',
  'properties',
  'sass',
  'svg',
  'tfvars',
  'xsl',
  'yml',
  'zsh',
]);

const UNHIGHLIGHTED_LANGUAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  clojure: 'clj',
  csv: 'csv',
  dart: 'dart',
  elm: 'elm',
  erlang: 'erl',
  fsharp: 'fs',
  groovy: 'groovy',
  julia: 'jl',
  matlab: 'm',
  ocaml: 'ml',
  plaintext: PLAIN_TEXT_EXTENSION,
  solidity: 'sol',
  text: PLAIN_TEXT_EXTENSION,
  tsv: 'tsv',
  txt: PLAIN_TEXT_EXTENSION,
  vb: 'vb',
};

export interface CodeFile {
  readonly fileName: string;
  readonly extension: string;
}

export function codeFileFor(language: string): CodeFile {
  const token = language.trim().toLowerCase();
  const resolved = resolveHighlightLanguage(token);
  const wholeName = resolved ? WHOLE_FILE_NAMES[resolved] : undefined;
  if (wholeName) return { fileName: wholeName, extension: '' };

  const extension = EXTENSION_LANGUAGE_TOKENS.has(token)
    ? token
    : resolved
      ? HIGHLIGHT_LANGUAGE_EXTENSIONS[resolved]
      : (UNHIGHLIGHTED_LANGUAGE_EXTENSIONS[token] ?? PLAIN_TEXT_EXTENSION);
  return { fileName: `${CODE_FILE_BASE_NAME}.${extension}`, extension };
}
