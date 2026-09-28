import { Packer } from 'docx';
import { markdownToDocumentBlocks } from '@agiworkforce/unified-chat/markdown-document';
import type { DocumentFormat } from '../types/message-metadata';
import { buildDocxDocument } from './export-docx';
import { renderPdfDocument } from './export-pdf';

export interface ExportOptions {
  title?: string;
  author?: string;
  metadata?: Record<string, string>;
  pageBreaks?: number[];
}

export async function downloadAsMarkdown(
  content: string,
  filename: string = 'document.md',
  options?: ExportOptions,
): Promise<void> {
  let finalContent = content;
  if (options?.metadata) {
    const metadataHeader = Object.entries(options.metadata)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    finalContent = `---\n${metadataHeader}\n---\n\n${content}`;
  }

  const blob = new Blob([finalContent], { type: 'text/markdown' });
  downloadBlob(blob, filename);
}

export async function downloadAsPDF(
  content: string,
  filename: string = 'document.pdf',
  options?: ExportOptions,
): Promise<void> {
  const pdf = renderPdfDocument(markdownToDocumentBlocks(content), {
    title: options?.title,
    author: options?.author,
    date: new Date().toLocaleDateString(),
  });
  pdf.save(filename);
}

export async function downloadAsDOCX(
  content: string,
  filename: string = 'document.docx',
  options?: ExportOptions,
): Promise<void> {
  const doc = buildDocxDocument(markdownToDocumentBlocks(content), {
    title: options?.title,
    author: options?.author,
    date: new Date().toLocaleDateString(),
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportDocument(
  content: string,
  format: DocumentFormat,
  filename: string,
  options?: ExportOptions,
): Promise<void> {
  const baseFilename = filename.replace(/\.(md|pdf|docx)$/, '');

  switch (format) {
    case 'markdown':
      await downloadAsMarkdown(content, `${baseFilename}.md`, options);
      break;
    case 'pdf':
      await downloadAsPDF(content, `${baseFilename}.pdf`, options);
      break;
    case 'docx':
      await downloadAsDOCX(content, `${baseFilename}.docx`, options);
      break;
  }
}

export const documentExportService = {
  downloadAsMarkdown,
  downloadAsPDF,
  downloadAsDOCX,
  exportDocument,
};
