import type { StreamChunk } from '@agiworkforce/types';

const MARKUP_OPEN = '\uE200';
const MARKUP_CLOSE = '\uE201';
const MARKUP_SEPARATOR = '\uE202';
const CITATION_KIND = 'cite';
const MARKUP_CHARACTERS = /[\uE200-\uE204]/g;
const MAX_OPEN_MARKUP_CHARS = 512;

export interface CitationMarkupFilter {
  push(text: string): string;
  flush(): string;
}

const KIND_CHARACTER = /[a-z_]/;
const REFERENCE_CHARACTER = /[A-Za-z0-9_]/;
const REFERENCE_TAIL_END = /[\s]/;
const MAX_KIND_CHARS = 32;

type SpanReading = 'hold' | 'release' | number;

function readMarkupSpan(span: string, atEnd: boolean): SpanReading {
  let at = MARKUP_OPEN.length;
  while (at < span.length && KIND_CHARACTER.test(span[at]!)) {
    at += 1;
    if (at - MARKUP_OPEN.length > MAX_KIND_CHARS) return 'release';
  }
  const kind = span.slice(MARKUP_OPEN.length, at);
  if (at === span.length) {
    if (!atEnd) return 'hold';
    return CITATION_KIND.startsWith(kind) ? span.length : 'release';
  }
  if (kind.length === 0 || span[at] !== MARKUP_SEPARATOR) return 'release';
  at += MARKUP_SEPARATOR.length;
  if (kind === CITATION_KIND) {
    while (true) {
      while (
        at < span.length &&
        at <= MAX_OPEN_MARKUP_CHARS &&
        REFERENCE_CHARACTER.test(span[at]!)
      ) {
        at += 1;
      }
      if (at > MAX_OPEN_MARKUP_CHARS) return 'release';
      if (at === span.length) return atEnd ? span.length : 'hold';
      if (span[at] === MARKUP_CLOSE) return at + MARKUP_CLOSE.length;
      if (span[at] !== MARKUP_SEPARATOR) return readReferenceTail(span, at, atEnd);
      at += MARKUP_SEPARATOR.length;
    }
  }
  const end = Math.min(span.length, MAX_OPEN_MARKUP_CHARS);
  for (; at < end; at += 1) {
    const character = span[at];
    if (character === MARKUP_CLOSE) return at + MARKUP_CLOSE.length;
    if (character === '\n' || character === MARKUP_OPEN) return 'release';
  }
  if (atEnd || span.length >= MAX_OPEN_MARKUP_CHARS) return 'release';
  return 'hold';
}

function readReferenceTail(span: string, header: number, atEnd: boolean): SpanReading {
  let at = header;
  while (at < span.length && at < MAX_OPEN_MARKUP_CHARS && !REFERENCE_TAIL_END.test(span[at]!)) {
    at += 1;
  }
  if (at === MAX_OPEN_MARKUP_CHARS) return header;
  if (at === span.length) return atEnd ? header : 'hold';
  if (span[at] === MARKUP_CLOSE) return at + MARKUP_CLOSE.length;
  return header;
}

function filterMarkup(text: string, atEnd: boolean): { out: string; held: string } {
  let rest = text;
  let out = '';
  while (rest.length > 0) {
    const open = rest.indexOf(MARKUP_OPEN);
    if (open === -1) {
      out += rest.replace(MARKUP_CHARACTERS, '');
      break;
    }
    out += rest.slice(0, open).replace(MARKUP_CHARACTERS, '');
    const span = rest.slice(open);
    const reading = readMarkupSpan(span, atEnd);
    if (reading === 'hold' && span.length <= MAX_OPEN_MARKUP_CHARS) return { out, held: span };
    if (typeof reading === 'number' && reading <= MAX_OPEN_MARKUP_CHARS) {
      rest = span.slice(reading);
    } else {
      rest = span.slice(MARKUP_OPEN.length);
    }
  }
  return { out, held: '' };
}

/**
 * OpenAI models sometimes write their internal markup into answer text: a
 * private-use span such as U+E200 `cite` U+E202 `turn0search0` U+E201. Real
 * citations arrive as annotations, so a well-formed span (a kind, a separator,
 * then a close on the same line before any other open marker) is dropped whole,
 * and a citation that never closes loses only its references. Anything else is ordinary text: a stray
 * marker character is removed and the text around it is kept. A span can be
 * split across deltas, so one that may still close is held, up to a bound.
 */
export function createCitationMarkupFilter(): CitationMarkupFilter {
  let held = '';
  return {
    push(text) {
      const filtered = filterMarkup(held + text, false);
      held = filtered.held;
      return filtered.out;
    },
    flush() {
      const filtered = filterMarkup(held, true);
      held = '';
      return filtered.out;
    },
  };
}

export function stripCitationMarkup(text: string): string {
  const filter = createCitationMarkupFilter();
  return filter.push(text) + filter.flush();
}

export async function* withoutCitationMarkup(
  chunks: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  const citationMarkup = createCitationMarkupFilter();
  const releaseHeldText = function* (): Generator<StreamChunk> {
    const held = citationMarkup.flush();
    if (held) yield { type: 'text-delta', delta: held };
  };
  try {
    for await (const chunk of chunks) {
      if (chunk.type !== 'text-delta') {
        if (chunk.type === 'stop' || chunk.type === 'error') yield* releaseHeldText();
        yield chunk;
        continue;
      }
      const delta = citationMarkup.push(chunk.delta);
      if (delta) yield { ...chunk, delta };
    }
  } catch (error) {
    yield* releaseHeldText();
    throw error;
  }
  yield* releaseHeldText();
}
