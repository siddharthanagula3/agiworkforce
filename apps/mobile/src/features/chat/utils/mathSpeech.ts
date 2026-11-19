interface MathNode {
  tag: string;
  attrs: string;
  children: MathNode[];
  text: string;
}

const TOKEN = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|([^<]+)/g;
const ENTITY = /&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos|nbsp));/g;
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
const SILENT_TAGS = new Set(['annotation', 'annotation-xml', 'mphantom', 'mspace']);
const LARGE_OPERATORS: Record<string, string> = {
  '∑': 'the sum',
  '∏': 'the product',
  '∫': 'the integral',
  '∮': 'the contour integral',
  '⋃': 'the union',
  '⋂': 'the intersection',
};
const OPERATOR_WORDS: Record<string, string> = {
  '+': 'plus',
  '-': 'minus',
  '−': 'minus',
  '=': 'equals',
  '×': 'times',
  '⋅': 'times',
  '·': 'times',
  '∗': 'times',
  '÷': 'divided by',
  '/': 'divided by',
  '<': 'is less than',
  '>': 'is greater than',
  '≤': 'is less than or equal to',
  '≥': 'is greater than or equal to',
  '≠': 'is not equal to',
  '≈': 'is approximately equal to',
  '≡': 'is equivalent to',
  '∝': 'is proportional to',
  '±': 'plus or minus',
  '∓': 'minus or plus',
  '→': 'goes to',
  '⇒': 'implies',
  '⟹': 'implies',
  '⇔': 'if and only if',
  '⟺': 'if and only if',
  '∈': 'is in',
  '∉': 'is not in',
  '⊂': 'is a subset of',
  '⊆': 'is a subset of or equal to',
  '∪': 'union',
  '∩': 'intersection',
  '∞': 'infinity',
  '∂': 'partial',
  '∇': 'nabla',
  '′': 'prime',
  '!': 'factorial',
  '(': 'open paren',
  ')': 'close paren',
  '[': 'open bracket',
  ']': 'close bracket',
  '{': 'open brace',
  '}': 'close brace',
  '|': 'vertical bar',
  '⁡': '',
  '⁢': '',
  '⁣': '',
  '⁤': '',
};
const ACCENT_WORDS: Record<string, string> = {
  '^': 'hat',
  '\u02c6': 'hat',
  '‾': 'bar',
  '¯': 'bar',
  _: 'bar',
  '→': 'vector',
  '⃗': 'vector',
  '˙': 'dot',
  '¨': 'double dot',
  '~': 'tilde',
  '˜': 'tilde',
};

function decode(text: string): string {
  return text.replace(ENTITY, (_match, hex?: string, dec?: string, name?: string) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
    return NAMED_ENTITIES[name ?? ''] ?? '';
  });
}

function parse(markup: string): MathNode {
  const root: MathNode = { tag: 'root', attrs: '', children: [], text: '' };
  const stack: MathNode[] = [root];
  for (const match of markup.matchAll(TOKEN)) {
    const parent = stack[stack.length - 1]!;
    const [, closing, tag, attrs, selfClosing, text] = match;
    if (text !== undefined) {
      parent.children.push({ tag: '#text', attrs: '', children: [], text: decode(text) });
      continue;
    }
    const name = (tag ?? '').toLowerCase();
    if (closing) {
      const index = stack.map((node) => node.tag).lastIndexOf(name);
      if (index > 0) stack.length = index;
      continue;
    }
    const node: MathNode = { tag: name, attrs: attrs ?? '', children: [], text: '' };
    parent.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

function textOf(node: MathNode): string {
  if (node.tag === '#text') return node.text;
  if (SILENT_TAGS.has(node.tag)) return '';
  return node.children.map(textOf).join('');
}

function elements(node: MathNode): MathNode[] {
  return node.children.filter((child) => child.tag !== '#text');
}

function join(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

function power(base: string, exponent: MathNode | undefined): string {
  const raised = exponent ? speak(exponent) : '';
  if (raised === '2') return join([base, 'squared']);
  if (raised === '3') return join([base, 'cubed']);
  if (raised === 'prime') return join([base, 'prime']);
  return join([base, 'to the power of', raised]);
}

function largeOperator(node: MathNode | undefined): string | null {
  if (!node) return null;
  return LARGE_OPERATORS[textOf(node).trim()] ?? null;
}

function limits(node: MathNode, lower?: MathNode, upper?: MathNode): string | null {
  const [base] = elements(node);
  const operator = largeOperator(base);
  if (operator) {
    return join([
      operator,
      lower ? `from ${speak(lower)}` : '',
      upper ? `to ${speak(upper)}` : '',
      'of',
    ]);
  }
  if (base && textOf(base).trim() === 'lim' && lower) return `the limit as ${speak(lower)} of`;
  return null;
}

function root(radicand: string, index: string): string {
  if (index === '3') return `the cube root of ${radicand}`;
  return `the root of order ${index} of ${radicand}`;
}

function speak(node: MathNode): string {
  if (node.tag === '#text') return node.text.trim();
  if (SILENT_TAGS.has(node.tag)) return '';
  const [first, second, third] = elements(node);
  switch (node.tag) {
    case 'mi':
    case 'mn':
    case 'mtext':
    case 'ms':
      return textOf(node).trim();
    case 'mo': {
      const symbol = textOf(node).trim();
      return OPERATOR_WORDS[symbol] ?? LARGE_OPERATORS[symbol] ?? symbol;
    }
    case 'msup':
      return power(first ? speak(first) : '', second);
    case 'msub':
      return (
        limits(node, second) ??
        join([first ? speak(first) : '', 'sub', second ? speak(second) : ''])
      );
    case 'msubsup':
      return (
        limits(node, second, third) ??
        power(join([first ? speak(first) : '', 'sub', second ? speak(second) : '']), third)
      );
    case 'munder':
      return (
        limits(node, second) ??
        join([first ? speak(first) : '', 'under', second ? speak(second) : ''])
      );
    case 'mover': {
      const accent = second ? ACCENT_WORDS[textOf(second).trim()] : undefined;
      if (accent) return join([first ? speak(first) : '', accent]);
      return limits(node, undefined, second) ?? power(first ? speak(first) : '', second);
    }
    case 'munderover':
      return (
        limits(node, second, third) ??
        join([
          first ? speak(first) : '',
          'from',
          second ? speak(second) : '',
          'to',
          third ? speak(third) : '',
        ])
      );
    case 'mfrac':
      return join([first ? speak(first) : '', 'over', second ? speak(second) : '']);
    case 'msqrt':
      return `the square root of ${join(elements(node).map(speak))}`;
    case 'mroot':
      return root(first ? speak(first) : '', second ? speak(second) : '');
    case 'mtable':
      return elements(node)
        .map((row) => elements(row).map(speak).join(', '))
        .join('; ');
    default:
      return join(node.children.map(speak));
  }
}

/** Words a screen reader can say for MathML built on the device, such as "a squared plus b squared". */
export function speakMathMarkup(markup: string): string {
  return speak(parse(markup)).replace(/\s+/g, ' ').trim();
}
