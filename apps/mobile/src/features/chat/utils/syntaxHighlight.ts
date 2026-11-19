import {
  resolveHighlightLanguage,
  type LanguageId,
} from '@agiworkforce/unified-chat/highlight-languages';
import type { ColorScheme } from '@/src/ui/theme';

export type SyntaxTokenType =
  'comment' | 'string' | 'number' | 'keyword' | 'function' | 'type' | 'plain';

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

export const MAX_HIGHLIGHT_LENGTH = 50_000;
const MINIMUM_CODE_CONTRAST = 4.5;
const syntaxPaletteCache = new WeakMap<object, Record<SyntaxTokenType, string>>();

const DQ_STRING = String.raw`"(?:[^"\\\n]|\\.)*"`;
const SQ_STRING = String.raw`'(?:[^'\\\n]|\\.)*'`;
const TEMPLATE_STRING = '`(?:[^`\\\\]|\\\\.)*`';
const PY_TRIPLE_STRING = String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''`;
const NUMBER = String.raw`\b0[xX][0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b`;
const SLASH_LINE_COMMENT = String.raw`\/\/[^\n]*`;
const BLOCK_COMMENT = String.raw`\/\*[\s\S]*?\*\/`;
const HASH_COMMENT = String.raw`#[^\n]*`;

interface LanguageSpec {
  pattern: RegExp;
  keywords: ReadonlySet<string>;
  caseInsensitiveKeywords: boolean;
  identifiers: boolean;
}

interface SpecOptions {
  caseInsensitiveKeywords?: boolean;
  named?: { lead: string; name: string };
  identifiers?: boolean;
}

const NEVER = '(?!)';

function makeSpec(
  comment: string,
  string: string,
  keywords: string,
  options: SpecOptions = {},
): LanguageSpec {
  const named = options.named ?? { lead: NEVER, name: NEVER };
  return {
    pattern: new RegExp(
      `(${comment})|(${string})|(${NUMBER})|(${named.lead})(${named.name})`,
      'gm',
    ),
    keywords: new Set(keywords.split(' ').filter(Boolean)),
    caseInsensitiveKeywords: options.caseInsensitiveKeywords === true,
    identifiers: options.identifiers === true,
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
  'extension deinit inout mutating some any where associatedtype typealias open is in def ' +
  'trait match lazy implicit yield with';

const RUST_KEYWORDS =
  'fn let mut const static struct enum trait impl for while loop if else match return use mod ' +
  'pub crate super self Self ref move async await dyn unsafe extern type where as in break ' +
  'continue true false Some None Ok Err String Vec Box Option Result';

const GO_KEYWORDS =
  'func package import var const type struct interface map chan go defer return if else for ' +
  'range switch case break continue fallthrough select goto true false nil iota make new len ' +
  'cap append error string int int64 float64 bool byte rune';

const C_FAMILY_KEYWORDS =
  'auto break case char const continue default do double else enum extern float for goto if ' +
  'inline int long register return short signed sizeof static struct switch typedef union ' +
  'unsigned void volatile while bool true false nullptr NULL class namespace template typename ' +
  'public private protected virtual override final new delete this using try catch throw ' +
  'constexpr noexcept operator friend explicit mutable include define ifdef ifndef endif pragma ' +
  'nil self import interface implementation property';

const CSHARP_KEYWORDS =
  'using namespace class struct interface enum record public private protected internal static ' +
  'readonly const void int long short byte string bool double float decimal char object var ' +
  'new return if else for foreach while do switch case break continue try catch finally throw ' +
  'this base null true false async await get set init override virtual abstract sealed partial ' +
  'in out ref is as typeof nameof default';

const PHP_KEYWORDS =
  'function fn return if else elseif foreach for while do switch case match break continue ' +
  'class interface trait extends implements abstract final public private protected static ' +
  'const new echo print array null true false namespace use try catch finally throw as';

const RUBY_KEYWORDS =
  'def end class module if elsif else unless while until for in do return yield begin rescue ' +
  'ensure raise then case when nil true false self require attr_accessor attr_reader puts and ' +
  'or not lambda proc next break';

const PERL_KEYWORDS =
  'my our local sub if elsif else unless while until for foreach return use package print ' +
  'last next require';

const R_KEYWORDS =
  'function if else for while repeat break next return TRUE FALSE NULL NA in library';

const ELIXIR_KEYWORDS =
  'def defp defmodule defstruct do end if else unless case cond fn when with import alias use ' +
  'require true false nil';

const LUA_KEYWORDS =
  'and break do else elseif end false for function goto if in local nil not or repeat return ' +
  'then true until while';

const HASKELL_KEYWORDS =
  'module where import qualified as hiding data type newtype class instance deriving let in ' +
  'case of if then else do';

const ZIG_KEYWORDS =
  'const var fn pub return if else while for switch struct enum union error try catch defer ' +
  'comptime null undefined true false';

const DOCKER_KEYWORDS =
  'FROM RUN CMD LABEL EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD ' +
  'STOPSIGNAL HEALTHCHECK SHELL AS';

const MAKE_KEYWORDS = 'ifeq ifneq ifdef ifndef else endif include define endef export override';

const NGINX_KEYWORDS =
  'server location listen server_name root index proxy_pass return rewrite if include ' +
  'upstream http events';

const TERRAFORM_KEYWORDS =
  'resource variable output provider module data locals terraform true false null for in if';

const POWERSHELL_KEYWORDS =
  'function param if else elseif foreach for while do switch return try catch finally throw ' +
  'begin process end';

const GRAPHQL_KEYWORDS =
  'query mutation subscription fragment on type input enum interface union scalar schema ' +
  'extend implements directive true false null';

const PROTO_KEYWORDS =
  'syntax package import option message enum service rpc returns repeated optional required ' +
  'oneof map reserved string int32 int64 uint32 uint64 bool bytes double float';

const PRISMA_KEYWORDS =
  'model enum datasource generator type String Int BigInt Boolean DateTime Float Decimal Json Bytes';

const SLASH_COMMENTS = `${SLASH_LINE_COMMENT}|${BLOCK_COMMENT}`;
const QUOTED = `${DQ_STRING}|${SQ_STRING}`;
const TAG = { lead: '<\\/?', name: '[A-Za-z][\\w:.-]*' };
const COLON_KEY = { lead: '^[ \\t]*(?:- )?', name: '[A-Za-z_][\\w.-]*(?=[ \\t]*:(?:[ \\t]|$))' };
const EQUALS_KEY = { lead: '^[ \\t]*', name: '[A-Za-z_][\\w.-]*(?=[ \\t]*=)' };
const JSX_TAG = { lead: '(?:^|[\\s(>{,=?:&|])<\\/?|<\\/', name: '[A-Za-z][\\w.]*' };
const CODE = { identifiers: true };

const SPEC_JS = makeSpec(SLASH_COMMENTS, `${QUOTED}|${TEMPLATE_STRING}`, JS_KEYWORDS, {
  ...CODE,
  named: JSX_TAG,
});
const SPEC_PYTHON = makeSpec(HASH_COMMENT, `${PY_TRIPLE_STRING}|${QUOTED}`, PYTHON_KEYWORDS, CODE);
const SPEC_JSON = makeSpec(NEVER, DQ_STRING, 'true false null');
const SPEC_HTML = makeSpec(String.raw`<!--[\s\S]*?-->`, QUOTED, '', { named: TAG });
const SPEC_CSS = makeSpec(BLOCK_COMMENT, QUOTED, '');
const SPEC_SCSS = makeSpec(SLASH_COMMENTS, QUOTED, '');
const SPEC_SHELL = makeSpec(HASH_COMMENT, String.raw`"(?:[^"\\]|\\.)*"|'[^']*'`, SHELL_KEYWORDS);
const SPEC_SQL = makeSpec(String.raw`--[^\n]*|${BLOCK_COMMENT}`, QUOTED, SQL_KEYWORDS, {
  caseInsensitiveKeywords: true,
});
const SPEC_JVM = makeSpec(SLASH_COMMENTS, QUOTED, JVM_KEYWORDS, CODE);
const SPEC_RUST = makeSpec(SLASH_COMMENTS, DQ_STRING, RUST_KEYWORDS, CODE);
const SPEC_GO = makeSpec(
  SLASH_COMMENTS,
  `${DQ_STRING}|${TEMPLATE_STRING}|${SQ_STRING}`,
  GO_KEYWORDS,
  CODE,
);
const SPEC_C = makeSpec(SLASH_COMMENTS, QUOTED, C_FAMILY_KEYWORDS, CODE);
const SPEC_CSHARP = makeSpec(SLASH_COMMENTS, QUOTED, CSHARP_KEYWORDS, CODE);
const SPEC_PHP = makeSpec(`${SLASH_COMMENTS}|${HASH_COMMENT}`, QUOTED, PHP_KEYWORDS, {
  ...CODE,
  caseInsensitiveKeywords: true,
});
const SPEC_RUBY = makeSpec(HASH_COMMENT, QUOTED, RUBY_KEYWORDS, CODE);
const SPEC_PERL = makeSpec(HASH_COMMENT, QUOTED, PERL_KEYWORDS, CODE);
const SPEC_R = makeSpec(HASH_COMMENT, QUOTED, R_KEYWORDS, CODE);
const SPEC_ELIXIR = makeSpec(HASH_COMMENT, QUOTED, ELIXIR_KEYWORDS, CODE);
const SPEC_LUA = makeSpec(String.raw`--\[\[[\s\S]*?\]\]|--[^\n]*`, QUOTED, LUA_KEYWORDS, CODE);
const SPEC_HASKELL = makeSpec(
  String.raw`\{-[\s\S]*?-\}|--[^\n]*`,
  DQ_STRING,
  HASKELL_KEYWORDS,
  CODE,
);
const SPEC_ZIG = makeSpec(SLASH_LINE_COMMENT, DQ_STRING, ZIG_KEYWORDS, CODE);
const SPEC_YAML = makeSpec(HASH_COMMENT, QUOTED, 'true false null', { named: COLON_KEY });
const SPEC_TOML = makeSpec(HASH_COMMENT, QUOTED, 'true false', { named: EQUALS_KEY });
const SPEC_INI = makeSpec('[;#][^\\n]*', DQ_STRING, 'true false', { named: EQUALS_KEY });
const SPEC_DOCKER = makeSpec(HASH_COMMENT, QUOTED, DOCKER_KEYWORDS);
const SPEC_MAKE = makeSpec(HASH_COMMENT, QUOTED, MAKE_KEYWORDS);
const SPEC_NGINX = makeSpec(HASH_COMMENT, QUOTED, NGINX_KEYWORDS);
const SPEC_TERRAFORM = makeSpec(`${SLASH_COMMENTS}|${HASH_COMMENT}`, DQ_STRING, TERRAFORM_KEYWORDS);
const SPEC_POWERSHELL = makeSpec(String.raw`<#[\s\S]*?#>|#[^\n]*`, QUOTED, POWERSHELL_KEYWORDS, {
  caseInsensitiveKeywords: true,
});
const SPEC_GRAPHQL = makeSpec(HASH_COMMENT, DQ_STRING, GRAPHQL_KEYWORDS, CODE);
const SPEC_PROTO = makeSpec(SLASH_COMMENTS, QUOTED, PROTO_KEYWORDS, CODE);
const SPEC_PRISMA = makeSpec(SLASH_LINE_COMMENT, DQ_STRING, PRISMA_KEYWORDS, CODE);
const SPEC_LATEX = makeSpec('%[^\\n]*', NEVER, '', {
  named: { lead: '', name: String.raw`\\[A-Za-z]+` },
});

const LANGUAGE_SPECS: Partial<Record<LanguageId, LanguageSpec>> = {
  javascript: SPEC_JS,
  jsx: SPEC_JS,
  typescript: SPEC_JS,
  tsx: SPEC_JS,
  python: SPEC_PYTHON,
  json: SPEC_JSON,
  html: SPEC_HTML,
  xml: SPEC_HTML,
  vue: SPEC_HTML,
  svelte: SPEC_HTML,
  css: SPEC_CSS,
  scss: SPEC_SCSS,
  less: SPEC_SCSS,
  bash: SPEC_SHELL,
  sql: SPEC_SQL,
  java: SPEC_JVM,
  kotlin: SPEC_JVM,
  scala: SPEC_JVM,
  swift: SPEC_JVM,
  rust: SPEC_RUST,
  go: SPEC_GO,
  c: SPEC_C,
  cpp: SPEC_C,
  'objective-c': SPEC_C,
  csharp: SPEC_CSHARP,
  php: SPEC_PHP,
  ruby: SPEC_RUBY,
  perl: SPEC_PERL,
  r: SPEC_R,
  elixir: SPEC_ELIXIR,
  lua: SPEC_LUA,
  haskell: SPEC_HASKELL,
  zig: SPEC_ZIG,
  yaml: SPEC_YAML,
  toml: SPEC_TOML,
  ini: SPEC_INI,
  docker: SPEC_DOCKER,
  makefile: SPEC_MAKE,
  nginx: SPEC_NGINX,
  terraform: SPEC_TERRAFORM,
  powershell: SPEC_POWERSHELL,
  graphql: SPEC_GRAPHQL,
  proto: SPEC_PROTO,
  prisma: SPEC_PRISMA,
  latex: SPEC_LATEX,
};

function specFor(language: string | undefined): LanguageSpec | undefined {
  const id = language ? resolveHighlightLanguage(language) : null;
  return id ? LANGUAGE_SPECS[id] : undefined;
}

const WORD_REGEX = /[A-Za-z_][A-Za-z0-9_]*/g;
const TYPE_NAME = /^[A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*$/;

function wordType(word: string, next: string | undefined, spec: LanguageSpec): SyntaxTokenType {
  if (spec.keywords.has(spec.caseInsensitiveKeywords ? word.toLowerCase() : word)) {
    return 'keyword';
  }
  if (!spec.identifiers) return 'plain';
  if (next === '(') return 'function';
  return TYPE_NAME.test(word) ? 'type' : 'plain';
}

function pushPlainWithKeywords(text: string, spec: LanguageSpec, tokens: SyntaxToken[]): void {
  if (spec.keywords.size === 0 && !spec.identifiers) {
    pushToken(tokens, text, 'plain');
    return;
  }
  let last = 0;
  let match: RegExpExecArray | null;
  WORD_REGEX.lastIndex = 0;
  while ((match = WORD_REGEX.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const type = wordType(match[0], text[end], spec);
    if (type === 'plain') continue;
    if (match.index > last) pushToken(tokens, text.slice(last, match.index), 'plain');
    pushToken(tokens, match[0], type);
    last = end;
  }
  if (last < text.length) pushToken(tokens, text.slice(last), 'plain');
}

function pushToken(tokens: SyntaxToken[], text: string, type: SyntaxTokenType): void {
  if (text.length === 0) return;
  const prev = tokens[tokens.length - 1];
  if (prev && prev.type === type) {
    prev.text += text;
    return;
  }
  tokens.push({ text, type });
}

function pushMatch(match: RegExpExecArray, tokens: SyntaxToken[]): void {
  if (match[1] !== undefined) return pushToken(tokens, match[0], 'comment');
  if (match[2] !== undefined) return pushToken(tokens, match[0], 'string');
  if (match[3] !== undefined) return pushToken(tokens, match[0], 'number');
  pushToken(tokens, match[4] ?? '', 'plain');
  pushToken(tokens, match[5] ?? '', 'keyword');
}

export function tokenizeCode(code: string, language: string | undefined): SyntaxToken[] {
  if (code.length === 0) return [];
  const spec = specFor(language);
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
    pushMatch(match, tokens);
    last = match.index + match[0].length;
    if (match[0].length === 0) spec.pattern.lastIndex++;
  }
  if (last < code.length) pushPlainWithKeywords(code.slice(last), spec, tokens);
  return tokens;
}

/** Web code blocks inherit tab-size: 4 from the Tailwind preflight. */
export const CODE_TAB_SIZE = 4;

function columnAfter(text: string, column: number): number {
  const lineStart = text.lastIndexOf('\n') + 1;
  return (lineStart === 0 ? column : 0) + Array.from(text.slice(lineStart)).length;
}

export function expandCodeTabs(
  tokens: readonly SyntaxToken[],
  tabSize: number = CODE_TAB_SIZE,
): SyntaxToken[] {
  let column = 0;
  return tokens.map((token) => {
    if (!token.text.includes('\t')) {
      column = columnAfter(token.text, column);
      return token;
    }
    let expanded = '';
    for (const char of token.text) {
      if (char === '\t') {
        const width = tabSize - (column % tabSize);
        expanded += ' '.repeat(width);
        column += width;
      } else {
        expanded += char;
        column = char === '\n' ? 0 : column + 1;
      }
    }
    return { ...token, text: expanded };
  });
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
    function: accessibleCodeColor(colors.agentActive, colors),
    type: accessibleCodeColor(colors.agentActive, colors),
    plain: accessibleCodeColor(colors.textPrimary, colors),
  };
  syntaxPaletteCache.set(colors, palette);
  return palette;
}

export function syntaxTokenColor(type: SyntaxTokenType, colors: ColorScheme): string {
  return syntaxPalette(colors)[type];
}
