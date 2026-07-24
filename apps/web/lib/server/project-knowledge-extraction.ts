import 'server-only';

import { createHash } from 'node:crypto';
import { isTextAttachmentMeta } from '@agiworkforce/types';
import { getObject, objectKeyFromStorageUri } from './object-storage';

export const MAX_EXTRACTED_PROJECT_TEXT_CHARS = 200_000;
const MAX_PDF_PAGES = 250;

type ExtractionErrorCode =
  | 'invalid_storage_uri'
  | 'object_missing'
  | 'byte_count_mismatch'
  | 'checksum_mismatch'
  | 'content_type_mismatch'
  | 'document_too_complex'
  | 'document_unreadable';

export class ProjectKnowledgeExtractionError extends Error {
  constructor(
    readonly code: ExtractionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectKnowledgeExtractionError';
  }
}

interface ExtractProjectKnowledgeFileInput {
  projectId: string;
  storageUri: string;
  fileName: string;
  mimeType: string;
  byteCount: number;
  checksumSha256: string;
}

function normalizeAndBoundText(value: string): string | null {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return null;
  if (normalized.length <= MAX_EXTRACTED_PROJECT_TEXT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_EXTRACTED_PROJECT_TEXT_CHARS)}\n\n[Content truncated during extraction.]`;
}

async function extractPdfText(data: Buffer): Promise<string | null> {
  if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new ProjectKnowledgeExtractionError(
      'document_unreadable',
      'The uploaded PDF could not be read.',
    );
  }

  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({
      data: new Uint8Array(data),
      useWorkerFetch: false,
      verbosity: 0,
    });
    const document = await loadingTask.promise;
    try {
      if (document.numPages > MAX_PDF_PAGES) {
        throw new ProjectKnowledgeExtractionError(
          'document_too_complex',
          `PDFs are limited to ${MAX_PDF_PAGES} pages for project knowledge extraction.`,
        );
      }

      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .filter(Boolean)
          .join(' ')
          .trim();
        if (text) pages.push(text);
      }
      return normalizeAndBoundText(pages.join('\n\n'));
    } finally {
      await document.destroy();
    }
  } catch (error) {
    if (error instanceof ProjectKnowledgeExtractionError) throw error;
    throw new ProjectKnowledgeExtractionError(
      'document_unreadable',
      'The uploaded PDF could not be read.',
    );
  }
}

/**
 * Load one object from the server-owned project prefix, verify its browser
 * checksum and declared metadata, then extract bounded text when supported.
 */
export async function extractProjectKnowledgeFile(
  input: ExtractProjectKnowledgeFileInput,
): Promise<{ extractedText: string | null }> {
  const objectKey = objectKeyFromStorageUri(input.storageUri);
  const expectedPrefix = `knowledge-files/projects/${input.projectId}/`;
  if (!objectKey || !objectKey.startsWith(expectedPrefix)) {
    throw new ProjectKnowledgeExtractionError(
      'invalid_storage_uri',
      'The uploaded file location is invalid. Upload the file again.',
    );
  }

  const object = await getObject(objectKey);
  if (!object) {
    throw new ProjectKnowledgeExtractionError(
      'object_missing',
      'The uploaded file could not be found. Upload the file again.',
    );
  }
  if (object.data.byteLength !== input.byteCount) {
    throw new ProjectKnowledgeExtractionError(
      'byte_count_mismatch',
      'The uploaded file did not pass its integrity check. Upload it again.',
    );
  }

  const actualChecksum = createHash('sha256').update(object.data).digest('hex');
  if (actualChecksum !== input.checksumSha256.toLowerCase()) {
    throw new ProjectKnowledgeExtractionError(
      'checksum_mismatch',
      'The uploaded file did not pass its integrity check. Upload it again.',
    );
  }

  const actualMimeType = object.contentType?.split(';', 1)[0]?.trim().toLowerCase();
  const declaredMimeType = input.mimeType.trim().toLowerCase();
  if (actualMimeType && actualMimeType !== declaredMimeType) {
    throw new ProjectKnowledgeExtractionError(
      'content_type_mismatch',
      'The uploaded file type did not match the selected file. Upload it again.',
    );
  }

  if (declaredMimeType === 'application/pdf') {
    return { extractedText: await extractPdfText(object.data) };
  }
  if (isTextAttachmentMeta(input.fileName, declaredMimeType)) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(object.data);
      return { extractedText: normalizeAndBoundText(text) };
    } catch {
      throw new ProjectKnowledgeExtractionError(
        'document_unreadable',
        `The text in ${input.fileName} is not valid UTF-8.`,
      );
    }
  }

  return { extractedText: null };
}
