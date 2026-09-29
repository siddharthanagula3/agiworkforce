import {
  exportSourceFile,
  exportToDocx,
  exportToMarkdown,
  exportToPDF,
  exportToText,
} from '@/services/fileCreation';
import type { Artifact } from '@/types/chat';

export type ArtifactExportFormat = 'markdown' | 'pdf' | 'docx' | 'text' | 'source';

export interface ArtifactExportOption {
  format: ArtifactExportFormat;
  label: string;
  detail: string;
  extension: string;
}

const SOURCE_EXTENSIONS: Readonly<Record<string, string>> = {
  html: 'html',
  htm: 'html',
  svg: 'svg',
  css: 'css',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  python: 'py',
  py: 'py',
  json: 'json',
  csv: 'csv',
  tsv: 'tsv',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  xml: 'xml',
  sql: 'sql',
  graphql: 'graphql',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  zsh: 'sh',
  java: 'java',
  kotlin: 'kt',
  swift: 'swift',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  cs: 'cs',
  scala: 'scala',
  dart: 'dart',
  lua: 'lua',
  r: 'r',
  mermaid: 'mmd',
};

const MARKDOWN_LANGUAGES = new Set(['markdown', 'md', 'mdx']);
const PLAIN_TEXT_LANGUAGES = new Set(['text', 'txt', 'plaintext']);

function languageOf(artifact: Pick<Artifact, 'language'>): string {
  return artifact.language?.trim().toLowerCase() ?? '';
}

export function artifactSourceExtension(language: string | undefined): string {
  return SOURCE_EXTENSIONS[language?.trim().toLowerCase() ?? ''] ?? 'txt';
}

export function artifactExportOptions(
  artifact: Pick<Artifact, 'type' | 'language'>,
): ArtifactExportOption[] {
  const language = languageOf(artifact);
  if (PLAIN_TEXT_LANGUAGES.has(language)) {
    return [
      { format: 'text', label: 'Plain text', detail: 'A .txt file', extension: 'txt' },
      { format: 'pdf', label: 'PDF', detail: 'A document you can print', extension: 'pdf' },
    ];
  }
  if (
    artifact.type === 'document' ||
    artifact.type === 'research' ||
    MARKDOWN_LANGUAGES.has(language)
  ) {
    return [
      {
        format: 'markdown',
        label: 'Markdown',
        detail: 'A .md file that keeps the formatting',
        extension: 'md',
      },
      { format: 'pdf', label: 'PDF', detail: 'A styled document', extension: 'pdf' },
      { format: 'docx', label: 'Word', detail: 'A .docx document you can edit', extension: 'docx' },
      { format: 'text', label: 'Plain text', detail: 'A .txt file', extension: 'txt' },
    ];
  }
  const extension = artifactSourceExtension(language);
  return [
    {
      format: 'source',
      label: `${extension.toUpperCase()} file`,
      detail: `The source exactly as written, as a .${extension} file`,
      extension,
    },
  ];
}

export async function exportArtifact(
  content: string,
  title: string,
  option: ArtifactExportOption,
): Promise<string> {
  switch (option.format) {
    case 'markdown':
      return (await exportToMarkdown(content, title)).uri;
    case 'pdf':
      return (await exportToPDF(content, title)).uri;
    case 'docx':
      return (await exportToDocx(content, title)).uri;
    case 'text':
      return (await exportToText(content, title)).uri;
    case 'source':
      return (await exportSourceFile(content, title, option.extension)).uri;
  }
}
