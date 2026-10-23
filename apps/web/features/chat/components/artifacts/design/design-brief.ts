export const DESIGN_FORMATS = [
  'Landing page',
  'App screen',
  'Dashboard',
  'Poster or flyer',
  'Email',
  'One-pager',
  'Other',
] as const;

export const DESIGN_STYLES = [
  'Minimal',
  'Bold',
  'Playful',
  'Corporate',
  'Editorial',
  'Technical',
] as const;

export interface DesignBrief {
  format: string;
  goal: string;
  audience: string;
  style: string;
  content: string;
  layout: string;
}

export const EMPTY_BRIEF: DesignBrief = {
  format: DESIGN_FORMATS[0],
  goal: '',
  audience: '',
  style: '',
  content: '',
  layout: '',
};

const MAX_FIELD_CHARS = 1_000;
// \x3C is `<`: Semgrep reads a regex literal that opens with it as an HTML comment and drops the file.
const BRIEF_COMMENT = /\x3C!--\s*brief:\s*(\{[\s\S]*?\})\s*-->/i;

function field(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD_CHARS) : '';
}

export function isBriefReady(brief: DesignBrief): boolean {
  return brief.goal.trim().length > 0 && brief.format.trim().length > 0;
}

export function readDesignBrief(source: string): DesignBrief | null {
  const match = BRIEF_COMMENT.exec(source);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]!) as Record<string, unknown>;
    const brief: DesignBrief = {
      format: field(parsed['format']),
      goal: field(parsed['goal']),
      audience: field(parsed['audience']),
      style: field(parsed['style']),
      content: field(parsed['content']),
      layout: field(parsed['layout']),
    };
    return brief.goal || brief.format ? brief : null;
  } catch {
    return null;
  }
}

function briefLines(brief: DesignBrief): string[] {
  return [
    `- Format: ${brief.format}`,
    `- Goal: ${brief.goal}`,
    ...(brief.audience ? [`- Audience: ${brief.audience}`] : []),
    ...(brief.style ? [`- Style: ${brief.style}`] : []),
    ...(brief.content ? [`- Must include: ${brief.content}`] : []),
    ...(brief.layout ? [`- Layout: ${brief.layout}`] : []),
  ];
}

function briefComment(brief: DesignBrief): string {
  return `<!-- brief: ${JSON.stringify(brief).replace(/--/g, '- -')} -->`;
}

export function buildDesignFromBriefRequest(brief: DesignBrief): string {
  return [
    `Design a ${brief.format.toLowerCase()} from this brief as a single self-contained HTML artifact.`,
    '',
    'Brief:',
    ...briefLines(brief),
    '',
    'If something essential to the design is missing from the brief, ask me up to three short questions first; otherwise build it now.',
    `Reply with one \`\`\`html fenced block whose first line is <!-- @artifact --> and whose second line is exactly: ${briefComment(brief)}`,
    'Keep that brief comment in every later version of this design.',
  ].join('\n');
}

export function buildBriefRevisionRequest(title: string, brief: DesignBrief): string {
  return [
    `Revise the design "${title}" to match this updated brief. Keep everything the brief does not change, including the title.`,
    '',
    'Updated brief:',
    ...briefLines(brief),
    '',
    `Reply with the complete updated design in one \`\`\`html fenced block whose first line is <!-- @artifact --> and whose second line is exactly: ${briefComment(brief)}`,
  ].join('\n');
}
