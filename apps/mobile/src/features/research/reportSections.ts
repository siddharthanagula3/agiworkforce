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

const MAX_SECTION_LEVEL = 4;

export function createReportSectionIds(): (heading: string, level: number) => string | null {
  const seen = new Map<string, number>();
  let assigned = 0;
  return (heading, level) => {
    if (level > MAX_SECTION_LEVEL || assigned >= MAX_SECTIONS) return null;
    const text = heading.replace(/[*_`]/g, '').trim();
    if (!text) return null;
    const base = slugify(text) || `section-${assigned + 1}`;
    const used = seen.get(base) ?? 0;
    seen.set(base, used + 1);
    assigned += 1;
    return used === 0 ? base : `${base}-${used}`;
  };
}

export function extractReportSections(markdown: string): ReportSection[] {
  if (!markdown) return [];
  const sections: ReportSection[] = [];
  const sectionId = createReportSectionIds();
  let insideFence = false;

  for (const line of markdown.split('\n')) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const match = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const level = match[1]!.length;
    const id = sectionId(match[2]!, level);
    if (!id) continue;
    sections.push({ id, text: match[2]!.replace(/[*_`]/g, '').trim(), level });
    if (sections.length >= MAX_SECTIONS) break;
  }

  return sections;
}
