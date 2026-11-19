export interface ReportHeading {
  id: string;
  text: string;
  level: number;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const HEADING_OPENING = /^\s{0,3}(#{1,4})\s+/;
const LINE_TERMINATOR = /[\r\u2028\u2029]/;

function headingLine(line: string): { level: number; text: string } | null {
  const opening = HEADING_OPENING.exec(line);
  if (!opening) return null;
  const rest = line.slice(opening[0].length);
  if (!rest) return null;
  let end = rest.trimEnd().length;
  while (end > 0 && rest.charAt(end - 1) === '#') end -= 1;
  end = rest.slice(0, end).trimEnd().length;
  const text = rest.slice(0, Math.max(1, end));
  return LINE_TERMINATOR.test(text) ? null : { level: opening[1]!.length, text };
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

    const match = headingLine(line);
    if (!match) continue;

    const text = match.text.replace(/[*_`]/g, '').trim();
    if (!text) continue;

    const base = slugifyHeading(text) || `section-${headings.length + 1}`;
    const used = seen.get(base) ?? 0;
    seen.set(base, used + 1);
    headings.push({
      id: used === 0 ? base : `${base}-${used}`,
      text,
      level: match.level,
    });
  }

  return headings;
}
