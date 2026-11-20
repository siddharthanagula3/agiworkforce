/**
 * Workspace file semantics every surface has to agree on. The host supplies the
 * bytes and the directory entries; what counts as binary, what a glob means and
 * what a match looks like is decided once, here.
 */

/** Never walked: none of them hold source, and all of them are large. */
export const SKIPPED_WORKSPACE_DIRECTORIES: readonly string[] = [
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'target',
  '.turbo',
  '.cache',
  'coverage',
];

const SKIPPED = new Set(SKIPPED_WORKSPACE_DIRECTORIES);

export const MAX_WORKSPACE_WALK_DEPTH = 24;
export const BINARY_SNIFF_BYTES = 8192;
export const GREP_PREVIEW_LIMIT = 240;

export function isSkippedDirectory(name: string): boolean {
  return SKIPPED.has(name);
}

/** Workspace paths are POSIX-separated on every platform, so keys compare. */
export function toPosixPath(value: string): string {
  return value.split('\\').join('/');
}

export function joinWorkspacePath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/**
 * A file counts as binary when a NUL byte appears in its opening bytes, which
 * is how git decides the same question. Reading the whole file to be certain
 * would defeat the point of asking.
 */
export function looksBinary(sample: Uint8Array): boolean {
  const limit = Math.min(sample.length, BINARY_SNIFF_BYTES);
  for (let index = 0; index < limit; index += 1) {
    if (sample[index] === 0) return true;
  }
  return false;
}

export const MAX_GLOB_PATTERN_CHARS = 1_024;

export interface GlobOptions {
  ignoreCase?: boolean;
  extended?: boolean;
}

type CharTest = (char: string) => boolean;

interface GlobState {
  readonly test: CharTest | null;
  readonly next: number;
  readonly epsilons: number[];
}

function isLineTerminator(char: string): boolean {
  return char === '\n' || char === '\r' || char === ' ' || char === ' ';
}

function foldCase(char: string): string {
  const upper = char.toUpperCase();
  if (upper.length !== 1) return char;
  if (char.charCodeAt(0) >= 128 && upper.charCodeAt(0) < 128) return char;
  return upper;
}

const NOT_SEPARATOR: CharTest = (char) => char !== '/';
const IS_SEPARATOR: CharTest = (char) => char === '/';
const NOT_LINE_TERMINATOR: CharTest = (char) => !isLineTerminator(char);

function isAscii(char: string): boolean {
  return char.length === 1 && char.charCodeAt(0) < 128;
}

function codePointEscape(code: number): string {
  return `\\u{${code.toString(16)}}`;
}

// One code point or one class, with no quantifier, cannot backtrack. The `iu`
// flags are the only exposed source of Unicode simple case folding.
function caseFoldingTest(source: string): CharTest {
  let expression: RegExp | undefined;
  return (char) => {
    expression ??= new RegExp(`^${source}$`, 'iu');
    return expression.test(char);
  };
}

function literalTest(literal: string, ignoreCase: boolean): CharTest {
  if (!ignoreCase) return (char) => char === literal;
  const lower = isAscii(literal) ? literal.toLowerCase() : undefined;
  const folds = caseFoldingTest(codePointEscape(literal.codePointAt(0) as number));
  return (char) => {
    if (char === literal) return true;
    if (lower !== undefined && isAscii(char)) return char.toLowerCase() === lower;
    return folds(char);
  };
}

function classRanges(body: string): number[] {
  const members = Array.from(body, (char) => char.codePointAt(0) as number);
  const ranges: number[] = [];
  let index = 0;
  while (index < members.length) {
    const from = members[index] as number;
    if (members[index + 1] === 0x2d && index + 2 < members.length) {
      const to = members[index + 2] as number;
      if (to < from) throw new SyntaxError('A glob character class has a range out of order.');
      ranges.push(from, to);
      index += 3;
    } else {
      ranges.push(from, from);
      index += 1;
    }
  }
  return ranges;
}

const NEVER: CharTest = () => false;

function unreadableEmptyClass(): SyntaxError {
  return new SyntaxError(
    'A glob character class that opens with "]" must leave its alternative unable to match.',
  );
}

interface LegacyExpression {
  readonly source: string;
  readonly emptyClasses: ReadonlyArray<{ readonly open: number; readonly close: number }>;
}

const LEGACY_ESCAPED = '.+^$()|\\{}[]';

function legacyExpression(glob: string): LegacyExpression {
  let source = '^';
  const emptyClasses: Array<{ open: number; close: number }> = [];
  let groupDepth = 0;
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] as string;
    if (char === '*') {
      const double = glob[index + 1] === '*';
      const next = index + (double ? 2 : 1);
      const startsSegment = index === 0 || glob[index - 1] === '/';
      const endsSegment = next === glob.length || glob[next] === '/';
      if (double && startsSegment && endsSegment) {
        source += next === glob.length ? '.*' : '(?:[^/]*/)*';
        index = next === glob.length ? next - 1 : next;
        continue;
      }
      source += '[^/]*';
      index = next - 1;
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '{') {
      groupDepth += 1;
      source += '(?:';
    } else if (char === '}' && groupDepth > 0) {
      groupDepth -= 1;
      source += ')';
    } else if (char === ',' && groupDepth > 0) {
      source += '|';
    } else if (char === '[' && glob.indexOf(']', index + 2) !== -1) {
      const close = glob.indexOf(']', index + 2);
      const body = glob.slice(index + 1, close);
      const negated = body.startsWith('!') || body.startsWith('^');
      const members = (negated ? body.slice(1) : body).split('\\').join('\\\\');
      if (!negated && members.startsWith(']')) {
        const trailing = members.indexOf('[');
        emptyClasses.push({
          open: source.length,
          close: trailing === -1 ? -1 : source.length + 1 + trailing,
        });
      }
      source += `[${negated ? '^' : ''}${members}]`;
      index = close;
    } else {
      source += LEGACY_ESCAPED.includes(char) ? `\\${char}` : char;
    }
  }
  return { source: `${source}$`, emptyClasses };
}

interface ExpressionFacts {
  readonly never: boolean;
  readonly consumes: boolean;
  readonly emptyOnly: boolean;
  readonly alwaysEmpty: boolean;
  readonly atStart: boolean;
  readonly atEnd: boolean;
  readonly notAtStart: boolean;
  readonly notAtEnd: boolean;
}

const UNMATCHABLE: ExpressionFacts = {
  never: true,
  consumes: true,
  emptyOnly: true,
  alwaysEmpty: false,
  atStart: true,
  atEnd: true,
  notAtStart: true,
  notAtEnd: true,
};
const ONE_CHARACTER: ExpressionFacts = {
  never: false,
  consumes: true,
  emptyOnly: false,
  alwaysEmpty: false,
  atStart: false,
  atEnd: false,
  notAtStart: false,
  notAtEnd: false,
};
const ZERO_WIDTH: ExpressionFacts = { ...ONE_CHARACTER, consumes: false, emptyOnly: true };
const EMPTY_ANYWHERE: ExpressionFacts = { ...ZERO_WIDTH, alwaysEmpty: true };

function sequenceFacts(items: readonly ExpressionFacts[]): ExpressionFacts {
  let consumed = false;
  let ended = false;
  let atZero = false;
  for (const item of items) {
    if (item.never || (item.atStart && consumed) || (item.consumes && ended)) return UNMATCHABLE;
    if (item.notAtStart && (atZero || item.atStart)) return UNMATCHABLE;
    consumed ||= item.consumes;
    ended ||= item.atEnd;
    atZero = (atZero || item.atStart) && item.emptyOnly;
  }
  let atLength = false;
  let trailing = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as ExpressionFacts;
    if (item.notAtEnd && (atLength || item.atEnd)) return UNMATCHABLE;
    atLength = (atLength || item.atEnd) && item.emptyOnly;
    if (trailing === -1 && !item.emptyOnly) trailing = index;
  }
  const leading = items.findIndex((item) => !item.emptyOnly);
  return {
    never: false,
    consumes: consumed,
    emptyOnly: leading === -1,
    alwaysEmpty: items.every((item) => item.alwaysEmpty),
    atStart: items.some((item) => item.atStart),
    atEnd: ended,
    notAtStart: items.some(
      (item, index) => item.notAtStart && (leading === -1 || index <= leading),
    ),
    notAtEnd: items.some((item, index) => item.notAtEnd && index >= trailing),
  };
}

function choiceFacts(options: readonly ExpressionFacts[]): ExpressionFacts {
  const live = options.filter((option) => !option.never);
  if (live.length === 0) return UNMATCHABLE;
  return {
    never: false,
    consumes: live.every((option) => option.consumes),
    emptyOnly: live.every((option) => option.emptyOnly),
    alwaysEmpty: live.some((option) => option.alwaysEmpty),
    atStart: live.every((option) => option.atStart),
    atEnd: live.every((option) => option.atEnd),
    notAtStart: live.every((option) => option.notAtStart),
    notAtEnd: live.every((option) => option.notAtEnd),
  };
}

function repeatedFacts(item: ExpressionFacts, minimum: number, maximum: number): ExpressionFacts {
  if (maximum === 0) return EMPTY_ANYWHERE;
  if (minimum === 0) return { ...EMPTY_ANYWHERE, emptyOnly: item.emptyOnly };
  if (minimum > 1 && item.consumes && (item.atStart || item.atEnd)) return UNMATCHABLE;
  return item;
}

function lookaroundFacts(opener: string, inner: ExpressionFacts): ExpressionFacts {
  if (opener.endsWith('!')) {
    return inner.alwaysEmpty ? UNMATCHABLE : { ...ZERO_WIDTH, alwaysEmpty: inner.never };
  }
  if (inner.never) return UNMATCHABLE;
  const ahead = opener === '(?=';
  return {
    ...ZERO_WIDTH,
    alwaysEmpty: inner.alwaysEmpty,
    atStart: inner.atStart && (ahead || inner.emptyOnly),
    atEnd: inner.atEnd && (!ahead || inner.emptyOnly),
    notAtStart: ahead ? inner.notAtStart : inner.consumes || (inner.notAtStart && inner.emptyOnly),
    notAtEnd: ahead ? inner.consumes || (inner.notAtEnd && inner.emptyOnly) : inner.notAtEnd,
  };
}

const LOOKAROUND_OPENERS = ['(?<=', '(?<!', '(?=', '(?!'];

interface LegacyReading {
  readonly facts: ExpressionFacts;
  readonly classPlaces: ReadonlyMap<number, { readonly choice: number; readonly option: number }>;
  readonly unmatchableOptions: ReadonlyArray<readonly boolean[]>;
}

function readLegacyExpression(source: string): LegacyReading {
  const classPlaces = new Map<number, { choice: number; option: number }>();
  const unmatchableOptions: boolean[][] = [];
  let index = 0;

  function closeGroup(): void {
    if (source[index] !== ')') throw unreadableEmptyClass();
    index += 1;
  }

  function characterClass(): ExpressionFacts {
    index += 1;
    const negated = source[index] === '^';
    if (negated) index += 1;
    if (source[index] === ']') {
      index += 1;
      return negated ? ONE_CHARACTER : UNMATCHABLE;
    }
    while (index < source.length && source[index] !== ']') index += source[index] === '\\' ? 2 : 1;
    if (index >= source.length) throw unreadableEmptyClass();
    index += 1;
    return ONE_CHARACTER;
  }

  function group(multiline: boolean): ExpressionFacts {
    const lookaround = LOOKAROUND_OPENERS.find((opener) => source.startsWith(opener, index));
    if (lookaround !== undefined) {
      index += lookaround.length;
      const inner = choice(multiline);
      closeGroup();
      return lookaroundFacts(lookaround, inner);
    }
    let innerMultiline = multiline;
    if (source.startsWith('(?:', index)) {
      index += 3;
    } else if (source.startsWith('(?<', index)) {
      const close = source.indexOf('>', index);
      if (close === -1) throw unreadableEmptyClass();
      index = close + 1;
    } else if (source.startsWith('(?', index)) {
      const colon = source.indexOf(':', index);
      if (colon === -1) throw unreadableEmptyClass();
      const [added = '', removed = ''] = source.slice(index + 2, colon).split('-');
      if (removed.includes('m')) innerMultiline = false;
      else if (added.includes('m')) innerMultiline = true;
      index = colon + 1;
    } else {
      index += 1;
    }
    const inner = choice(innerMultiline);
    closeGroup();
    return inner;
  }

  function atom(multiline: boolean, place: { choice: number; option: number }): ExpressionFacts {
    const char = source[index] as string;
    if (char === '^' || char === '$') {
      index += 1;
      if (multiline) return ZERO_WIDTH;
      return char === '^' ? { ...ZERO_WIDTH, atStart: true } : { ...ZERO_WIDTH, atEnd: true };
    }
    if (char === '(') return group(multiline);
    if (char === '[') {
      classPlaces.set(index, place);
      return characterClass();
    }
    index += char === '\\' ? 2 : String.fromCodePoint(source.codePointAt(index) as number).length;
    return ONE_CHARACTER;
  }

  function quantified(item: ExpressionFacts): ExpressionFacts {
    const char = source[index];
    let minimum: number;
    let maximum: number;
    if (char === '*' || char === '+' || char === '?') {
      minimum = char === '+' ? 1 : 0;
      maximum = char === '?' ? 1 : Number.POSITIVE_INFINITY;
      index += 1;
    } else if (char === '{') {
      const close = source.indexOf('}', index);
      if (close === -1) throw unreadableEmptyClass();
      const [low = '', high] = source.slice(index + 1, close).split(',');
      minimum = Number(low);
      maximum =
        high === undefined ? minimum : high === '' ? Number.POSITIVE_INFINITY : Number(high);
      index = close + 1;
    } else {
      return item;
    }
    if (source[index] === '?') index += 1;
    return repeatedFacts(item, minimum, maximum);
  }

  function choice(multiline: boolean): ExpressionFacts {
    const id = unmatchableOptions.length;
    const verdicts: boolean[] = [];
    unmatchableOptions.push(verdicts);
    const options: ExpressionFacts[] = [];
    for (;;) {
      const place = { choice: id, option: options.length };
      const items: ExpressionFacts[] = [];
      while (index < source.length && source[index] !== '|' && source[index] !== ')') {
        items.push(quantified(atom(multiline, place)));
      }
      const option = sequenceFacts(items);
      options.push(option);
      verdicts.push(option.never);
      if (source[index] !== '|') return choiceFacts(options);
      index += 1;
    }
  }

  const facts = choice(false);
  if (index !== source.length) throw unreadableEmptyClass();
  return { facts, classPlaces, unmatchableOptions };
}

// Only constructed, to learn whether the old expression compiled: it never runs
// against a path, so its backtracking cannot be reached.
function compilesAsUnicodeExpression(source: string): boolean {
  try {
    return new RegExp(source, 'u') instanceof RegExp;
  } catch {
    return false;
  }
}

function matchesNothingThroughEmptyClasses(glob: string): boolean {
  const legacy = legacyExpression(glob);
  if (legacy.emptyClasses.length === 0) return false;
  if (!compilesAsUnicodeExpression(legacy.source)) throw unreadableEmptyClass();
  const reading = readLegacyExpression(legacy.source);
  if (reading.facts.never) return true;
  for (const { open, close } of legacy.emptyClasses) {
    const first = reading.classPlaces.get(open);
    const last = reading.classPlaces.get(close);
    if (first === undefined || last === undefined || first.choice !== last.choice) {
      throw unreadableEmptyClass();
    }
    const verdicts = reading.unmatchableOptions[first.choice] ?? [];
    for (let option = first.option; option <= last.option; option += 1) {
      if (verdicts[option] !== true) throw unreadableEmptyClass();
    }
  }
  return false;
}

function classTest(ranges: readonly number[], negated: boolean, ignoreCase: boolean): CharTest {
  const contains = (code: number): boolean => {
    for (let index = 0; index < ranges.length; index += 2) {
      if (code >= (ranges[index] as number) && code <= (ranges[index + 1] as number)) return true;
    }
    return false;
  };
  if (!ignoreCase) return (char) => contains(char.codePointAt(0) as number) !== negated;
  let members = '';
  for (let index = 0; index < ranges.length; index += 2) {
    members += `${codePointEscape(ranges[index] as number)}-${codePointEscape(ranges[index + 1] as number)}`;
  }
  const folds = caseFoldingTest(`[${members}]`);
  return (char) => (contains(char.codePointAt(0) as number) || folds(char)) !== negated;
}

function step(states: GlobState[], test: CharTest): void {
  states.push({ test, next: states.length + 1, epsilons: [] });
}

function repeat(states: GlobState[], test: CharTest): void {
  const at = states.length;
  states.push({ test, next: at, epsilons: [at + 1] });
}

function junction(states: GlobState[], epsilons: number[] = []): GlobState {
  const state: GlobState = { test: null, next: -1, epsilons };
  states.push(state);
  return state;
}

function basicStates(pattern: string, ignoreCase: boolean): GlobState[] {
  const fold = ignoreCase ? foldCase : (char: string): string => char;
  const states: GlobState[] = [];
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index] as string;
    if (char === '*') {
      const double = pattern[index + 1] === '*';
      repeat(states, double ? NOT_LINE_TERMINATOR : NOT_SEPARATOR);
      index += double ? 2 : 1;
    } else if (char === '?') {
      step(states, NOT_SEPARATOR);
      index += 1;
    } else {
      const literal = fold(char);
      step(states, (candidate) => fold(candidate) === literal);
      index += 1;
    }
  }
  return states;
}

function extendedStates(glob: string, ignoreCase: boolean): GlobState[] {
  const states: GlobState[] = [];
  let index = 0;

  function star(): void {
    const double = glob[index + 1] === '*';
    const next = index + (double ? 2 : 1);
    const startsSegment = index === 0 || glob[index - 1] === '/';
    const endsSegment = next === glob.length || glob[next] === '/';
    if (!double || !startsSegment || !endsSegment) {
      repeat(states, NOT_SEPARATOR);
      index = next;
    } else if (next === glob.length) {
      repeat(states, NOT_LINE_TERMINATOR);
      index = next;
    } else {
      const at = states.length;
      junction(states, [at + 1, at + 3]);
      states.push({ test: NOT_SEPARATOR, next: at + 1, epsilons: [at + 2] });
      states.push({ test: IS_SEPARATOR, next: at, epsilons: [] });
      index = next + 1;
    }
  }

  function sequence(inGroup: boolean): void {
    while (index < glob.length) {
      const char = glob[index] as string;
      if (inGroup && (char === ',' || char === '}')) return;
      if (char === '*') {
        star();
      } else if (char === '?') {
        step(states, NOT_SEPARATOR);
        index += 1;
      } else if (char === '{') {
        index += 1;
        const split = junction(states);
        const exits: GlobState[] = [];
        let closed = false;
        while (!closed) {
          split.epsilons.push(states.length);
          sequence(true);
          if (index >= glob.length) throw new SyntaxError('A glob group is missing its "}".');
          exits.push(junction(states));
          closed = glob[index] === '}';
          index += 1;
        }
        for (const exit of exits) exit.epsilons.push(states.length);
      } else if (char === '[' && glob.indexOf(']', index + 2) !== -1) {
        const close = glob.indexOf(']', index + 2);
        const body = glob.slice(index + 1, close);
        const negated = body.startsWith('!') || body.startsWith('^');
        if (body.startsWith(']')) {
          step(states, NEVER);
        } else {
          step(states, classTest(classRanges(negated ? body.slice(1) : body), negated, ignoreCase));
        }
        index = close + 1;
      } else {
        const literal = String.fromCodePoint(glob.codePointAt(index) as number);
        step(states, literalTest(literal, ignoreCase));
        index += literal.length;
      }
    }
  }

  sequence(false);
  return states;
}

/**
 * Compiles a glob into a matcher that runs in time proportional to the path
 * length times the pattern length, whatever the pattern says. A regular
 * expression built from the same glob backtracks, so a pattern chosen by a
 * model must never run in one.
 *
 * By default `*` stays inside one path segment, `**` crosses separators but not
 * line terminators, `?` is one UTF-16 unit that is not a separator, and
 * everything else is literal.
 *
 * `extended` reads the `files.exclude` dialect: `{a,b}` groups, `[...]`
 * classes that a leading `!` or `^` negates, a `**` that fills a whole segment
 * and matches any run of segments, `?` as one code point, and Unicode case
 * folding. A class body that opens with `]` is the empty class the old
 * expression read: the glob matches nothing when the old expression matched
 * nothing, and otherwise the alternative holding the class never matches, as
 * long as the old expression could not match there either. It throws a
 * SyntaxError for a glob it cannot parse and for one whose old expression
 * depended on the regular-expression syntax inside such a class.
 *
 * The matcher tracks every state the pattern could have reached instead of
 * committing to one, so no construct needs a backtrack point of its own.
 */
export function compileGlob(pattern: string, options: GlobOptions = {}): (path: string) => boolean {
  if (pattern.length > MAX_GLOB_PATTERN_CHARS) {
    throw new RangeError(`A glob pattern may be at most ${MAX_GLOB_PATTERN_CHARS} characters.`);
  }
  const ignoreCase = options.ignoreCase === true;
  const extended = options.extended === true;
  const states = extended ? extendedStates(pattern, ignoreCase) : basicStates(pattern, ignoreCase);
  if (extended && matchesNothingThroughEmptyClasses(pattern)) return () => false;
  const accept = states.length;
  const stamps = new Float64Array(accept + 1);
  let generation = 0;

  const enter = (start: number, into: number[]): void => {
    const pending = [start];
    while (pending.length > 0) {
      const state = pending.pop() as number;
      if (stamps[state] === generation) continue;
      stamps[state] = generation;
      into.push(state);
      if (state < accept) pending.push(...(states[state] as GlobState).epsilons);
    }
  };

  const advance = (reached: readonly number[], char: string): number[] => {
    generation += 1;
    const following: number[] = [];
    for (const state of reached) {
      if (state === accept) continue;
      const { test, next } = states[state] as GlobState;
      if (test !== null && test(char)) enter(next, following);
    }
    return following;
  };

  return (path: string): boolean => {
    generation += 1;
    let reached: number[] = [];
    enter(0, reached);
    if (extended) {
      for (const char of path) {
        if (reached.length === 0) break;
        reached = advance(reached, char);
      }
    } else {
      for (let position = 0; position < path.length && reached.length > 0; position += 1) {
        reached = advance(reached, path[position] as string);
      }
    }
    return reached.includes(accept);
  };
}

export function matchesGlob(pattern: string, path: string): boolean {
  return compileGlob(pattern)(toPosixPath(path));
}

export interface WorkspaceGrepMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface GrepOptions {
  limit?: number;
  previewLimit?: number;
}

/** Literal substring search over one file's text, with 1-based coordinates. */
export function grepLines(
  path: string,
  text: string,
  query: string,
  options: GrepOptions = {},
): WorkspaceGrepMatch[] {
  if (query.length === 0) return [];
  const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
  const previewLimit = options.previewLimit ?? GREP_PREVIEW_LIMIT;
  const matches: WorkspaceGrepMatch[] = [];
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    if (matches.length >= limit) break;
    const line = lines[index] ?? '';
    const column = line.indexOf(query);
    if (column === -1) continue;
    matches.push({
      path: toPosixPath(path),
      line: index + 1,
      column: column + 1,
      preview: line.length > previewLimit ? line.slice(0, previewLimit) : line,
    });
  }
  return matches;
}
