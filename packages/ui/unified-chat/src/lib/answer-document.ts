export const SAVE_ANSWER_AS_DOCUMENT_LABEL = 'Save as document';
export const ARTIFACT_TITLE_MAX_CHARS = 200;

const FALLBACK_DOCUMENT_TITLE = 'Saved answer';
const DOCUMENT_TITLE_WORDS = 8;

export function normalizeArtifactTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, ARTIFACT_TITLE_MAX_CHARS);
}

export function documentTitleFromAnswer(content: string): string {
  const heading = /^#{1,6}\s+(.+)$/m.exec(content)?.[1];
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? '';
  const source = (heading ?? firstLine)
    .replace(/[*_`#>[\]()!]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  const words = source.split(/\s+/).filter(Boolean);
  const title =
    words.slice(0, DOCUMENT_TITLE_WORDS).join(' ') +
    (words.length > DOCUMENT_TITLE_WORDS ? '…' : '');
  return normalizeArtifactTitle(title) || FALLBACK_DOCUMENT_TITLE;
}
