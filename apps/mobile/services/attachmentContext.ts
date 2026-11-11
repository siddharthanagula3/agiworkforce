import type { MessageAttachment } from '@/types/chat';
import type { ProjectSource } from '@/src/features/projects/store';
import { parseDocument } from '@/services/docParser';

export const ATTACHED_DOC_MAX_CHARS = 100_000;
export const PROJECT_SOURCES_MAX_CHARS = ATTACHED_DOC_MAX_CHARS;

interface DocumentRef {
  name: string;
  uri: string;
  mimeType: string;
}

interface DocumentContext {
  entry: string;
  bodyChars: number;
}

async function readDocumentContext(
  label: string,
  retryAdvice: string,
  file: DocumentRef,
  maxChars: number,
): Promise<DocumentContext> {
  const { name, mimeType } = file;
  try {
    const parsed = await parseDocument(file.uri, mimeType);
    const text = parsed.text.trim();
    if (text.length === 0) {
      return { entry: `[${label}: ${name} (${mimeType}), no extractable text]`, bodyChars: 0 };
    }
    const truncatedBody =
      text.length > maxChars ? `${text.slice(0, maxChars)}\n…[truncated]` : text;
    const body = parsed.metadata.partial
      ? `${truncatedBody}\n…[only part of this file could be read, so some of its text is missing]`
      : truncatedBody;
    return {
      entry: `[${label}: ${name} (${mimeType})]\n${body}`,
      bodyChars: Math.min(text.length, maxChars),
    };
  } catch (error) {
    return {
      entry:
        (error as { code?: unknown } | null)?.code === 'ENCRYPTED_PDF'
          ? `[${label}: ${name} (${mimeType}) is password protected, so its contents cannot be read. Tell the user this file is password protected and ask them to ${retryAdvice} a copy without a password.]`
          : `[${label}: ${name} (${mimeType}), content could not be extracted on-device]`,
      bodyChars: 0,
    };
  }
}

export async function buildAttachedDocumentContext(
  fileUploads: MessageAttachment[],
): Promise<string[]> {
  const context: string[] = [];
  for (const file of fileUploads) {
    const { entry } = await readDocumentContext(
      'Attached file',
      'attach',
      { name: file.fileName ?? 'attached file', uri: file.url, mimeType: file.mimeType },
      ATTACHED_DOC_MAX_CHARS,
    );
    context.push(entry);
  }
  return context;
}

export async function buildProjectSourceContext(
  sources: readonly Pick<ProjectSource, 'name' | 'uri' | 'mimeType'>[],
): Promise<string[]> {
  const context: string[] = [];
  let remaining = PROJECT_SOURCES_MAX_CHARS;
  for (const source of sources) {
    if (remaining <= 0) {
      context.push(
        `[Project source: ${source.name} (${source.mimeType}), left out because the project sources exceed the context budget]`,
      );
      continue;
    }
    const { entry, bodyChars } = await readDocumentContext(
      'Project source',
      'add',
      source,
      Math.min(ATTACHED_DOC_MAX_CHARS, remaining),
    );
    remaining -= bodyChars;
    context.push(entry);
  }
  return context;
}
