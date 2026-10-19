import { isSupportedChatAttachment } from './chat-attachments';

export const LIBRARY_PATH = '/api/library';

const DOCUMENT_ARTIFACT_TYPE = 'document';
const PDF_DOCUMENT_LANGUAGE = 'pdf';
const MARKDOWN_DOCUMENT_LANGUAGES: ReadonlyArray<string> = ['md', 'mdx', 'markdown'];
const WORD_DOCUMENT_LANGUAGES: ReadonlyArray<string> = ['docx', 'doc'];

export interface ArtifactDocumentClassification {
  isPdf: boolean;
  isDocx: boolean;
  isMarkdownDoc: boolean;
}

export function classifyArtifactDocument(artifact: {
  type: string;
  language?: string;
}): ArtifactDocumentClassification {
  if (artifact.type !== DOCUMENT_ARTIFACT_TYPE) {
    return { isPdf: false, isDocx: false, isMarkdownDoc: false };
  }
  const language = artifact.language?.toLowerCase();
  return {
    isPdf: language === PDF_DOCUMENT_LANGUAGE,
    isDocx: language !== undefined && WORD_DOCUMENT_LANGUAGES.includes(language),
    isMarkdownDoc: language === undefined || MARKDOWN_DOCUMENT_LANGUAGES.includes(language),
  };
}

export interface ArtifactLibraryFile {
  fileName: string;
  content: string;
}

export function artifactLibraryFile(artifact: {
  title: string;
  type: string;
  language?: string;
  content: string;
}): ArtifactLibraryFile {
  const title = artifact.title || 'artifact';
  if (classifyArtifactDocument(artifact).isMarkdownDoc) {
    return { fileName: `${title}.md`, content: artifact.content };
  }
  const language = (artifact.language || artifact.type || 'txt').toLowerCase();
  const sourceName = `${title}.${language}`;
  if (isSupportedChatAttachment(sourceName, '')) {
    return { fileName: sourceName, content: artifact.content };
  }
  return {
    fileName: `${title}.md`,
    content: `# ${title}\n\n\`\`\`${language}\n${artifact.content}\n\`\`\``,
  };
}
