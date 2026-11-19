import { EXPORT_CONTENT_STYLES, markdownToExportHtml } from '@/services/exportMarkdownHtml';
import { dropHiddenHtmlBlocks } from '@/src/features/chat/utils/markdownHiddenHtml';
import { lightColors, spacing, typeScale } from '@/src/ui/theme/tokens';
import { SLIDE_ASPECT, deckSlides } from './deckContent';

export const DECK_PDF_PAGE_WIDTH = 792;
export const DECK_PDF_PAGE_HEIGHT = Math.round(DECK_PDF_PAGE_WIDTH / SLIDE_ASPECT);

export function deckPrintHtml(content: string): string | null {
  const slides = deckSlides(dropHiddenHtmlBlocks(content));
  if (slides.length === 0) return null;
  const pages = slides
    .map(
      (slide, index) =>
        `<section class="slide" data-slide="${index + 1}"><div class="content">${markdownToExportHtml(slide).html}</div></section>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${DECK_PDF_PAGE_WIDTH}px ${DECK_PDF_PAGE_HEIGHT}px; margin: 0; }
    html, body { margin: 0; padding: 0; background: ${lightColors.background}; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: ${typeScale.title3}px;
      line-height: 1.4;
      color: ${lightColors.textPrimary};
    }
    .slide {
      box-sizing: border-box;
      width: ${DECK_PDF_PAGE_WIDTH}px;
      height: ${DECK_PDF_PAGE_HEIGHT}px;
      padding: ${spacing['4xl']}px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: center;
      page-break-after: always;
      break-after: page;
    }
    .slide:last-child { page-break-after: auto; break-after: auto; }
    .slide h1 { font-size: ${typeScale.largeTitle}px; margin: 0 0 ${spacing.md}px; }
    .slide h2 { font-size: ${typeScale.title1}px; margin: 0 0 ${spacing.md}px; }
    ${EXPORT_CONTENT_STYLES}
  </style>
</head>
<body>
${pages}
</body>
</html>`;
}
