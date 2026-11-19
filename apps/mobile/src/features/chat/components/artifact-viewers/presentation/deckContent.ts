import { EXPLICIT_ARTIFACT_MARKER_FOR, detectArtifactType } from '@agiworkforce/artifacts';
import { parseDeck } from '@agiworkforce/unified-chat/deck-model';

export const SLIDE_ASPECT = 16 / 9;

const DECK_LANGUAGES: ReadonlySet<string> = new Set(['markdown', 'md', '']);

/**
 * True for a Markdown deck. Derivation strips a document's artifact marker
 * before storing it, so the marker is put back for the shared detector.
 */
export function isDeckArtifact(language: string | undefined, content: string): boolean {
  if (!DECK_LANGUAGES.has(language?.trim().toLowerCase() ?? '')) return false;
  return (
    detectArtifactType('markdown', `${EXPLICIT_ARTIFACT_MARKER_FOR.markdown}\n${content}`) ===
    'presentation'
  );
}

export function deckSlides(content: string): string[] {
  return parseDeck(content).slides;
}
