import {
  extractMarkdownHeadings,
  type ReportHeading,
} from '@agiworkforce/unified-chat/markdown-headings';

export type ReportSection = ReportHeading;

const MAX_SECTIONS = 60;

export function createReportSectionIds(): (heading: string, level: number) => string | null {
  const seenLines: string[] = [];
  let assigned = 0;
  return (heading, level) => {
    if (assigned >= MAX_SECTIONS) return null;
    seenLines.push(`${'#'.repeat(level)} ${heading}`);
    const headings = extractMarkdownHeadings(seenLines.join('\n'));
    if (headings.length === assigned) {
      seenLines.pop();
      return null;
    }
    assigned = headings.length;
    return headings[headings.length - 1]!.id;
  };
}

export function extractReportSections(markdown: string): ReportSection[] {
  if (!markdown) return [];
  return extractMarkdownHeadings(markdown).slice(0, MAX_SECTIONS);
}
