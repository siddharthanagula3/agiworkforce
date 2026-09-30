import type { MessageAttachment } from '@/types/chat';
import { parseDocument } from '@/services/docParser';

export const ATTACHED_DOC_MAX_CHARS = 100_000;

export async function buildAttachedDocumentContext(
  fileUploads: MessageAttachment[],
): Promise<string[]> {
  const context: string[] = [];
  for (const file of fileUploads) {
    const name = file.fileName ?? 'attached file';
    try {
      const parsed = await parseDocument(file.url, file.mimeType);
      const text = parsed.text.trim();
      if (text.length === 0) {
        context.push(`[Attached file: ${name} (${file.mimeType}), no extractable text]`);
        continue;
      }
      const body =
        text.length > ATTACHED_DOC_MAX_CHARS
          ? `${text.slice(0, ATTACHED_DOC_MAX_CHARS)}\n…[truncated]`
          : text;
      context.push(`[Attached file: ${name} (${file.mimeType})]\n${body}`);
    } catch (error) {
      context.push(
        (error as { code?: unknown } | null)?.code === 'ENCRYPTED_PDF'
          ? `[Attached file: ${name} (${file.mimeType}) is password protected, so its contents cannot be read. Tell the user this file is password protected and ask them to attach a copy without a password.]`
          : `[Attached file: ${name} (${file.mimeType}), content could not be extracted on-device]`,
      );
    }
  }
  return context;
}
