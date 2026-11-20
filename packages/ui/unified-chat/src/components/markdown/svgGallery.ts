const FENCE_RE = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
const SVG_OPEN_RE = /<svg\b/gi;
const SVG_CLOSE_RE = /<\/svg>/gi;

function findSvgElements(body: string): string[] {
  const elements: string[] = [];
  let cursor = 0;
  for (;;) {
    SVG_OPEN_RE.lastIndex = cursor;
    const open = SVG_OPEN_RE.exec(body);
    if (!open) break;
    SVG_CLOSE_RE.lastIndex = open.index + open[0].length;
    const close = SVG_CLOSE_RE.exec(body);
    if (!close) break;
    cursor = close.index + close[0].length;
    elements.push(body.slice(open.index, cursor));
  }
  return elements;
}

function fenceLanguage(info: string): string {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

/**
 * SVG fences are pictures, not a source dump. Each `<svg>` becomes one slide
 * and the fence is removed from the markdown the reader sees as code.
 */
export function extractSvgSlides(markdown: string): { slides: string[]; markdown: string } {
  const slides: string[] = [];
  const next = markdown.replace(FENCE_RE, (full, info: string, body: string) => {
    const language = fenceLanguage(info);
    const svgLanguage = language === 'svg' || language === 'xml' || language === '';
    if (!svgLanguage) return full;
    if (language === '' && !body.trim().startsWith('<svg')) return full;
    const found = findSvgElements(body);
    if (found.length === 0) return full;
    slides.push(...found);
    return '';
  });
  return { slides, markdown: next };
}
