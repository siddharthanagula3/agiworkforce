import type { ManagedCloudArtifactIndexEntry } from '@agiworkforce/cloud-contracts';

const ARTIFACT_FAILURE_REASON_MAX_LENGTH = 240;

const ARTIFACT_TYPE_ICONS: Record<string, string> = {
  html: 'browser',
  react: 'symbol-namespace',
  svg: 'symbol-color',
  mermaid: 'type-hierarchy',
  code: 'file-code',
};

/**
 * Fence languages that do not already spell a VS Code language id. Anything
 * absent is passed through, which is what `setTextDocumentLanguage` expects.
 */
const EDITOR_LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascriptreact',
  ts: 'typescript',
  tsx: 'typescriptreact',
  react: 'typescriptreact',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  yml: 'yaml',
  md: 'markdown',
  htm: 'html',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  golang: 'go',
  kt: 'kotlin',
  text: 'plaintext',
  txt: 'plaintext',
};

const ARTIFACT_TYPE_LANGUAGES: Record<string, string> = {
  html: 'html',
  react: 'typescriptreact',
  svg: 'xml',
  mermaid: 'markdown',
};

const ARTIFACT_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  javascriptreact: 'jsx',
  typescript: 'ts',
  typescriptreact: 'tsx',
  python: 'py',
  ruby: 'rb',
  rust: 'rs',
  shellscript: 'sh',
  markdown: 'md',
  plaintext: 'txt',
  csharp: 'cs',
  kotlin: 'kt',
  yaml: 'yaml',
  html: 'html',
  xml: 'svg',
  json: 'json',
  css: 'css',
  go: 'go',
  java: 'java',
  cpp: 'cpp',
  sql: 'sql',
};

export function artifactTitle(artifact: ManagedCloudArtifactIndexEntry): string {
  return artifact.title?.trim() || `Untitled ${artifact.type}`;
}

export function artifactIcon(artifact: ManagedCloudArtifactIndexEntry): string {
  return ARTIFACT_TYPE_ICONS[artifact.type] ?? 'file-code';
}

export function formatTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
}

export function artifactEditorLanguage(artifact: ManagedCloudArtifactIndexEntry): string {
  const fence = artifact.language?.trim().toLowerCase();
  if (fence !== undefined && fence !== '' && fence !== 'text') {
    return EDITOR_LANGUAGE_ALIASES[fence] ?? fence;
  }
  return ARTIFACT_TYPE_LANGUAGES[artifact.type] ?? 'plaintext';
}

export function artifactFileExtension(artifact: ManagedCloudArtifactIndexEntry): string {
  const language = artifactEditorLanguage(artifact);
  return ARTIFACT_EXTENSIONS[language] ?? 'txt';
}

export function artifactFileName(artifact: ManagedCloudArtifactIndexEntry): string {
  const base = artifactTitle(artifact)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)
    .toLowerCase();
  return `${base === '' ? 'artifact' : base}.${artifactFileExtension(artifact)}`;
}

export function artifactDescription(
  artifact: ManagedCloudArtifactIndexEntry,
  published: boolean,
): string {
  const parts = [artifact.type];
  if (artifact.language !== null && artifact.language !== '') parts.push(artifact.language);
  parts.push(formatTimestamp(artifact.createdAt));
  if (published) parts.push('published');
  return parts.join(' · ');
}

export function artifactTooltipLines(
  artifact: ManagedCloudArtifactIndexEntry,
  published: boolean,
): string[] {
  const lines = [
    artifactTitle(artifact),
    artifactDescription(artifact, published),
    `Opens read-only, re-derived from the message that produced it`,
  ];
  if (published) lines.push('A published copy of this artifact has a public link.');
  return lines;
}

export function artifactContextValue(published: boolean): string {
  return published ? 'artifactPublished' : 'artifact';
}

export function describeArtifactFailure(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 401) return 'your AGI Cloud session expired, sign in again';
  if (status === 403) return 'this account cannot read artifacts on its current plan';
  if (status === 404) return 'the conversation that produced it no longer exists';
  if (status === 429) return 'AGI Cloud is rate limiting this account, try again shortly';
  if (status === 503) return 'artifact publishing is not configured in this environment';
  const raw = error instanceof Error ? error.message.trim() : String(error).trim();
  if (raw === '') return 'AGI Cloud gave no reason';
  return raw.length <= ARTIFACT_FAILURE_REASON_MAX_LENGTH
    ? raw
    : `${raw.slice(0, ARTIFACT_FAILURE_REASON_MAX_LENGTH - 1)}…`;
}
