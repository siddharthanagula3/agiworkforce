import { bareMediaType, documentClassFor } from '@agiworkforce/types';
import { getDurableGeneratedImageAssetId } from '@/src/features/image/services/imagegen';
import { API_URL } from '@/lib/constants';
import type { Artifact } from '@/types/chat';
import { isDeckArtifact } from './presentation/deckContent';
import { studyArtifactContent } from './study/studyContent';

export type ArtifactViewerKind = 'image' | 'document' | 'table' | 'text' | 'deck' | 'study';

export interface InlineViewerSource {
  title: string;
  content: string;
  language?: string;
}

export interface FileViewerSource {
  title: string;
  fileName: string;
  mimeType: string;
  url: string;
  byteCount?: number;
}

export type ArtifactViewerSource =
  ({ origin: 'inline' } & InlineViewerSource) | ({ origin: 'file' } & FileViewerSource);

const TABLE_LANGUAGES: ReadonlySet<string> = new Set(['csv', 'tsv', 'spreadsheet', 'table']);
const TABLE_CLASSES: ReadonlySet<string> = new Set(['csv', 'tsv']);

export function storedImagePath(url: string): string | null {
  if (url.startsWith('file://')) return url;
  const base = API_URL.replace(/\/+$/, '');
  const path = url.startsWith(`${base}/`) ? url.slice(base.length) : url;
  return getDurableGeneratedImageAssetId(path) ? path : null;
}

function inlineKind(source: InlineViewerSource): ArtifactViewerKind | null {
  const language = source.language?.trim().toLowerCase() ?? '';
  if (TABLE_LANGUAGES.has(language)) return 'table';
  if (studyArtifactContent(language, source.content) !== null) return 'study';
  if (isDeckArtifact(language, source.content)) return 'deck';
  return null;
}

function fileKind(source: FileViewerSource): ArtifactViewerKind | null {
  if (bareMediaType(source.mimeType).startsWith('image/')) {
    return storedImagePath(source.url) ? 'image' : null;
  }
  const documentClass = documentClassFor(source.fileName, source.mimeType);
  if (!documentClass) return null;
  if (documentClass.extractor === 'pdf' || documentClass.extractor === 'office') return 'document';
  return TABLE_CLASSES.has(documentClass.id) ? 'table' : 'text';
}

export function isWorkbookFile(source: FileViewerSource): boolean {
  return documentClassFor(source.fileName, source.mimeType)?.id === 'xlsx';
}

export function artifactViewerKind(source: ArtifactViewerSource): ArtifactViewerKind | null {
  return source.origin === 'inline' ? inlineKind(source) : fileKind(source);
}

export function viewerSourceForArtifact(artifact: Artifact): ArtifactViewerSource {
  const file = artifact.generatedFile;
  if (file?.uri) {
    return {
      origin: 'file',
      title: artifact.title || file.fileName,
      fileName: file.fileName,
      mimeType: file.mimeType,
      url: file.uri,
      byteCount: file.byteCount,
    };
  }
  return {
    origin: 'inline',
    title: artifact.title,
    content: artifact.content,
    ...(artifact.language ? { language: artifact.language } : {}),
  };
}
