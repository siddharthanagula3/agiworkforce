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
