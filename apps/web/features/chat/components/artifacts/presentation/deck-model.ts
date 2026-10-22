import { splitSlides } from '@agiworkforce/unified-chat';

export const SLIDE_SEPARATOR = '\n\n---\n\n';
const DECK_META = /^\s*<!--\s*deck\b([^>]*)-->[ \t]*\n?/;
const META_PAIR = /([a-z]+)=("[^"]*"|\S+)/gi;

export interface DeckDocument {
  meta: Record<string, string>;
  slides: string[];
}

export function parseDeck(content: string): DeckDocument {
  const source = content.replace(/\r\n/g, '\n');
  const match = DECK_META.exec(source);
  const meta: Record<string, string> = {};
  if (match) {
    for (const pair of match[1]!.matchAll(META_PAIR)) {
      const raw = pair[2]!;
      meta[pair[1]!.toLowerCase()] = raw.startsWith('"') ? raw.slice(1, -1) : raw;
    }
  }
  const body = match ? source.slice(match[0].length) : source;
  return { meta, slides: splitSlides(body) };
}

function serializeMeta(meta: Record<string, string>): string {
  const pairs = Object.entries(meta)
    .filter(([, value]) => value !== '')
    .map(([key, value]) =>
      /[\s"]/.test(value) ? `${key}="${value.replace(/"/g, '')}"` : `${key}=${value}`,
    );
  return pairs.length > 0 ? `<!-- deck ${pairs.join(' ')} -->\n\n` : '';
}

export function serializeDeck(deck: DeckDocument): string {
  return `${serializeMeta(deck.meta)}${deck.slides.map((slide) => slide.trim()).join(SLIDE_SEPARATOR)}\n`;
}

export function replaceSlide(deck: DeckDocument, index: number, markdown: string): DeckDocument {
  return { ...deck, slides: deck.slides.map((slide, i) => (i === index ? markdown : slide)) };
}

export function insertSlide(
  deck: DeckDocument,
  afterIndex: number,
  markdown: string,
): DeckDocument {
  const slides = [...deck.slides];
  slides.splice(afterIndex + 1, 0, markdown);
  return { ...deck, slides };
}

export function removeSlide(deck: DeckDocument, index: number): DeckDocument {
  if (deck.slides.length <= 1) return deck;
  return { ...deck, slides: deck.slides.filter((_, i) => i !== index) };
}

export function moveSlide(deck: DeckDocument, from: number, to: number): DeckDocument {
  if (to < 0 || to >= deck.slides.length || from === to) return deck;
  const slides = [...deck.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(to, 0, moved!);
  return { ...deck, slides };
}

export function appendToSlide(slide: string, block: string): string {
  const trimmed = slide.trimEnd();
  return trimmed ? `${trimmed}\n\n${block.trim()}` : block.trim();
}

export function slideTitle(slide: string, index: number): string {
  const heading = /^#{1,6}\s+(.+)$/m.exec(slide);
  const text = (heading?.[1] ?? slide.split('\n').find((line) => line.trim()) ?? '')
    .replace(/[*_`[\]]/g, '')
    .trim();
  return text || `Slide ${index + 1}`;
}

export type VisualKind = 'chart' | 'mermaid' | 'shapes' | 'kpi' | 'insights';

export type SlideSegment =
  | { kind: 'markdown'; text: string }
  | { kind: VisualKind; source: string; start: number; end: number };

const FENCE_OPEN = /^(`{3,}|~{3,})\s*([a-z0-9-]*)\s*$/i;
const VISUAL_LANGUAGES = new Set(['chart', 'mermaid', 'shapes', 'kpi', 'insights']);

export function slideSegments(slide: string): SlideSegment[] {
  const lines = slide.split('\n');
  const segments: SlideSegment[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) segments.push({ kind: 'markdown', text });
    buffer = [];
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const open = FENCE_OPEN.exec(line);
    const language = open?.[2]?.toLowerCase() ?? '';
    if (!open || !VISUAL_LANGUAGES.has(language)) {
      buffer.push(line);
      index += 1;
      continue;
    }
    const fence = open[1]!;
    let close = index + 1;
    while (close < lines.length && lines[close]!.trim() !== fence) close += 1;
    const source = lines.slice(index + 1, close).join('\n');
    flush();
    segments.push({ kind: language as VisualKind, source, start: index, end: close });
    index = close + 1;
  }
  flush();
  return segments;
}

export function fenceBlock(kind: VisualKind, source: string): string {
  return ['```' + kind, source.trim(), '```'].join('\n');
}

export function replaceVisualBlock(
  slide: string,
  start: number,
  replacement: string | null,
): string {
  const lines = slide.split('\n');
  const segment = slideSegments(slide).find(
    (candidate) => candidate.kind !== 'markdown' && candidate.start === start,
  );
  if (!segment || segment.kind === 'markdown') return slide;
  const next = [
    ...lines.slice(0, segment.start),
    ...(replacement === null ? [] : [replacement]),
    ...lines.slice(segment.end + 1),
  ];
  return next
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function replaceShapesBlock(slide: string, source: string | null): string {
  const segment = slideSegments(slide).find((candidate) => candidate.kind === 'shapes');
  if (!segment || segment.kind === 'markdown') {
    return source === null ? slide : appendToSlide(slide, fenceBlock('shapes', source));
  }
  return replaceVisualBlock(
    slide,
    segment.start,
    source === null ? null : fenceBlock('shapes', source),
  );
}

export function splitSlideForEditing(slide: string): { text: string; visuals: string[] } {
  const segments = slideSegments(slide);
  return {
    text: segments
      .filter((segment) => segment.kind === 'markdown')
      .map((segment) => (segment.kind === 'markdown' ? segment.text : ''))
      .join('\n\n'),
    visuals: segments.flatMap((segment) =>
      segment.kind === 'markdown' ? [] : [fenceBlock(segment.kind, segment.source)],
    ),
  };
}

export function joinEditedSlide(text: string, visuals: readonly string[]): string {
  return [text.trim(), ...visuals].filter(Boolean).join('\n\n');
}

export function shapesSource(slide: string): string | null {
  const segment = slideSegments(slide).find((candidate) => candidate.kind === 'shapes');
  return segment && segment.kind !== 'markdown' ? segment.source : null;
}
