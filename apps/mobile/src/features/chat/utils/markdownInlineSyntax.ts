import {
  CITATION_GROUP_HREF_PATTERN,
  CITATION_HREF_PATTERN,
  linkifyCitationMarkers,
} from '@agiworkforce/unified-chat/citation-markers';
import { decodeCharacterReference } from '@agiworkforce/unified-chat/html-entities';
import { isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';

// U+FDD0 and U+FDD1 are Unicode noncharacters, reserved for a program's own
// use and never part of interchanged text, so marking an escape or a code span
// with one cannot turn a real private-use character in an answer into markup.
const ESCAPE_MARK = '\uFDD0';
const CODE_MARK = '\uFDD1';
const PAYLOAD_BASE = 0xe000;
const MAX_CODE_SPANS = 0x1900;
const ESCAPED_CHARACTER = /\uFDD0([\uE021-\uE07E])/g;
const CODE_PLACEHOLDER = /\uFDD1([\uE000-\uF8FF])/g;
const ESCAPABLE_PUNCTUATION = /[!-/:-@[-`{-~]/;
const INLINE_MATH = /(?<![\\$])\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)/g;
const INLINE_DOUBLE_MATH = /(?<![\\$])\$\$(?!\$)([^$\n]+?)(?<!\\)\$\$(?!\$)/g;
const HTML_TEXT_TOKEN = /<br\s*\/?>|&(#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z\d]{1,31});/gi;
const SUPERSCRIPT_CHARACTERS: Readonly<Record<string, string>> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
};
const SUBSCRIPT_CHARACTERS: Readonly<Record<string, string>> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  o: 'ₒ',
  x: 'ₓ',
  h: 'ₕ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  p: 'ₚ',
  s: 'ₛ',
  t: 'ₜ',
};
const AUTOLINK_TRAILING_PUNCTUATION = '.,;:!?\'"*_~';
const LINK_TARGET = String.raw`\(((?:[^()\n]|\([^()\n]*\))+)\)`;
const LINK_TITLE = /\s+"[^"]*"$/;
const HTML_STYLE_TAGS = {
  cite: 'em',
  dfn: 'em',
  var: 'em',
  strike: 'strike',
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  u: 'underline',
  ins: 'underline',
  s: 'strike',
  del: 'strike',
  small: 'small',
  mark: 'mark',
  sup: 'sup',
  sub: 'sub',
} as const;
const HTML_CODE_TAGS = ['code', 'kbd', 'tt', 'samp'] as const;
const HTML_HIDDEN_ELEMENTS = ['script', 'style'] as const;
const HTML_LAYOUT_TAGS = [
  'a',
  'abbr',
  'bdi',
  'bdo',
  'q',
  'label',
  'wbr',
  'div',
  'p',
  'span',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'nav',
  'center',
  'font',
  'figure',
  'figcaption',
  'details',
  'summary',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
];

export type InlineStyleName =
  'strong' | 'em' | 'strongEm' | 'strike' | 'underline' | 'small' | 'mark' | 'sup' | 'sub';

export type InlineNode =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'math'; readonly tex: string }
  | { readonly type: 'code'; readonly value: string }
  | {
      readonly type: 'styled';
      readonly style: InlineStyleName;
      readonly children: readonly InlineNode[];
    }
  | { readonly type: 'link'; readonly href: string; readonly children: readonly InlineNode[] }
  | { readonly type: 'footnote'; readonly label: string }
  | { readonly type: 'badge'; readonly label: string }
  | { readonly type: 'citation'; readonly markers: readonly number[]; readonly raw: string };

export type LinkDefinitions = Readonly<Record<string, string>>;

export interface InlineParseOptions {
  readonly citationCount?: number;
  readonly linkDefinitions?: LinkDefinitions;
}

type InlineRule =
  | 'math'
  | 'code'
  | 'strongEm'
  | 'strong'
  | 'em'
  | 'strike'
  | 'image'
  | 'link'
  | 'footnote'
  | 'refLink'
  | 'shortcutRef'
  | 'url'
  | 'email'
  | 'hidden'
  | 'badge'
  | 'anchor'
  | 'htmlImage'
  | 'comment'
  | 'layout'
  | 'htmlCode'
  | `html:${keyof typeof HTML_STYLE_TAGS}`;

function caseless(word: string): string {
  return Array.from(word, (ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`).join('');
}

const EM_STAR_BODY = String.raw`(?:\*\*(?![\s*])(?:[^*]|\*(?!\*))+?(?<!\s)\*\*|(?<=\s)\*+(?=\s)|[^*])+?`;

const INLINE_RULES: ReadonlyArray<readonly [InlineRule, string]> = [
  ['math', INLINE_DOUBLE_MATH.source],
  ['math', INLINE_MATH.source],
  ['code', `${CODE_MARK}([\\uE000-\\uF8FF])`],
  ['strongEm', String.raw`\*\*\*(?![\s*])([\s\S]+?)(?<![\s*])\*\*\*`],
  ['strong', String.raw`\*\*(?![\s*])([\s\S]+?)(?<!\s)\*\*`],
  ['strong', String.raw`(?<![A-Za-z0-9_])__(?![\s_])([\s\S]+?)(?<!\s)__(?![A-Za-z0-9_])`],
  ['em', String.raw`\*(?![\s*])(${EM_STAR_BODY})(?<!\s)\*`],
  ['em', String.raw`(?<![A-Za-z0-9_])_(?![\s_])([\s\S]+?)(?<!\s)_(?![A-Za-z0-9_])`],
  ['strike', String.raw`~~(?!\s)([\s\S]+?)(?<!\s)~~`],
  ['strike', String.raw`(?<!~)~(?![\s~])([^~]+?)(?<![\s~])~(?!~)`],
  ['image', String.raw`!\[([^\]]*)\]${LINK_TARGET}`],
  ['link', String.raw`\[([^\]]+)\]${LINK_TARGET}`],
  ['footnote', String.raw`\[\^([^\]\s]+)\]`],
  ['refLink', String.raw`\[([^\]]+)\]\[([^\]\n]*)\]`],
  ['shortcutRef', String.raw`\[(?!\^)([^\]\n]+)\](?![(\[])`],
  ['url', String.raw`<(https?:\/\/[^\s<>]+)>`],
  ['url', String.raw`(?<![A-Za-z0-9_/])(https?:\/\/[^\s<>\]]+)`],
  ['url', String.raw`(?<![A-Za-z0-9_/@.-])(www\.[^\s<>\]]+)`],
  [
    'email',
    String.raw`(?<![A-Za-z0-9._+\-/:@])([A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)`,
  ],
  ['badge', String.raw`<span class="answer-badge">([^<\n]*)<\/span>`],
  ['comment', String.raw`(<!--[\s\S]*?-->)`],
  ['anchor', String.raw`(<[aA]\s[^>]*>)(.*?)<\/[aA]\s*>`],
  ['htmlImage', String.raw`(<[iI][mM][gG]\b[^>]*>)`],
  ...HTML_HIDDEN_ELEMENTS.map(
    (tag) =>
      ['hidden', String.raw`(<${caseless(tag)}\b[^>]*>).*?<\/${caseless(tag)}\s*>`] as readonly [
        InlineRule,
        string,
      ],
  ),
  ['layout', String.raw`(<\/?(?:${HTML_LAYOUT_TAGS.join('|')})\b[^>]*>)`],
  ...HTML_CODE_TAGS.map(
    (tag) => ['htmlCode', `<${tag}>(.+?)</${tag}>`] as readonly [InlineRule, string],
  ),
  ...(Object.keys(HTML_STYLE_TAGS) as (keyof typeof HTML_STYLE_TAGS)[]).map(
    (tag) => [`html:${tag}`, `<${tag}>(.+?)</${tag}>`] as readonly [InlineRule, string],
  ),
];

const INLINE_RULE_GROUPS = INLINE_RULES.map(
  ([, pattern]) => new RegExp(`(?:${pattern})|`).exec('')!.length - 1,
);
const INLINE_RULE_OFFSETS = INLINE_RULE_GROUPS.map(
  (_, index) => 1 + INLINE_RULE_GROUPS.slice(0, index).reduce((sum, count) => sum + count, 0),
);
const INLINE_TOKEN = new RegExp(INLINE_RULES.map(([, pattern]) => `(?:${pattern})`).join('|'), 'g');

function backtickRunLength(text: string, at: number): number {
  let end = at;
  while (text[end] === '`') end += 1;
  return end - at;
}

function codeSpanAt(text: string, open: number): { content: string; end: number } | null {
  const fence = backtickRunLength(text, open);
  let idx = open + fence;
  while (idx < text.length) {
    const ch = text[idx];
    if (ch === '`') {
      const run = backtickRunLength(text, idx);
      if (run === fence) return { content: text.slice(open + fence, idx), end: idx + run };
      idx += run;
      continue;
    }
    idx += 1;
  }
  return null;
}

function codeSpanContent(source: string): string {
  const raw = source.replace(/\r?\n/g, ' ');
  const padded = raw.length > 1 && raw.startsWith(' ') && raw.endsWith(' ') && raw.trim() !== '';
  return padded ? raw.slice(1, -1) : raw;
}

function inlineMathEnd(text: string, open: number): number {
  if (text[open - 1] === '$' || text[open + 1] === '$') return -1;
  const close = text.indexOf('$', open + 1);
  if (close <= open + 1 || text.slice(open + 1, close).includes('\n')) return -1;
  return text[close - 1] === '\\' || text[close + 1] === '$' ? -1 : close;
}

function encodePayload(code: number): string {
  return String.fromCharCode(PAYLOAD_BASE + code);
}

export function protectEscapes(text: string): string {
  let out = '';
  let idx = 0;
  while (idx < text.length) {
    const ch = text[idx]!;
    const next = text[idx + 1];
    if (ch === '\\' && next === '\n') {
      idx += 1;
      continue;
    }
    if (ch === '\\' && next !== undefined && ESCAPABLE_PUNCTUATION.test(next)) {
      out += ESCAPE_MARK + encodePayload(next.charCodeAt(0));
      idx += 2;
      continue;
    }
    if (ch === '`') {
      const end = codeSpanAt(text, idx)?.end ?? idx + backtickRunLength(text, idx);
      out += text.slice(idx, end);
      idx = end;
      continue;
    }
    const mathEnd = ch === '$' ? inlineMathEnd(text, idx) : -1;
    if (mathEnd !== -1) {
      out += text.slice(idx, mathEnd + 1);
      idx = mathEnd + 1;
      continue;
    }
    out += ch;
    idx += 1;
  }
  return out;
}

export function restoreEscapes(text: string, keepBackslash = false): string {
  return text.replace(ESCAPED_CHARACTER, (_, payload: string) => {
    const literal = String.fromCharCode(payload.charCodeAt(0) - PAYLOAD_BASE);
    return keepBackslash ? `\\${literal}` : literal;
  });
}

interface ProtectedInline {
  readonly text: string;
  readonly spans: readonly string[];
}

function extractCodeSpans(text: string): ProtectedInline {
  const spans: string[] = [];
  let out = '';
  let idx = 0;
  while (idx < text.length) {
    const ch = text[idx]!;
    if (ch === '`') {
      const span = codeSpanAt(text, idx);
      if (span && spans.length < MAX_CODE_SPANS) {
        out += CODE_MARK + encodePayload(spans.length);
        spans.push(codeSpanContent(span.content));
        idx = span.end;
        continue;
      }
      const run = backtickRunLength(text, idx);
      out += text.slice(idx, idx + run);
      idx += run;
      continue;
    }
    const mathEnd = ch === '$' ? inlineMathEnd(text, idx) : -1;
    if (mathEnd !== -1) {
      out += text.slice(idx, mathEnd + 1);
      idx = mathEnd + 1;
      continue;
    }
    out += ch;
    idx += 1;
  }
  return { text: out, spans };
}

function restoreCodeSpans(text: string, spans: readonly string[]): string {
  return text.replace(
    CODE_PLACEHOLDER,
    (placeholder, payload: string) => spans[payload.charCodeAt(0) - PAYLOAD_BASE] ?? placeholder,
  );
}

function decodeHtmlText(text: string): string {
  return text.replace(HTML_TEXT_TOKEN, (token, reference: string | undefined) =>
    reference ? (decodeCharacterReference(reference) ?? token) : '\n',
  );
}

function displayText(text: string, spans: readonly string[]): string {
  return restoreEscapes(restoreCodeSpans(decodeHtmlText(text), spans));
}

function linkDestination(raw: string, spans: readonly string[]): string {
  const target = restoreEscapes(restoreCodeSpans(raw, spans)).trim().replace(LINK_TITLE, '');
  return target.startsWith('<') && target.endsWith('>') ? target.slice(1, -1) : target;
}

function scriptText(text: string, characters: Readonly<Record<string, string>>): string | null {
  const glyphs = Array.from(text);
  if (glyphs.length === 0 || !glyphs.every((glyph) => characters[glyph])) return null;
  return glyphs.map((glyph) => characters[glyph]).join('');
}

function trimAutolink(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1]!;
    if (AUTOLINK_TRAILING_PUNCTUATION.includes(last)) {
      end -= 1;
      continue;
    }
    if (last === ')') {
      const head = url.slice(0, end);
      if (head.split(')').length > head.split('(').length) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

function autolinkHref(url: string): string | null {
  const href = url.startsWith('www.') ? `https://${url}` : url;
  if (!isValidExternalHttpUrl(href)) return null;
  return new URL(href).hostname.includes('.') ? href : null;
}

const HTML_ATTRIBUTE_VALUE = String.raw`\s*=\s*(?:"([^"\n]*)"|'([^'\n]*)')`;
const HTML_HREF = new RegExp(String.raw`\bhref${HTML_ATTRIBUTE_VALUE}`, 'i');
const HTML_IMAGE_SOURCE = new RegExp(String.raw`\bsrc${HTML_ATTRIBUTE_VALUE}`, 'i');
const HTML_IMAGE_ALT = new RegExp(String.raw`\balt${HTML_ATTRIBUTE_VALUE}`, 'i');

function htmlAttribute(pattern: RegExp, tag: string): string | undefined {
  const match = pattern.exec(tag);
  return match ? (match[1] ?? match[2]) : undefined;
}
const DEFINITION_SHAPED_PREFIX = /(?:^|\n) {0,3}$/;

const NUMERIC_LABEL = /^\d+$/;

export function footnoteNumber(label: string, order: readonly string[] = []): string {
  if (NUMERIC_LABEL.test(label)) return label;
  const position = order.filter((entry) => !NUMERIC_LABEL.test(entry)).indexOf(label);
  return position === -1 ? label : String(position + 1);
}

export function footnoteMarker(label: string, order: readonly string[] = []): string {
  const number = footnoteNumber(label, order);
  return scriptText(number, SUPERSCRIPT_CHARACTERS) ?? `[${number}]`;
}

export function linkDefinitionKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

const LINK_DEFINITION =
  /^ {0,3}\[(?!\^)([^\]]+)\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/;

export function readLinkDefinition(line: string): { label: string; href: string } | null {
  const match = LINK_DEFINITION.exec(line);
  return match ? { label: linkDefinitionKey(match[1]!), href: match[2]! } : null;
}

export function collectLinkDefinitions(lines: readonly string[]): LinkDefinitions {
  const definitions: Record<string, string> = {};
  for (const line of lines) {
    const definition = readLinkDefinition(line);
    if (definition && !(definition.label in definitions)) {
      definitions[definition.label] = definition.href;
    }
  }
  return definitions;
}

function citationMarkersIn(href: string): number[] | null {
  const group = CITATION_GROUP_HREF_PATTERN.exec(href);
  if (group) return (group[1] ?? '').split(',').map(Number);
  const single = CITATION_HREF_PATTERN.exec(href);
  return single ? [Number(single[1])] : null;
}

function definedLink(definitions: LinkDefinitions, label: string): string | undefined {
  const key = linkDefinitionKey(label);
  return Object.prototype.hasOwnProperty.call(definitions, key) ? definitions[key] : undefined;
}

interface ParseContext {
  readonly spans: readonly string[];
  readonly linkDefinitions: LinkDefinitions;
}

function parseProtected(text: string, context: ParseContext): InlineNode[] {
  const { spans } = context;
  const nodes: InlineNode[] = [];
  const pattern = INLINE_TOKEN;
  pattern.lastIndex = 0;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  const pushTextValue = (value: string) => {
    const last = nodes[nodes.length - 1];
    if (last?.type === 'text')
      nodes[nodes.length - 1] = { type: 'text', value: last.value + value };
    else nodes.push({ type: 'text', value });
  };
  const pushText = (raw: string) => {
    const value = displayText(raw, spans);
    if (value) pushTextValue(value);
  };
  const styled = (style: InlineStyleName, inner: string): InlineNode => ({
    type: 'styled',
    style,
    children: parseProtected(inner, context),
  });

  while ((match = pattern.exec(text)) !== null) {
    const ruleIndex = INLINE_RULE_OFFSETS.findIndex((offset) => match![offset] !== undefined);
    const [rule] = INLINE_RULES[ruleIndex]!;
    const offset = INLINE_RULE_OFFSETS[ruleIndex]!;
    const first = match[offset]!;
    const second = match[offset + 1];
    let consumed = match[0].length;

    if (match.index > lastIdx) pushText(text.slice(lastIdx, match.index));

    switch (rule) {
      case 'math':
        nodes.push({ type: 'math', tex: restoreEscapes(first.trim(), true) });
        break;
      case 'code': {
        const value = spans[first.charCodeAt(0) - PAYLOAD_BASE];
        nodes.push(
          value === undefined ? { type: 'text', value: match[0] } : { type: 'code', value },
        );
        break;
      }
      case 'strongEm':
        nodes.push(styled('strongEm', first));
        break;
      case 'strong':
        nodes.push(styled('strong', first));
        break;
      case 'em':
        nodes.push(styled('em', first));
        break;
      case 'strike':
        nodes.push(styled('strike', first));
        break;
      case 'image': {
        const alt = displayText(first, spans).trim();
        nodes.push({
          type: 'link',
          href: linkDestination(second ?? '', spans),
          children: [{ type: 'text', value: alt || 'Image' }],
        });
        break;
      }
      case 'link': {
        const href = linkDestination(second ?? '', spans);
        const markers = citationMarkersIn(href);
        nodes.push(
          markers
            ? { type: 'citation', markers, raw: markers.map((marker) => `[${marker}]`).join('') }
            : { type: 'link', href, children: parseProtected(first, context) },
        );
        break;
      }
      case 'refLink': {
        const href = definedLink(context.linkDefinitions, second ? second : first);
        if (href === undefined) {
          nodes.push({ type: 'text', value: '[' });
          nodes.push(...parseProtected(first, context));
          nodes.push({ type: 'text', value: `][${displayText(second ?? '', spans)}]` });
          break;
        }
        nodes.push({ type: 'link', href, children: parseProtected(first, context) });
        break;
      }
      case 'shortcutRef': {
        const definitionShaped =
          text[match.index + match[0].length] === ':' &&
          DEFINITION_SHAPED_PREFIX.test(text.slice(0, match.index));
        const href = definitionShaped ? undefined : definedLink(context.linkDefinitions, first);
        if (href === undefined) {
          pushTextValue('[');
          consumed = 1;
          break;
        }
        nodes.push({ type: 'link', href, children: parseProtected(first, context) });
        break;
      }
      case 'footnote':
        nodes.push({ type: 'footnote', label: restoreEscapes(first) });
        break;
      case 'badge': {
        const label = displayText(first, spans).trim();
        if (label) nodes.push({ type: 'badge', label });
        break;
      }
      case 'url': {
        const bare = !match[0].startsWith('<');
        const url = bare ? trimAutolink(first) : first;
        const label = restoreEscapes(url);
        const href = url ? autolinkHref(label) : null;
        if (!href) {
          nodes.push({ type: 'text', value: restoreEscapes(match[0]) });
          break;
        }
        if (bare) consumed = url.length;
        nodes.push({ type: 'link', href, children: [{ type: 'text', value: label }] });
        break;
      }
      case 'email': {
        const address = restoreEscapes(first);
        nodes.push({
          type: 'link',
          href: `mailto:${address}`,
          children: [{ type: 'text', value: address }],
        });
        break;
      }
      case 'anchor': {
        const href = htmlAttribute(HTML_HREF, first);
        const children = parseProtected(second ?? '', context);
        if (href === undefined) nodes.push(...children);
        else nodes.push({ type: 'link', href: linkDestination(href, spans), children });
        break;
      }
      case 'htmlImage': {
        const source = htmlAttribute(HTML_IMAGE_SOURCE, first);
        if (!source) break;
        const alt = displayText(htmlAttribute(HTML_IMAGE_ALT, first) ?? '', spans).trim();
        nodes.push({
          type: 'link',
          href: linkDestination(source, spans),
          children: [{ type: 'text', value: alt || 'Image' }],
        });
        break;
      }
      case 'hidden':
      case 'comment':
      case 'layout':
        break;
      case 'htmlCode':
        nodes.push({ type: 'code', value: restoreEscapes(restoreCodeSpans(first, spans), true) });
        break;
      default: {
        const style = HTML_STYLE_TAGS[rule.slice('html:'.length) as keyof typeof HTML_STYLE_TAGS];
        if (style === 'sup' || style === 'sub') {
          const glyphs = scriptText(
            displayText(first, spans),
            style === 'sup' ? SUPERSCRIPT_CHARACTERS : SUBSCRIPT_CHARACTERS,
          );
          nodes.push(glyphs ? { type: 'text', value: glyphs } : styled(style, first));
        } else {
          nodes.push(styled(style, first));
        }
      }
    }

    lastIdx = match.index + consumed;
    pattern.lastIndex = lastIdx;
  }

  if (lastIdx < text.length) pushText(text.slice(lastIdx));
  return nodes;
}

export function parseInlineMarkdown(
  source: string,
  options: InlineParseOptions = {},
): InlineNode[] {
  const escaped = protectEscapes(source);
  const linked =
    options.citationCount && options.citationCount > 0
      ? linkifyCitationMarkers(escaped, options.citationCount)
      : escaped;
  const { text, spans } = extractCodeSpans(linked);
  return parseProtected(text, { spans, linkDefinitions: options.linkDefinitions ?? {} });
}

export function inlineNodesText(
  nodes: readonly InlineNode[],
  footnoteOrder: readonly string[] = [],
): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.value;
        case 'math':
          return node.tex;
        case 'styled':
        case 'link':
          return inlineNodesText(node.children, footnoteOrder);
        case 'footnote':
          return footnoteMarker(node.label, footnoteOrder);
        case 'badge':
          return node.label;
        case 'citation':
          return node.raw;
      }
    })
    .join('');
}

export function inlinePlainText(
  source: string,
  options: InlineParseOptions & { readonly footnoteOrder?: readonly string[] } = {},
): string {
  return inlineNodesText(parseInlineMarkdown(source, options), options.footnoteOrder);
}
