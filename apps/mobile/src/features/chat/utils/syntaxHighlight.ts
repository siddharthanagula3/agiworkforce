/**
 * Minimal pure-JS syntax tokenizer for the raw-source code views
 * (MessageContentRenderer code blocks + ArtifactFullScreen source view).
 *
 * Deliberately NOT a real parser: a single-pass regex alternation splits
 * code into comment / string / number spans, then a word scan marks
 * keywords in the remaining plain text. Every regex is written without
 * nested quantifiers so no input can trigger catastrophic backtracking,
 * and inputs above MAX_HIGHLIGHT_LENGTH render as a single plain token.
 */

import type { ColorScheme } from '@/src/ui/theme';

export type SyntaxTokenType = 'comment' | 'string' | 'number' | 'keyword' | 'plain';

export interface SyntaxToken {
  text: string;
  type: SyntaxTokenType;
}

interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/** Beyond ~50KB, tokenizing (and rendering thousands of spans) is not worth it. */
export const MAX_HIGHLIGHT_LENGTH = 50_000;
const MINIMUM_CODE_CONTRAST = 4.5;
const syntaxPaletteCache = new WeakMap<object, Record<SyntaxTokenType, string>>();

// ── Shared regex fragments (all backtracking-safe: disjoint alternatives,
//    no nested quantifiers) ──
const DQ_STRING = String.raw`"(?:[^"\\\n]|\\.)*"`;
const SQ_STRING = String.raw`'(?:[^'\\\n]|\\.)*'`;
const TEMPLATE_STRING = '`(?:[^`\\\\]|\\\\.)*`';
const PY_TRIPLE_STRING = String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''`;
const NUMBER = String.raw`\b0[xX][0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b`;
const SLASH_LINE_COMMENT = String.raw`\/\/[^\n]*`;
const BLOCK_COMMENT = String.raw`\/\*[\s\S]*?\*\/`;
const HASH_COMMENT = String.raw`#[^\n]*`;

interface LanguageSpec {
  /** Alternation with 3 capture groups: (comment)|(string)|(number). */
  pattern: RegExp;
  keywords: ReadonlySet<string>;
  /** SQL keywords match regardless of case. */
  caseInsensitiveKeywords?: boolean;
}

function makeSpec(
  comment: string,
  string: string,
  keywords: string,
  caseInsensitiveKeywords = false,
): LanguageSpec {
  return {
    pattern: new RegExp(`(${comment})|(${string})|(${NUMBER})`, 'g'),
    keywords: new Set(keywords.split(' ')),
    caseInsensitiveKeywords,
  };
}

const JS_KEYWORDS =
  'const let var function return if else for while do switch case break continue new class ' +
  'extends super import export from default try catch finally throw async await yield typeof ' +
  'instanceof in of delete void this null undefined true false static get set interface type ' +
  'enum implements namespace declare as satisfies keyof infer never unknown any readonly';

const PYTHON_KEYWORDS =
  'def return if elif else for while break continue pass import from as class try except ' +
  'finally raise with lambda yield global nonlocal assert del not and or in is None True False ' +
  'async await match case self';

const SHELL_KEYWORDS =
  'if then else elif fi for while until do done case esac function in select echo export ' +
  'local return exit source set unset readonly shift trap eval exec';

const SQL_KEYWORDS =
  'select from where insert update delete into values set join left right inner outer full on ' +
  'group by order having limit offset create table view drop alter add column index primary ' +
  'key foreign references not null default unique union all distinct as and or in is between ' +
  'like exists case when then else end count sum avg min max cast begin commit rollback';

const JVM_KEYWORDS =
  'class interface enum extends implements import package public private protected internal ' +
  'static final abstract void int long short byte double float boolean char new return if else ' +
  'for while do switch case break continue try catch finally throw throws this super null true ' +
  'false instanceof synchronized volatile transient native fun val var when object companion ' +
  'override data sealed init constructor lateinit suspend func let guard defer struct protocol ' +
  'extension deinit inout mutating some any where associatedtype typealias open is in';

const RUST_KEYWORDS =
  'fn let mut const static struct enum trait impl for while loop if else match return use mod ' +
  'pub crate super self Self ref move async await dyn unsafe extern type where as in break ' +
  'continue true false Some None Ok Err String Vec Box Option Result';

const GO_KEYWORDS =
  'func package import var const type struct interface map chan go defer return if else for ' +
  'range switch case break continue fallthrough select goto true false nil iota make new len ' +
  'cap append error string int int64 float64 bool byte rune';

const SPEC_JS = makeSpec(
  `${SLASH_LINE_COMMENT}|${BLOCK_COMMENT}`,
  `${DQ_STRING}|${SQ_STRING}|${TEMPLATE_STRING}`,
  JS_KEYWORDS,
);
const SPEC_PYTHON = makeSpec(
  HASH_COMMENT,
  `${PY_TRIPLE_STRING}|${DQ_STRING}|${SQ_STRING}`,
  PYTHON_KEYWORDS,
);
const SPEC_JSON = makeSpec('(?!)', DQ_STRING, 'true false null');
const SPEC_HTML = makeSpec(String.raw`<!--[\s\S]*?-->`, `${DQ_STRING}|${SQ_STRING}`, '');
const SPEC_CSS = makeSpec(BLOCK_COMMENT, `${DQ_STRING}|${SQ_STRING}`, '');
// Shell single-quoted strings have no escapes and may span lines.
const SPEC_SHELL = makeSpec(HASH_COMMENT, String.raw`"(?:[^"\\]|\\.)*"|'[^']*'`, SHELL_KEYWORDS);
const SPEC_SQL = makeSpec(
  String.raw`--[^\n]*|${BLOCK_COMMENT}`,
  `${SQ_STRING}|${DQ_STRING}`,
  SQL_KEYWORDS,
  true,
);
const SPEC_JVM = makeSpec(
  `${SLASH_LINE_COMMENT}|${BLOCK_COMMENT}`,
  `${DQ_STRING}|${SQ_STRING}`,
  JVM_KEYWORDS,
);
const SPEC_RUST = makeSpec(`${SLASH_LINE_COMMENT}|${BLOCK_COMMENT}`, DQ_STRING, RUST_KEYWORDS);
const SPEC_GO = makeSpec(
  `${SLASH_LINE_COMMENT}|${BLOCK_COMMENT}`,
  `${DQ_STRING}|${TEMPLATE_STRING}|${SQ_STRING}`,
  GO_KEYWORDS,
);

const LANGUAGE_SPECS: Record<string, LanguageSpec> = {
  js: SPEC_JS,
  jsx: SPEC_JS,
  javascript: SPEC_JS,
  ts: SPEC_JS,
  tsx: SPEC_JS,
  typescript: SPEC_JS,
  py: SPEC_PYTHON,
  python: SPEC_PYTHON,
  json: SPEC_JSON,
  html: SPEC_HTML,
  xml: SPEC_HTML,
  svg: SPEC_HTML,
  css: SPEC_CSS,
  sh: SPEC_SHELL,
  bash: SPEC_SHELL,
  shell: SPEC_SHELL,
  zsh: SPEC_SHELL,
  sql: SPEC_SQL,
  java: SPEC_JVM,
  kotlin: SPEC_JVM,
  kt: SPEC_JVM,
  swift: SPEC_JVM,
  rust: SPEC_RUST,
  rs: SPEC_RUST,
  go: SPEC_GO,
  golang: SPEC_GO,
};

const WORD_REGEX = /[A-Za-z_][A-Za-z0-9_]*/g;

/** Splits a non-comment/string/number span into keyword and plain tokens. */
function pushPlainWithKeywords(text: string, spec: LanguageSpec, tokens: SyntaxToken[]): void {
  let last = 0;
  let match: RegExpExecArray | null;
  WORD_REGEX.lastIndex = 0;
  while ((match = WORD_REGEX.exec(text)) !== null) {
    const word = spec.caseInsensitiveKeywords ? match[0].toLowerCase() : match[0];
    if (!spec.keywords.has(word)) continue;
    if (match.index > last) pushToken(tokens, text.slice(last, match.index), 'plain');
    pushToken(tokens, match[0], 'keyword');
    last = match.index + match[0].length;
  }
  if (last < text.length) pushToken(tokens, text.slice(last), 'plain');
}

/** Appends a token, merging into the previous one when the type matches. */
function pushToken(tokens: SyntaxToken[], text: string, type: SyntaxTokenType): void {
  if (text.length === 0) return;
  const prev = tokens[tokens.length - 1];
  if (prev && prev.type === type) {
    prev.text += text;
    return;
  }
  tokens.push({ text, type });
}

/**
 * Tokenizes code into highlightable spans. Unknown languages and oversize
 * inputs return a single plain token, so callers can always render the
 * result without a separate fallback branch.
 */
export function tokenizeCode(code: string, language: string | undefined): SyntaxToken[] {
  if (code.length === 0) return [];
  const spec = LANGUAGE_SPECS[language?.trim().toLowerCase() ?? ''];
  if (!spec || code.length > MAX_HIGHLIGHT_LENGTH) {
    return [{ text: code, type: 'plain' }];
  }

  const tokens: SyntaxToken[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  spec.pattern.lastIndex = 0;
  while ((match = spec.pattern.exec(code)) !== null) {
    if (match.index > last) {
      pushPlainWithKeywords(code.slice(last, match.index), spec, tokens);
    }
    const type: SyntaxTokenType =
      match[1] !== undefined ? 'comment' : match[2] !== undefined ? 'string' : 'number';
    pushToken(tokens, match[0], type);
    last = match.index + match[0].length;
    // Zero-length matches cannot occur with these patterns, but guard anyway
    // so a future pattern edit can never hang the exec loop.
    if (match[0].length === 0) spec.pattern.lastIndex++;
  }
  if (last < code.length) pushPlainWithKeywords(code.slice(last), spec, tokens);
  return tokens;
}

function parseCssColor(value: unknown): RgbaColor | null {
  if (typeof value !== 'string') return null;
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (hexMatch) {
    const compact = hexMatch[1]!;
    const expanded =
      compact.length === 3
        ? compact
            .split('')
            .map((part) => part + part)
            .join('')
        : compact;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
      alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }

  const functionalMatch = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (!functionalMatch) return null;
  const channels = functionalMatch[1]!.split(',').map((channel) => Number(channel.trim()));
  if (
    channels.length < 3 ||
    channels.some((channel) => !Number.isFinite(channel)) ||
    (channels[3] !== undefined && (channels[3] < 0 || channels[3] > 1))
  ) {
    return null;
  }
  return {
    red: Math.min(255, Math.max(0, channels[0]!)),
    green: Math.min(255, Math.max(0, channels[1]!)),
    blue: Math.min(255, Math.max(0, channels[2]!)),
    alpha: channels[3] ?? 1,
  };
}

function flattenColor(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  return {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    alpha: 1,
  };
}

function relativeLuminance(color: RgbaColor): number {
  const channels = [color.red, color.green, color.blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(first: RgbaColor, second: RgbaColor): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function opaqueRgb(color: RgbaColor): RgbaColor {
  return {
    red: Math.round(color.red),
    green: Math.round(color.green),
    blue: Math.round(color.blue),
    alpha: 1,
  };
}

function mixColors(from: RgbaColor, to: RgbaColor, amount: number): RgbaColor {
  return opaqueRgb({
    red: from.red + (to.red - from.red) * amount,
    green: from.green + (to.green - from.green) * amount,
    blue: from.blue + (to.blue - from.blue) * amount,
    alpha: 1,
  });
}

function formatRgb(color: RgbaColor): string {
  return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}

/**
 * Preserve the theme's semantic hue, but pull it toward primary text until it
 * reaches WCAG AA on both code surfaces: inline blocks use `surfaceHover`,
 * while the fullscreen artifact source view uses `surfaceBase`.
 */
function accessibleCodeColor(candidate: string, colors: ColorScheme): string {
  const canvas = parseCssColor(colors.background);
  const parsedHover = parseCssColor(colors.surfaceHover);
  const parsedBase = parseCssColor(colors.surfaceBase);
  const parsedCandidate = parseCssColor(candidate);
  const parsedPrimary = parseCssColor(colors.textPrimary);
  if (!canvas || !parsedHover || !parsedBase || !parsedCandidate || !parsedPrimary) {
    return colors.textPrimary;
  }

  const opaqueCanvas = opaqueRgb(canvas);
  const backgrounds = [
    opaqueRgb(flattenColor(parsedHover, opaqueCanvas)),
    opaqueRgb(flattenColor(parsedBase, opaqueCanvas)),
  ];
  const start = opaqueRgb(flattenColor(parsedCandidate, backgrounds[0]!));
  const target = opaqueRgb(flattenColor(parsedPrimary, backgrounds[0]!));
  const meetsContrast = (color: RgbaColor) =>
    backgrounds.every((background) => contrastRatio(color, background) >= MINIMUM_CODE_CONTRAST);

  if (meetsContrast(start)) {
    // Preserve an already-accessible opaque semantic token verbatim. Besides
    // avoiding needless churn in rendered styles, this keeps theme identity
    // stable for snapshots and consumers that compare color strings.
    return parsedCandidate.alpha === 1 ? candidate : formatRgb(start);
  }
  for (let step = 1; step <= 100; step++) {
    const adjusted = mixColors(start, target, step / 100);
    if (meetsContrast(adjusted)) return formatRgb(adjusted);
  }
  return colors.textPrimary;
}

function syntaxPalette(colors: ColorScheme): Record<SyntaxTokenType, string> {
  const cached = syntaxPaletteCache.get(colors);
  if (cached) return cached;
  const palette: Record<SyntaxTokenType, string> = {
    comment: accessibleCodeColor(colors.textSecondary, colors),
    string: accessibleCodeColor(colors.agentSuccess, colors),
    number: accessibleCodeColor(colors.agentWarning, colors),
    keyword: accessibleCodeColor(colors.purple, colors),
    plain: accessibleCodeColor(colors.textPrimary, colors),
  };
  syntaxPaletteCache.set(colors, palette);
  return palette;
}

/** Maps a token type to an accessible theme-derived code color. */
export function syntaxTokenColor(type: SyntaxTokenType, colors: ColorScheme): string {
  return syntaxPalette(colors)[type];
}
