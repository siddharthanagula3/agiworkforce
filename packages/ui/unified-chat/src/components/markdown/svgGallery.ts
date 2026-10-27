const FENCE_RE = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
const SVG_ELEMENT_RE = /<svg\b[\s\S]*?<\/svg>/gi;

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
    const found = body.match(SVG_ELEMENT_RE) ?? [];
    if (found.length === 0) return full;
    slides.push(...found);
    return '';
  });
  return { slides, markdown: next };
}
