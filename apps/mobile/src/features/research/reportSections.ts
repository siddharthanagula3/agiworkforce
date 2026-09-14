export interface ReportSection {
  id: string;
  text: string;
  level: number;
}

const MAX_SECTIONS = 60;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function extractReportSections(markdown: string): ReportSection[] {
  if (!markdown) return [];
  const sections: ReportSection[] = [];
  const seen = new Map<string, number>();
  let insideFence = false;

  for (const line of markdown.split('\n')) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const match = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = match[2]!.replace(/[*_`]/g, '').trim();
    if (!text) continue;

    const base = slugify(text) || `section-${sections.length + 1}`;
    const used = seen.get(base) ?? 0;
    seen.set(base, used + 1);
    sections.push({
      id: used === 0 ? base : `${base}-${used}`,
      text,
      level: match[1]!.length,
    });
    if (sections.length >= MAX_SECTIONS) break;
  }

  return sections;
}
