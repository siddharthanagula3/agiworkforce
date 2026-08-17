import 'server-only';

import { isTextAttachmentMeta, MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { matchDenylistedUpload } from '@/lib/moderation';
import { scanUploadBytes, type UploadScanFinding } from '@/lib/security/upload-scan';
import { objectKeyFromStorageUri, StoredObjectTooLargeError } from './object-storage';
import { getProjectKnowledgeObject } from './project-knowledge-object-storage';

export const MAX_EXTRACTED_PROJECT_TEXT_CHARS = 200_000;
const MAX_PDF_PAGES = 250;

type ExtractionErrorCode =
  | 'invalid_storage_uri'
  | 'object_missing'
  | 'byte_count_mismatch'
  | 'checksum_mismatch'
  | 'content_type_mismatch'
  | 'content_rejected'
  | 'known_illegal_media'
  | 'document_too_complex'
  | 'document_unreadable';

export interface ExtractionRejectionDetail {
  sha256?: string;
  listLabel?: string;
  findings?: readonly UploadScanFinding[];
}

export class ProjectKnowledgeExtractionError extends Error {
  constructor(
    readonly code: ExtractionErrorCode,
    message: string,
    readonly detail: ExtractionRejectionDetail = {},
  ) {
    super(message);
    this.name = 'ProjectKnowledgeExtractionError';
  }
}

const KNOWLEDGE_FILE_REJECTION_MESSAGE =
  'This file could not be added because its contents failed a safety check.';

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
    try {
      const document = await loadingTask.promise;
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
      await loadingTask.destroy();
    }
  } catch (error) {
    if (error instanceof ProjectKnowledgeExtractionError) throw error;
    throw new ProjectKnowledgeExtractionError(
      'document_unreadable',
      'The uploaded PDF could not be read.',
    );
  }
}

function extractNotebookText(bytes: Uint8Array, fileName: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ProjectKnowledgeExtractionError(
      'document_unreadable',
      `${fileName} is not a readable Jupyter notebook.`,
    );
  }

  const cells = (parsed as { cells?: unknown })?.cells;
  if (!Array.isArray(cells)) {
    throw new ProjectKnowledgeExtractionError(
      'document_unreadable',
      `${fileName} does not contain notebook cells.`,
    );
  }

  const joinSource = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.filter((line) => typeof line === 'string').join('');
    return '';
  };

  const parts: string[] = [];
  for (const rawCell of cells) {
    if (!rawCell || typeof rawCell !== 'object') continue;
    const cell = rawCell as { cell_type?: unknown; source?: unknown; outputs?: unknown };
    const source = joinSource(cell.source).trim();

    if (cell.cell_type === 'markdown') {
      if (source) parts.push(source);
      continue;
    }

    if (cell.cell_type === 'code') {
      if (source) parts.push(['```', source, '```'].join('\n'));

      if (Array.isArray(cell.outputs)) {
        for (const rawOutput of cell.outputs) {
          if (!rawOutput || typeof rawOutput !== 'object') continue;
          const output = rawOutput as {
            text?: unknown;
            data?: Record<string, unknown>;
            ename?: unknown;
            evalue?: unknown;
          };

          const stream = joinSource(output.text).trim();
          if (stream) parts.push(`Output:\n${stream}`);

          const plain = joinSource(output.data?.['text/plain']).trim();
          if (plain) parts.push(`Output:\n${plain}`);

          if (typeof output.ename === 'string' && output.ename) {
            const detail = typeof output.evalue === 'string' ? `: ${output.evalue}` : '';
            parts.push(`Error: ${output.ename}${detail}`);
          }
        }
      }
    }
  }

  const text = parts.join('\n\n').trim();
  return text.length > 0 ? normalizeAndBoundText(text) : null;
}

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

  if (
    !Number.isSafeInteger(input.byteCount) ||
    input.byteCount <= 0 ||
    input.byteCount > MAX_ATTACHMENT_BYTES
  ) {
    throw new ProjectKnowledgeExtractionError(
      'byte_count_mismatch',
      'The uploaded file did not pass its integrity check. Upload it again.',
    );
  }

  let object: { data: Buffer; contentType: string | undefined } | null;
  try {
    object = await getProjectKnowledgeObject(objectKey, input.byteCount);
  } catch (error) {
    if (!(error instanceof StoredObjectTooLargeError)) throw error;
    throw new ProjectKnowledgeExtractionError(
      'byte_count_mismatch',
      'The uploaded file did not pass its integrity check. Upload it again.',
    );
  }
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

  const hashMatch = matchDenylistedUpload(object.data);
  if (hashMatch.sha256 !== input.checksumSha256.toLowerCase()) {
    throw new ProjectKnowledgeExtractionError(
      'checksum_mismatch',
      'The uploaded file did not pass its integrity check. Upload it again.',
    );
  }
  if (hashMatch.matched) {
    throw new ProjectKnowledgeExtractionError(
      'known_illegal_media',
      KNOWLEDGE_FILE_REJECTION_MESSAGE,
      {
        sha256: hashMatch.sha256,
        ...(hashMatch.listLabel ? { listLabel: hashMatch.listLabel } : {}),
      },
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

  const scan = await scanUploadBytes(object.data, declaredMimeType);
  if (!scan.ok) {
    throw new ProjectKnowledgeExtractionError(
      'content_rejected',
      KNOWLEDGE_FILE_REJECTION_MESSAGE,
      { sha256: hashMatch.sha256, findings: scan.findings },
    );
  }

  if (declaredMimeType === 'application/pdf') {
    return { extractedText: await extractPdfText(object.data) };
  }
  if (declaredMimeType === 'application/x-ipynb+json') {
    return { extractedText: extractNotebookText(object.data, input.fileName) };
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
