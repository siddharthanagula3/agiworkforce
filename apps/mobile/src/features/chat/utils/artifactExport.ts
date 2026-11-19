import {
  exportHtmlToPDF,
  exportSourceFile,
  exportToDocx,
  exportToMarkdown,
  exportToPDF,
  exportToText,
} from '@/services/fileCreation';
import { isDeckArtifact } from '@/src/features/chat/components/artifact-viewers/presentation/deckContent';
import {
  DECK_PDF_PAGE_HEIGHT,
  DECK_PDF_PAGE_WIDTH,
  deckPrintHtml,
} from '@/src/features/chat/components/artifact-viewers/presentation/deckPrint';
import { codeFileFor } from '@agiworkforce/unified-chat/code-file-name';
import { spreadsheetSafeExport } from '@agiworkforce/unified-chat/tabular';
import type { Artifact } from '@/types/chat';

export type ArtifactExportFormat = 'markdown' | 'pdf' | 'docx' | 'text' | 'source';

export interface ArtifactExportOption {
  format: ArtifactExportFormat;
  label: string;
  detail: string;
  extension: string;
  fileName?: string;
  slides?: boolean;
}

const MARKDOWN_LANGUAGES = new Set(['markdown', 'md', 'mdx']);
const PLAIN_TEXT_LANGUAGES = new Set(['text', 'txt', 'plaintext']);

function languageOf(artifact: Pick<Artifact, 'language'>): string {
  return artifact.language?.trim().toLowerCase() ?? '';
}

function sourceFileFor(language: string): { extension: string; fileName?: string } {
  const file = codeFileFor(language);
  if (file.extension === '') return { extension: '', fileName: file.fileName };
  return { extension: file.extension };
}

export function artifactSourceExtension(language: string | undefined): string {
  return sourceFileFor(language?.trim().toLowerCase() ?? '').extension;
}

export const DRAWN_DIAGRAM_EXPORT: ArtifactExportOption = {
  format: 'source',
  label: 'SVG image',
  detail: 'The drawn diagram as an .svg file',
  extension: 'svg',
};

export function artifactExportOptions(
  artifact: Pick<Artifact, 'type' | 'language'>,
  content?: string,
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
    if (content !== undefined && isDeckArtifact(artifact.language, content)) {
      return [
        {
          format: 'pdf',
          label: 'PDF',
          detail: 'The slides, one per page',
          extension: 'pdf',
          slides: true,
        },
        {
          format: 'markdown',
          label: 'Markdown',
          detail: 'A .md file that keeps the formatting',
          extension: 'md',
        },
        { format: 'text', label: 'Plain text', detail: 'A .txt file', extension: 'txt' },
      ];
    }
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
  const { extension, fileName } = sourceFileFor(language);
  if (fileName) {
    return [
      {
        format: 'source',
        label: fileName,
        detail: `The source exactly as written, as ${fileName}`,
        extension,
        fileName,
      },
    ];
  }
  return [
    {
      format: 'source',
      label: `${extension.toUpperCase()} file`,
      detail: `The source exactly as written, as a .${extension} file`,
      extension,
    },
  ];
}

function exportDeckToPDF(content: string, title: string) {
  const html = deckPrintHtml(content);
  if (!html) throw new Error('Cannot export empty content');
  return exportHtmlToPDF(html, title, { width: DECK_PDF_PAGE_WIDTH, height: DECK_PDF_PAGE_HEIGHT });
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
      return option.slides
        ? (await exportDeckToPDF(content, title)).uri
        : (await exportToPDF(content, title)).uri;
    case 'docx':
      return (await exportToDocx(content, title)).uri;
    case 'text':
      return (await exportToText(content, title)).uri;
    case 'source':
      return (
        await exportSourceFile(
          spreadsheetSafeExport(content, option.extension).body,
          option.fileName ?? title,
          option.extension,
        )
      ).uri;
  }
}
