import { normalizeMathDelimiters, tagsAndDollarsAsText } from '@agiworkforce/utils/markdown-source';
import { inlinePlainText } from './markdownInlineSyntax';

export function followUpChipText(suggestion: string): string {
  return inlinePlainText(normalizeMathDelimiters(tagsAndDollarsAsText(suggestion)))
    .replace(/\s+/g, ' ')
    .trim();
}
