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

/** Beyond ~50KB, tokenizing (and rendering thousands of spans) is not worth it. */
export const MAX_HIGHLIGHT_LENGTH = 50_000;

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

/** Maps a token type to a theme color that reads in both light and dark mode. */
export function syntaxTokenColor(type: SyntaxTokenType, colors: ColorScheme): string {
  switch (type) {
    case 'comment':
      return colors.textMuted;
    case 'string':
      return colors.agentSuccess;
    case 'number':
      return colors.agentWarning;
    case 'keyword':
      return colors.purple;
    default:
      return colors.textPrimary;
  }
}
