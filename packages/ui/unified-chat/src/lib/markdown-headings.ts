export interface ReportHeading {
  id: string;
  text: string;
  level: number;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Fenced lines are skipped: counting a `# comment` in a fence would shift the
// index the contents list scrolls by off the headings the renderer produces.
export function extractMarkdownHeadings(markdown: string): ReportHeading[] {
  const headings: ReportHeading[] = [];
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

    const base = slugifyHeading(text) || `section-${headings.length + 1}`;
    const used = seen.get(base) ?? 0;
    seen.set(base, used + 1);
    headings.push({
      id: used === 0 ? base : `${base}-${used}`,
      text,
      level: match[1]!.length,
    });
  }

  return headings;
}
