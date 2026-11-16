import { artifactKindLabel, extractArtifactTitle } from '@agiworkforce/artifacts';
import {
  studyArtifactContent,
  studyArtifactTitle,
  studySummary,
} from '@/src/features/chat/components/artifact-viewers/study/studyContent';

export interface TitledArtifactSource {
  type: string;
  content: string;
  language?: string;
}

const NAMING_MARKUP = /<title[\s>]|@title|<h1[\s>]/gi;
const TEMPLATE_EXPRESSION = /^\{|\{[^{}]*\}/;
const HEADING_OR_COMMENT_LINE = /^(?:#{1,6}\s|\/\/)/;
const TABLE_LANGUAGES: ReadonlySet<string> = new Set(['csv', 'tsv']);
const KIND_NAMING_LANGUAGES: ReadonlySet<string> = new Set(['chart', 'email', 'mermaid']);
const GENERIC_SOURCE_TYPE = 'code';
const STUDY_SET_LABEL = 'Study set';
const STUDY_PREVIEW_FALLBACK = 'Open to practise';

function strippedLine(line: string): string {
  return line
    .trim()
    .replace(/^#+\s+/, '')
    .replace(/^\/\/+\s*/, '')
    .trim();
}

function firstLineFallback(content: string): string | undefined {
  const unnamed = content.replace(NAMING_MARKUP, (markup) => `${markup[0]}x${markup.slice(1)}`);
  return extractArtifactTitle(unnamed)?.trim();
}

function namedTitle(content: string, language: string | undefined): string | undefined {
  const title = extractArtifactTitle(content, language)?.trim();
  if (!title || TEMPLATE_EXPRESSION.test(title)) return undefined;
  if (title !== firstLineFallback(content)) return title;
  const sourceLine = content.split('\n').find((line) => strippedLine(line) === title);
  return sourceLine !== undefined && HEADING_OR_COMMENT_LINE.test(sourceLine.trim())
    ? title
    : undefined;
}

export function artifactKindTitle(type: string, language?: string): string {
  const fenceLanguage = language?.trim().toLowerCase() ?? '';
  if (TABLE_LANGUAGES.has(fenceLanguage)) return artifactKindLabel('csv');
  const kind =
    type === GENERIC_SOURCE_TYPE && KIND_NAMING_LANGUAGES.has(fenceLanguage) ? fenceLanguage : type;
  switch (kind) {
    case 'mermaid':
    case 'diagram':
      return 'Diagram';
    case 'chart':
      return 'Chart';
    case 'html':
      return 'Web page';
    case 'react':
    case 'component':
      return 'Component';
    case 'svg':
      return 'SVG image';
    default:
      return artifactKindLabel(kind);
  }
}

export function storedArtifactTitle(title: string, type: string, language?: string): string {
  const kindTitle = artifactKindTitle(type, language);
  return title && title !== artifactKindTitle(type) ? title : kindTitle;
}

export function artifactDisplayTitle(source: TitledArtifactSource): string {
  const study = studyArtifactContent(source.language, source.content);
  if (study !== null) {
    return (
      studyArtifactTitle(source.language, source.content) ??
      namedTitle(source.content, source.language) ??
      STUDY_SET_LABEL
    );
  }
  return (
    namedTitle(source.content, source.language) ?? artifactKindTitle(source.type, source.language)
  );
}

export function studyPreviewLines(source: TitledArtifactSource): string[] | null {
  const study = studyArtifactContent(source.language, source.content);
  if (study === null) return null;
  return [studySummary(study) || STUDY_PREVIEW_FALLBACK];
}
