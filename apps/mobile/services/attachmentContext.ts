import type { MessageAttachment } from '@/types/chat';
import { parseDocument } from '@/services/docParser';

/** Cap per-file extracted text so a large attachment cannot blow the prompt budget. */
export const ATTACHED_DOC_MAX_CHARS = 100_000;

/**
 * Extract real text from non-image attachments (pdf/txt/md/csv/code) using the
 * shared on-device docParser, so a document actually reaches the model instead of
 * a bare "[Attached file: …]" reference stub. Binary/unsupported formats (e.g.
 * docx, zip) fail closed to an HONEST reference — never fabricated content.
 */
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
        context.push(`[Attached file: ${name} (${file.mimeType}) — no extractable text]`);
        continue;
      }
      const body =
        text.length > ATTACHED_DOC_MAX_CHARS
          ? `${text.slice(0, ATTACHED_DOC_MAX_CHARS)}\n…[truncated]`
          : text;
      context.push(`[Attached file: ${name} (${file.mimeType})]\n${body}`);
    } catch {
      // Unsupported/binary (docx, zip, …) or unreadable — honest reference only.
      context.push(
        `[Attached file: ${name} (${file.mimeType}) — content could not be extracted on-device]`,
      );
    }
  }
  return context;
}
