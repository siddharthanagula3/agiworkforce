import 'server-only';

import { AGENT_FILE_MAX_BYTES } from '@agiworkforce/cloud-contracts';

import { createError } from '@/lib/errors';
import {
  extractOfficeDocumentText,
  officeDocumentKind,
  OfficeDocumentUnreadableError,
} from '@/lib/server/office-document-text';
import {
  extractPdfAttachmentContent,
  PdfAttachmentUnreadableError,
} from '@/lib/server/pdf-attachment-content';

const PDF_MIME = 'application/pdf';
const PLAIN_TEXT_MIME = 'text/plain';
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sh',
  'sql',
  'toml',
  'ini',
  'log',
  'tex',
  'rst',
]);

export const AGENT_FILE_UNSUPPORTED_MESSAGE =
  'Add a text, Markdown, CSV, JSON, code, PDF, Word, Excel or PowerPoint file.';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function agentFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop()?.trim() ?? '';
  if (!base || base.length > 200) throw createError.validation('Give the file a shorter name.');
  return base;
}

function decodeUtf8(bytes: Uint8Array, name: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw createError.validation(`${name} is not readable text.`);
  }
}

function bounded(text: string, name: string): string {
  const trimmed = text.split(String.fromCharCode(0)).join('').trim();
  if (!trimmed) throw createError.validation(`${name} has no text an agent can read.`);
  if (Buffer.byteLength(trimmed, 'utf8') > AGENT_FILE_MAX_BYTES) {
    throw createError.validation(
      `${name} has more text than an agent file holds (${Math.round(AGENT_FILE_MAX_BYTES / 1000)} KB).`,
    );
  }
  return trimmed;
}

export async function agentFileText(
  bytes: Uint8Array,
  name: string,
  mimeType: string,
): Promise<{ content: string; mimeType: string }> {
  const office = officeDocumentKind(name, mimeType);
  try {
    if (office) {
      return {
        content: bounded(await extractOfficeDocumentText(Buffer.from(bytes), name, office), name),
        mimeType,
      };
    }
    if (mimeType === PDF_MIME || extensionOf(name) === 'pdf') {
      const pdf = await extractPdfAttachmentContent(Buffer.from(bytes), name);
      return { content: bounded(pdf.text ?? '', name), mimeType: PDF_MIME };
    }
  } catch (error) {
    if (
      error instanceof OfficeDocumentUnreadableError ||
      error instanceof PdfAttachmentUnreadableError
    ) {
      throw createError.validation(`${name} could not be read.`);
    }
    throw error;
  }
  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extensionOf(name))) {
    return {
      content: bounded(decodeUtf8(bytes, name), name),
      mimeType: mimeType.startsWith('text/') ? mimeType : PLAIN_TEXT_MIME,
    };
  }
  throw createError.validation(AGENT_FILE_UNSUPPORTED_MESSAGE);
}
