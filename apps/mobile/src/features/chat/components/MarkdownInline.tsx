import { Alert, Linking, type TextStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { MathBlock } from './MathBlock';
import { colors as defaultColors, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  classifyExternalLink,
  getSystemIntentPrompt,
  isValidExternalHttpUrl,
} from '@/src/features/chat/utils/externalUrls';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { canPreviewCitation, previewCitation, type CitationSource } from './CitationChip';

const ESCAPABLE_PUNCTUATION = /[!-/:-@[-`{-~]/;
const ESCAPE_SENTINEL_BASE = 0xe000;
const ESCAPE_SENTINELS = /[-]/g;
const INLINE_MATH = /(?<![\\$])\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)/g;
const HTML_TEXT_TOKEN = /<br\s*\/?>|&(#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z\d]{1,31});/gi;
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  // em-dash-allow: decodes the entity a model writes, not product copy
  mdash: '\u2014',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  times: '×',
  divide: '÷',
  plusmn: '±',
  deg: '°',
  copy: '©',
  reg: '®',
  trade: '™',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  le: '≤',
  ge: '≥',
  ne: '≠',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
};
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
const HTML_INLINE_TAGS = [
  'b',
  'strong',
  'i',
  'em',
  'u',
  'ins',
  's',
  'del',
  'sub',
  'sup',
  'kbd',
  'code',
  'mark',
  'small',
] as const;
type HtmlInlineTag = (typeof HTML_INLINE_TAGS)[number];

type InlineRule =
  | 'math'
  | 'strongEm'
  | 'strong'
  | 'em'
  | 'strike'
  | 'code'
  | 'image'
  | 'link'
  | 'footnote'
  | 'citation'
  | 'url'
  | `html:${HtmlInlineTag}`;

const INLINE_RULES: ReadonlyArray<readonly [InlineRule, string]> = [
  ['math', INLINE_MATH.source],
  ['strongEm', String.raw`\*\*\*(?![\s*])(.+?)(?<![\s*])\*\*\*`],
  ['strong', String.raw`\*\*(?![\s*])(.+?)(?<!\s)\*\*`],
  ['strong', String.raw`(?<![A-Za-z0-9_])__(?![\s_])(.+?)(?<!\s)__(?![A-Za-z0-9_])`],
  ['em', String.raw`\*(?![\s*])(.+?)(?<![\s*])\*`],
  ['em', String.raw`(?<![A-Za-z0-9_])_(?![\s_])(.+?)(?<!\s)_(?![A-Za-z0-9_])`],
  ['strike', String.raw`~~(?!\s)(.+?)(?<!\s)~~`],
  ['code', '`([^`]+)`'],
  ['image', String.raw`!\[([^\]]*)\]${LINK_TARGET}`],
  ['link', String.raw`\[([^\]]+)\]${LINK_TARGET}`],
  ['footnote', String.raw`\[\^([^\]\s]+)\]`],
  ['citation', String.raw`\[(\d{1,3})\](?!\()`],
  ['url', String.raw`<(https?:\/\/[^\s<>]+)>`],
  ['url', String.raw`(?<![A-Za-z0-9_/])(https?:\/\/[^\s<>\]]+)`],
  ['url', String.raw`(?<![A-Za-z0-9_/@.-])(www\.[^\s<>\]]+)`],
  ...HTML_INLINE_TAGS.map(
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

function codeSpanEnd(text: string, open: number): number {
  const close = text.indexOf('`', open + 1);
  return close === -1 || text.slice(open + 1, close).includes('\n') ? -1 : close;
}

function inlineMathEnd(text: string, open: number): number {
  if (text[open - 1] === '$' || text[open + 1] === '$') return -1;
  const close = text.indexOf('$', open + 1);
  if (close <= open + 1 || text.slice(open + 1, close).includes('\n')) return -1;
  return text[close - 1] === '\\' || text[close + 1] === '$' ? -1 : close;
}

export function protectEscapes(text: string): string {
  let out = '';
  let idx = 0;
  while (idx < text.length) {
    const ch = text[idx]!;
    const next = text[idx + 1];
    if (ch === '\\' && next !== undefined && ESCAPABLE_PUNCTUATION.test(next)) {
      out += String.fromCharCode(ESCAPE_SENTINEL_BASE + next.charCodeAt(0));
      idx += 2;
      continue;
    }
    const spanEnd =
      ch === '`' ? codeSpanEnd(text, idx) : ch === '$' ? inlineMathEnd(text, idx) : -1;
    if (spanEnd !== -1) {
      out += text.slice(idx, spanEnd + 1);
      idx = spanEnd + 1;
      continue;
    }
    out += ch;
    idx += 1;
  }
  return out;
}

export function restoreEscapes(text: string, keepBackslash = false): string {
  return text.replace(ESCAPE_SENTINELS, (sentinel) => {
    const literal = String.fromCharCode(sentinel.charCodeAt(0) - ESCAPE_SENTINEL_BASE);
    return keepBackslash ? `\\${literal}` : literal;
  });
}

function decodeHtmlText(text: string): string {
  return text.replace(HTML_TEXT_TOKEN, (token, entity: string | undefined) => {
    if (!entity) return '\n';
    if (entity.startsWith('#')) {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
      return valid ? String.fromCodePoint(code) : token;
    }
    return HTML_ENTITIES[entity] ?? token;
  });
}

function linkDestination(raw: string): string {
  const target = restoreEscapes(raw).trim().replace(LINK_TITLE, '');
  return target.startsWith('<') && target.endsWith('>') ? target.slice(1, -1) : target;
}

function plainText(text: string): string {
  return restoreEscapes(decodeHtmlText(text));
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

export function openAssistantLink(url: string): void {
  const kind = classifyExternalLink(url);
  if (kind === 'http') {
    void openUntrustedUrlInAppBrowser(url);
    return;
  }
  if (kind !== 'system-intent') return;
  const prompt = getSystemIntentPrompt(url);
  if (!prompt) return;
  Alert.alert(prompt.title, prompt.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open', onPress: () => Linking.openURL(url).catch(() => undefined) },
  ]);
}

export function inlineCodeStyle(renderColors: ColorScheme): TextStyle {
  return {
    fontFamily: 'Menlo',
    fontSize: typeScale.footnote,
    backgroundColor: renderColors.surfaceHover,
    color: renderColors.textPrimary,
  };
}

export function footnoteMarker(label: string): string {
  return scriptText(label, SUPERSCRIPT_CHARACTERS) ?? `[${label}]`;
}

export function renderInlineMath(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const mathRegex = new RegExp(INLINE_MATH);
  let lastIdx = 0;
  let keyCounter = 0;
  let match: RegExpExecArray | null;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(plainText(text.slice(lastIdx, match.index)));
    }
    parts.push(
      <MathBlock
        key={`${keyBase}-imath-${keyCounter++}`}
        latex={restoreEscapes(match[1]!.trim(), true)}
        display={false}
      />,
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(plainText(text.slice(lastIdx)));
  }
  return parts;
}

const HTML_TAG_STYLES: Partial<Record<HtmlInlineTag, TextStyle>> = {
  b: { fontWeight: '700' },
  strong: { fontWeight: '700' },
  i: { fontStyle: 'italic' },
  em: { fontStyle: 'italic' },
  u: { textDecorationLine: 'underline' },
  ins: { textDecorationLine: 'underline' },
  s: { textDecorationLine: 'line-through' },
  del: { textDecorationLine: 'line-through' },
  small: { fontSize: typeScale.caption },
};

export function renderInlineMarkdown(
  source: string,
  keyBase = 'inline',
  renderColors: ColorScheme = defaultColors,
  citations: readonly CitationSource[] = [],
): React.ReactNode[] {
  const text = protectEscapes(source);
  const parts: React.ReactNode[] = [];
  const pattern = INLINE_TOKEN;
  pattern.lastIndex = 0;
  let lastIdx = 0;
  let inlineKey = 0;
  let match: RegExpExecArray | null;

  const nested = (inner: string, style: TextStyle) => {
    const key = `${keyBase}-n${inlineKey++}`;
    return (
      <Text variant="inline" key={key} style={{ color: renderColors.textPrimary, ...style }}>
        {renderInlineMarkdown(inner, key, renderColors, citations)}
      </Text>
    );
  };
  const link = (label: string, url: string) => (
    <Text
      variant="inline"
      key={`${keyBase}-link-${inlineKey++}`}
      style={{ color: renderColors.textPrimary, textDecorationLine: 'underline' }}
      onPress={() => openAssistantLink(url)}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      {label}
    </Text>
  );
  const code = (value: string) => (
    <Text
      variant="inline"
      key={`${keyBase}-code-${inlineKey++}`}
      style={inlineCodeStyle(renderColors)}
    >
      {` ${restoreEscapes(value, true)} `}
    </Text>
  );

  while ((match = pattern.exec(text)) !== null) {
    const ruleIndex = INLINE_RULE_OFFSETS.findIndex((offset) => match![offset] !== undefined);
    const [rule] = INLINE_RULES[ruleIndex]!;
    const offset = INLINE_RULE_OFFSETS[ruleIndex]!;
    const first = match[offset]!;
    const second = match[offset + 1];
    let consumed = match[0].length;

    if (match.index > lastIdx) {
      parts.push(
        ...renderInlineMath(text.slice(lastIdx, match.index), `${keyBase}-pre-${inlineKey}`),
      );
    }

    switch (rule) {
      case 'math':
        parts.push(...renderInlineMath(match[0], `${keyBase}-math-${inlineKey++}`));
        break;
      case 'strongEm':
        parts.push(nested(first, { fontWeight: '700', fontStyle: 'italic' }));
        break;
      case 'strong':
        parts.push(nested(first, { fontWeight: '700' }));
        break;
      case 'em':
        parts.push(nested(first, { fontStyle: 'italic' }));
        break;
      case 'strike':
        parts.push(
          nested(first, { textDecorationLine: 'line-through', color: renderColors.textMuted }),
        );
        break;
      case 'code':
        parts.push(code(first));
        break;
      case 'image': {
        const alt = plainText(first).trim();
        parts.push(link(alt || 'Image', linkDestination(second ?? '')));
        break;
      }
      case 'link':
        parts.push(link(plainText(first), linkDestination(second ?? '')));
        break;
      case 'footnote': {
        const label = restoreEscapes(first);
        parts.push(
          <Text
            variant="inline"
            key={`${keyBase}-fn-${inlineKey++}`}
            style={{ color: renderColors.textPrimary }}
            accessibilityLabel={`Footnote ${label}`}
          >
            {footnoteMarker(label)}
          </Text>,
        );
        break;
      }
      case 'citation': {
        const marker = Number(first);
        const citation = citations[marker - 1];
        if (citation && canPreviewCitation(citation)) {
          parts.push(
            <Text
              variant="inline"
              key={`${keyBase}-cite-${inlineKey++}`}
              style={{ color: renderColors.teal, fontWeight: '600' }}
              onPress={() => previewCitation(citation)}
              accessibilityRole="link"
              accessibilityLabel={`Citation ${marker}: ${citation.title || citation.url}`}
            >
              {`[${marker}]`}
            </Text>,
          );
        } else {
          parts.push(match[0]);
        }
        break;
      }
      case 'url': {
        const bare = !match[0].startsWith('<');
        const url = bare ? trimAutolink(first) : first;
        const label = restoreEscapes(url);
        const href = url ? autolinkHref(label) : null;
        if (!href) {
          parts.push(restoreEscapes(match[0]));
          break;
        }
        if (bare) consumed = url.length;
        parts.push(link(label, href));
        break;
      }
      default: {
        const tag = rule.slice('html:'.length) as HtmlInlineTag;
        if (tag === 'code' || tag === 'kbd') {
          parts.push(code(first));
        } else if (tag === 'sup' || tag === 'sub') {
          const glyphs = scriptText(
            plainText(first),
            tag === 'sup' ? SUPERSCRIPT_CHARACTERS : SUBSCRIPT_CHARACTERS,
          );
          parts.push(glyphs ?? nested(first, { fontSize: typeScale.caption }));
        } else if (tag === 'mark') {
          parts.push(nested(first, { backgroundColor: renderColors.surfaceHover }));
        } else {
          parts.push(nested(first, HTML_TAG_STYLES[tag] ?? {}));
        }
      }
    }

    lastIdx = match.index + consumed;
    pattern.lastIndex = lastIdx;
  }

  if (lastIdx < text.length) {
    parts.push(...renderInlineMath(text.slice(lastIdx), `${keyBase}-post`));
  }

  return parts;
}
