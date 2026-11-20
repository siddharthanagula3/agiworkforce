const WORD_CHARACTER = /[A-Za-z0-9_]/;

export function endsTagName(source: string, index: number): boolean {
  const next = source[index];
  return next === undefined || !WORD_CHARACTER.test(next);
}

export function asciiLowercase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * indexOf that never rescans: a repeated search for the same needle from a
 * later offset reuses the previous hit, and a miss stays a miss. Offsets must
 * not decrease for one needle.
 */
export function forwardFinder(source: string): (needle: string, from: number) => number {
  const searches = new Map<string, { from: number; at: number }>();
  return (needle, from) => {
    const previous = searches.get(needle);
    if (previous && previous.from <= from && (previous.at === -1 || previous.at >= from)) {
      return previous.at;
    }
    const at = source.indexOf(needle, from);
    searches.set(needle, { from, at });
    return at;
  };
}

export interface MarkupElement {
  start: number;
  bodyStart: number;
  end: number;
  attributes: string;
  body: string;
  selfClosing: boolean;
}

const SKIPPED_UNITS = [
  { open: '<!--', close: '-->' },
  { open: '<![CDATA[', close: ']]>' },
  { open: '<?', close: '?>' },
] as const;

function isXmlWhitespace(character: string | undefined): boolean {
  return character === ' ' || character === '\t' || character === '\n' || character === '\r';
}

function endsXmlName(character: string | undefined): boolean {
  return isXmlWhitespace(character) || character === '>' || character === '/';
}

const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

const MAX_CODE_POINT = 0x10ffff;

export function characterReference(reference: string, codePoint: number): string {
  const surrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
  return codePoint > MAX_CODE_POINT || surrogate ? reference : String.fromCodePoint(codePoint);
}

function attributeText(raw: string): string {
  return raw
    .replace(/[\t\n\r]/g, ' ')
    .replace(
      /&(?:#x([0-9a-fA-F]+)|#(\d+)|(lt|gt|amp|quot|apos));/g,
      (
        reference,
        hex: string | undefined,
        decimal: string | undefined,
        entity: string | undefined,
      ) =>
        entity
          ? PREDEFINED_ENTITIES[entity]!
          : characterReference(reference, hex === undefined ? Number(decimal) : parseInt(hex, 16)),
    );
}

export interface XmlAttribute {
  name: string;
  value: string;
  start: number;
  end: number;
}

/**
 * Reads the attributes of a start tag from `from` (just past the element name)
 * up to its closing bracket, with XML's optional whitespace around '=' and
 * decoded values. Positions are offsets into `source`.
 */
export function xmlAttributes(source: string, from = 0): XmlAttribute[] {
  const attributes: XmlAttribute[] = [];
  let index = from;
  for (;;) {
    while (isXmlWhitespace(source[index])) index += 1;
    const start = index;
    while (index < source.length && !endsXmlName(source[index]) && source[index] !== '=')
      index += 1;
    if (index === start) return attributes;
    const name = source.slice(start, index);
    while (isXmlWhitespace(source[index])) index += 1;
    if (source[index] !== '=') return attributes;
    index += 1;
    while (isXmlWhitespace(source[index])) index += 1;
    const quote = source[index];
    if (quote !== '"' && quote !== "'") return attributes;
    const close = source.indexOf(quote, index + 1);
    if (close === -1) return attributes;
    attributes.push({
      name,
      value: attributeText(source.slice(index + 1, close)),
      start,
      end: close + 1,
    });
    index = close + 1;
  }
}

export function attributeValue(source: string, name: string, from = 0): string | undefined {
  return xmlAttributes(source, from).find((attribute) => attribute.name === name)?.value;
}

interface OpenTag {
  start: number;
  nameEnd: number;
  bracket: number;
}

function markupScanner(source: string) {
  const find = forwardFinder(source);

  const outsideSkippedUnits = (needle: string, from: number): number => {
    let at = from;
    for (;;) {
      const hit = find(needle, at);
      if (hit === -1) return -1;
      let unitStart = -1;
      let skipped: (typeof SKIPPED_UNITS)[number] | undefined;
      for (const unit of SKIPPED_UNITS) {
        const start = find(unit.open, at);
        if (start !== -1 && start <= hit && (unitStart === -1 || start < unitStart)) {
          unitStart = start;
          skipped = unit;
        }
      }
      if (!skipped) return hit;
      const unitEnd = find(skipped.close, unitStart + skipped.open.length);
      if (unitEnd === -1) return -1;
      at = unitEnd + skipped.close.length;
    }
  };

  const closingBracket = (from: number): number => {
    let at = from;
    for (;;) {
      const bracket = find('>', at);
      if (bracket === -1) return -1;
      const double = find('"', at);
      const single = find("'", at);
      const quote = double === -1 ? single : single === -1 ? double : Math.min(double, single);
      if (quote === -1 || quote > bracket) return bracket;
      const closingQuote = find(source[quote]!, quote + 1);
      if (closingQuote === -1) return -1;
      at = closingQuote + 1;
    }
  };

  const openTag = (name: string, from: number): OpenTag | undefined => {
    const open = `<${name}`;
    let at = from;
    for (;;) {
      const start = outsideSkippedUnits(open, at);
      if (start === -1) return undefined;
      const nameEnd = start + open.length;
      if (!endsXmlName(source[nameEnd])) {
        at = nameEnd;
        continue;
      }
      const bracket = closingBracket(nameEnd);
      return bracket === -1 ? undefined : { start, nameEnd, bracket };
    }
  };

  let closeMissingFrom = Infinity;
  const closeTag = (name: string, from: number): { start: number; end: number } | undefined => {
    if (from >= closeMissingFrom) return undefined;
    const close = `</${name}`;
    let at = from;
    for (;;) {
      const start = outsideSkippedUnits(close, at);
      if (start === -1) {
        closeMissingFrom = from;
        return undefined;
      }
      let index = start + close.length;
      while (isXmlWhitespace(source[index])) index += 1;
      if (source[index] === '>') return { start, end: index + 1 };
      at = start + close.length;
    }
  };

  return { openTag, closeTag };
}

/**
 * Comments, character data and processing instructions are skipped whole:
 * markup-like text inside them must neither match nor hide a real element,
 * because formula and edit checks rely on seeing what an XML parser sees.
 */
export function* markupElements(source: string, name: string): Generator<MarkupElement, void> {
  const scanner = markupScanner(source);
  let cursor = 0;
  while (cursor < source.length) {
    const tag = scanner.openTag(name, cursor);
    if (!tag) return;
    const bodyStart = tag.bracket + 1;
    if (source[tag.bracket - 1] === '/') {
      yield {
        start: tag.start,
        bodyStart,
        end: bodyStart,
        attributes: source.slice(tag.nameEnd, tag.bracket - 1),
        body: '',
        selfClosing: true,
      };
      cursor = bodyStart;
      continue;
    }
    const close = scanner.closeTag(name, bodyStart);
    if (!close) {
      cursor = bodyStart;
      continue;
    }
    yield {
      start: tag.start,
      bodyStart,
      end: close.end,
      attributes: source.slice(tag.nameEnd, tag.bracket),
      body: source.slice(bodyStart, close.start),
      selfClosing: false,
    };
    cursor = close.end;
  }
}

export function replaceMarkupElements(
  source: string,
  name: string,
  replace: (element: MarkupElement) => string | undefined,
): string {
  let output = '';
  let cursor = 0;
  for (const element of markupElements(source, name)) {
    const replacement = replace(element);
    if (replacement === undefined) continue;
    output += source.slice(cursor, element.start) + replacement;
    cursor = element.end;
  }
  return output + source.slice(cursor);
}

export function* openTags(source: string, name: string): Generator<string, void> {
  const scanner = markupScanner(source);
  let cursor = 0;
  while (cursor < source.length) {
    const tag = scanner.openTag(name, cursor);
    if (!tag) return;
    yield source.slice(tag.start, tag.bracket + 1);
    cursor = tag.bracket + 1;
  }
}

export function firstMarkupElement(source: string, name: string): MarkupElement | undefined {
  for (const element of markupElements(source, name)) return element;
  return undefined;
}

export function firstOpenTag(source: string, name: string): string | undefined {
  for (const tag of openTags(source, name)) return tag;
  return undefined;
}
