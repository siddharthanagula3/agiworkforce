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

/**
 * Load one object from the server-owned project prefix, verify its browser
 * checksum and declared metadata, then extract bounded text when supported.
 */
/**
 * Pull the readable content out of a Jupyter notebook.
 *
 * A `.ipynb` is JSON, so it would technically survive the text path — but that
 * path would feed the model the notebook's ENTIRE serialized form: base64 PNG
 * outputs, execution counts, kernel metadata, per-cell ids. On a notebook with
 * a few plots that is megabytes of noise that crowds out the actual analysis
 * and burns the project's context budget.
 *
 * This keeps what a reader cares about — markdown prose, source code, and
 * TEXT outputs — and drops the rest. Cell order is preserved because a
 * notebook's meaning is sequential.
 */
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

  /** `source` and `text` are either a string or an array of lines. */
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

      // Text outputs only. An image output is a base64 blob that means nothing
      // to a text model and would dwarf the code that produced it.
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

          // Errors are frequently the most informative part of a notebook.
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
