import { spreadsheetSafeExport } from './tabular';
import type { Artifact } from './types';

// keep in step with ArtifactRenderer.getFileExtension: the two resolvers must name the
// same file for the same artifact, or one sink writes .csv while the other writes .txt
const TYPE_EXTENSIONS: Record<string, string> = {
  html: 'html',
  react: 'tsx',
  markdown: 'md',
  json: 'json',
  svg: 'svg',
  document: 'md',
  image: 'png',
  spreadsheet: 'csv',
  table: 'csv',
  csv: 'csv',
};

function artifactDownloadExtension(artifact: Artifact): string {
  return TYPE_EXTENSIONS[artifact.type] ?? artifact.language ?? 'txt';
}

function artifactDownloadFileName(artifact: Artifact): string {
  const slug = (artifact.title ?? 'artifact').replace(/\s+/g, '-').toLowerCase();
  return `${slug}.${artifactDownloadExtension(artifact)}`;
}

export interface ArtifactDownload {
  blob: Blob;
  fileName: string;
}

// artifact.language is model-controlled, so any download naming itself .csv/.tsv/.slk/.xls
// must go through the spreadsheet neutralizer before the bytes reach disk
export function artifactDownloadFile(artifact: Artifact): ArtifactDownload {
  const { body, mimeType } = spreadsheetSafeExport(
    artifact.content,
    artifactDownloadExtension(artifact),
  );
  return {
    blob: new Blob([body], { type: mimeType }),
    fileName: artifactDownloadFileName(artifact),
  };
}
