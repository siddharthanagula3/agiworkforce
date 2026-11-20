import 'server-only';

import { RE2JS, RE2JSSyntaxException } from 're2js';
import { z } from 'zod';
import type { ChatResponseFormat } from '@agiworkforce/types';
import { extractJsonObject, wantsJsonObject } from './json-object-mode';
import { isBlockedFinishReason, isMaxOutputFinishReason } from './turn-completeness';

const MAX_SCHEMA_CHARS = 32_000;
const MAX_SCHEMA_DEPTH = 10;
const MAX_SCHEMA_NODES = 5_000;
const MAX_ANY_OF_OPTIONS = 100;
const MAX_PATTERN_CHARS = 1_024;
const MAX_PATTERN_INPUT_CHARS = 100_000;
const MAX_EVALUATION_UNITS = 1_000_000;
const MAX_PATTERN_WORK = 1_500_000;
const DFA_BYTES_PER_WORK_UNIT = 4;
const MAX_SCHEMA_PATTERN_INSTRUCTIONS = 50_000;
const MAX_SCHEMA_PATTERN_RUNES = 1_000_000;
const MAX_REPLY_DEPTH = MAX_SCHEMA_DEPTH * 6;
const MAX_REPORTED_FRAGMENT_CHARS = 64;
const EVERY_CODE_POINT = '\\x{0}-\\x{10ffff}';

const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'anyOf',
  'description',
  'title',
  '$defs',
  '$ref',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'format',
  'default',
]);

type Schema = Record<string, unknown>;

interface LazyDfaState {
  readonly nfaStates: ArrayLike<number>;
}

interface LazyDfa {
  memBudget: number;
  stateBudget: number;
  readonly failed: boolean;
  step(state: LazyDfaState, ...rest: unknown[]): LazyDfaState | null;
  closure(pcs: ArrayLike<number>, flag: number): { pcs: ArrayLike<number> };
  match(...args: unknown[]): unknown;
}

interface LazyDfaMeter {
  steps: number;
  fellBack: boolean;
}

type PatternAutomaton =
  | { readonly kind: 'one-pass'; readonly stepsPerCharacter: number }
  | { readonly kind: 'lazy-dfa'; readonly dfa: LazyDfa; readonly meter: LazyDfaMeter };

interface CompiledPattern {
  readonly kind: 'compiled';
  readonly matcher: RE2JS;
  readonly instructions: number;
  readonly runes: number;
  readonly scans: number;
  readonly automaton: PatternAutomaton | null;
}

type PatternCompilation =
  | CompiledPattern
  | { readonly kind: 'unsupported'; readonly construct: string }
  | { readonly kind: 'too-large' };

type PatternScope = Map<string, PatternCompilation>;

const RE2JS_BRANCH_OPCODES: ReadonlySet<unknown> = new Set([1, 2]);
const RE2JS_PASS_THROUGH_OPCODES: ReadonlySet<unknown> = new Set([3, 4, 7]);
const RE2JS_STEP_END_OPCODES: ReadonlySet<unknown> = new Set([5, 6, 8, 9, 10, 11]);

const HEX_DIGITS = /^[0-9a-fA-F]+$/;
const BACK_REFERENCE = /\\(?:[1-9][0-9]*|k<[^>]*>?)/y;
const MODIFIER_GROUP = /\(\?[A-Za-z]*(?:-[A-Za-z]*)?:/y;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function readUnicodeEscape(pattern: string, at: number): { code: number; end: number } | null {
  if (pattern[at] !== 'u') return null;
  if (pattern[at + 1] === '{') {
    const close = pattern.indexOf('}', at + 2);
    const digits = close === -1 ? '' : pattern.slice(at + 2, close);
    if (!HEX_DIGITS.test(digits)) return null;
    const code = Number.parseInt(digits, 16);
    return code <= 0x10ffff ? { code, end: close + 1 } : null;
  }
  const digits = pattern.slice(at + 1, at + 5);
  return digits.length === 4 && HEX_DIGITS.test(digits)
    ? { code: Number.parseInt(digits, 16), end: at + 5 }
    : null;
}

function reportedFragment(fragment: string): string {
  return fragment.length > MAX_REPORTED_FRAGMENT_CHARS
    ? `${fragment.slice(0, MAX_REPORTED_FRAGMENT_CHARS)}...`
    : fragment;
}

type Re2Translation = { ok: true; source: string } | { ok: false; construct: string };

function unsupportedConstruct(name: string, fragment: string): Re2Translation {
  return { ok: false, construct: `${name} \`${reportedFragment(fragment)}\`` };
}

function toRe2Syntax(pattern: string): Re2Translation {
  let out = '';
  let index = 0;
  let inClass = false;
  while (index < pattern.length) {
    const char = pattern[index] as string;
    if (char === '\\' && index + 1 < pattern.length) {
      const escape = readUnicodeEscape(pattern, index + 1);
      if (escape) {
        let { code, end } = escape;
        if (isHighSurrogate(code) && pattern[end] === '\\') {
          const next = readUnicodeEscape(pattern, end + 1);
          if (next && isLowSurrogate(next.code)) {
            code = (code - 0xd800) * 0x400 + (next.code - 0xdc00) + 0x10000;
            end = next.end;
          }
        }
        out += `\\x{${code.toString(16)}}`;
        index = end;
        continue;
      }
      if (!inClass) {
        BACK_REFERENCE.lastIndex = index;
        const reference = BACK_REFERENCE.exec(pattern);
        if (reference) return unsupportedConstruct('back-reference', reference[0]);
      }
      out += char + pattern[index + 1];
      index += 2;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      out += char === '[' ? '\\[' : char;
      index += 1;
      continue;
    }
    if (char === '[') {
      const negated = pattern[index + 1] === '^';
      const bodyStart = index + (negated ? 2 : 1);
      if (pattern[bodyStart] === ']') {
        out += negated ? `[${EVERY_CODE_POINT}]` : `[^${EVERY_CODE_POINT}]`;
        index = bodyStart + 1;
        continue;
      }
      inClass = true;
      out += pattern.slice(index, bodyStart);
      index = bodyStart;
      continue;
    }
    if (char === '(' && pattern[index + 1] === '?') {
      const marker = pattern[index + 2];
      if (marker === '=' || marker === '!') {
        return unsupportedConstruct('lookahead', pattern.slice(index, index + 3));
      }
      const behind = pattern[index + 3];
      if (marker === '<' && (behind === '=' || behind === '!')) {
        return unsupportedConstruct('lookbehind', pattern.slice(index, index + 4));
      }
    }
    out += char;
    index += 1;
  }
  return { ok: true, source: out };
}

function modifierGroupProblem(pattern: string): string | null {
  let inClass = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '\\') {
      index += 1;
    } else if (inClass) {
      if (char === ']') inClass = false;
    } else if (char === '[') {
      inClass = true;
    } else if (char === '(' && pattern[index + 1] === '?') {
      MODIFIER_GROUP.lastIndex = index;
      const group = MODIFIER_GROUP.exec(pattern)?.[0];
      if (group !== undefined && group !== '(?:') {
        return `modifier group \`${reportedFragment(group)}\``;
      }
    }
  }
  return null;
}

function syntaxProblem(error: unknown): string {
  if (!(error instanceof RE2JSSyntaxException)) return 'RE2 cannot compile it';
  return error.input ? `${error.error} \`${reportedFragment(error.input)}\`` : error.error;
}

function ecmaSyntaxProblem(pattern: string): string | null {
  try {
    new RegExp(pattern, 'u');
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const marker = message.lastIndexOf('/u: ');
    const reason = marker === -1 ? message : message.slice(marker + 4);
    return `not an ECMA-262 regular expression (${reportedFragment(reason)})`;
  }
}

function translatePattern(pattern: string): PatternCompilation {
  if (pattern.length > MAX_PATTERN_CHARS) {
    return { kind: 'unsupported', construct: `longer than ${MAX_PATTERN_CHARS} characters` };
  }
  const modifierProblem = modifierGroupProblem(pattern);
  if (modifierProblem) return { kind: 'unsupported', construct: modifierProblem };
  const ecmaProblem = ecmaSyntaxProblem(pattern);
  if (ecmaProblem) return { kind: 'unsupported', construct: ecmaProblem };
  const translation = toRe2Syntax(pattern);
  if (!translation.ok) return { kind: 'unsupported', construct: translation.construct };
  let matcher: RE2JS;
  try {
    matcher = RE2JS.compile(translation.source);
  } catch (error) {
    return { kind: 'unsupported', construct: syntaxProblem(error) };
  }
  const instructions = Number(matcher.re2Input.numberOfInstructions());
  if (instructions > MAX_SCHEMA_PATTERN_INSTRUCTIONS) return { kind: 'too-large' };
  const runes = runeEntries(matcher);
  if (runes > MAX_SCHEMA_PATTERN_RUNES) return { kind: 'too-large' };
  const engine = matcher.re2Input;
  return {
    kind: 'compiled',
    matcher,
    instructions,
    runes,
    scans: engine.prefixComplete ? 0 : prefilterScans(engine.prefilter, instructions),
    automaton: patternAutomaton(engine),
  };
}

function prefilterScans(prefilter: unknown, instructions: number): number {
  if (prefilter === null || prefilter === undefined) return 0;
  const scans = isRecord(prefilter) ? prefilter['cost'] : undefined;
  return typeof scans === 'number' && Number.isFinite(scans) && scans >= 0 ? scans : instructions;
}

function patternAutomaton(engine: RE2JS['re2Input']): PatternAutomaton | null {
  if (engine.prefixComplete) return null;
  if (engine.onepass !== null) {
    const stepsPerCharacter = onePassStepsPerCharacter(engine.onepass);
    return stepsPerCharacter === null ? null : { kind: 'one-pass', stepsPerCharacter };
  }
  return meteredDfa(engine.dfa);
}

function onePassStepsPerCharacter(program: unknown): number | null {
  const instructions = isRecord(program) ? program['inst'] : undefined;
  if (!Array.isArray(instructions)) return null;
  const longest = new Map<number, number>();
  const active = new Set<number>();
  const stepsFrom = (pc: unknown): number => {
    if (typeof pc !== 'number') return Number.POSITIVE_INFINITY;
    const known = longest.get(pc);
    if (known !== undefined) return known;
    const instruction: unknown = instructions[pc];
    if (!isRecord(instruction) || active.has(pc)) return Number.POSITIVE_INFINITY;
    const { op, out, arg, next } = instruction;
    let successors: unknown[];
    if (RE2JS_STEP_END_OPCODES.has(op)) successors = [];
    else if (RE2JS_PASS_THROUGH_OPCODES.has(op)) successors = [out];
    else if (RE2JS_BRANCH_OPCODES.has(op)) {
      successors = [out, arg, ...(ArrayBuffer.isView(next) ? Array.from(next as Uint32Array) : [])];
    } else return Number.POSITIVE_INFINITY;
    active.add(pc);
    let steps = 1;
    for (const successor of successors) steps = Math.max(steps, stepsFrom(successor) + 1);
    active.delete(pc);
    longest.set(pc, steps);
    return steps;
  };
  let steps = 1;
  for (let pc = 0; pc < instructions.length; pc += 1) steps = Math.max(steps, stepsFrom(pc));
  return Number.isFinite(steps) ? steps : null;
}

function meteredDfa(dfa: LazyDfa): PatternAutomaton {
  const meter: LazyDfaMeter = { steps: 0, fellBack: false };
  const step = dfa.step.bind(dfa);
  const closure = dfa.closure.bind(dfa);
  const match = dfa.match.bind(dfa);
  dfa.stateBudget = 0;
  dfa.match = (...args) => {
    const result = match(...args);
    if (result === null) meter.fellBack = true;
    return result;
  };
  dfa.step = (state, ...rest) => {
    meter.steps += state.nfaStates.length;
    return step(state, ...rest);
  };
  dfa.closure = (pcs, flag) => {
    const result = closure(pcs, flag);
    meter.steps += pcs.length + result.pcs.length;
    return result;
  };
  return { kind: 'lazy-dfa', dfa, meter };
}

function runeEntries(matcher: RE2JS): number {
  const program: unknown = matcher.re2Input.prog;
  const instructions = isRecord(program) ? program['inst'] : undefined;
  if (!Array.isArray(instructions)) return Number.POSITIVE_INFINITY;
  let entries = 0;
  for (const instruction of instructions) {
    const runes = isRecord(instruction) ? instruction['runes'] : undefined;
    if (ArrayBuffer.isView(runes) || Array.isArray(runes)) {
      entries += (runes as ArrayLike<number>).length;
    }
  }
  return entries;
}

// Caller patterns are only parsed by V8's backtracking RegExp, never executed: RE2 matches.
// A lazy DFA may only allocate states and tables from the reply's remaining pattern budget,
// and a zero refill budget keeps a cache reset from allocating them again (re2js DFA).
// Automaton tests are charged by the steps they take, which the opcode sets and the DFA
// step and closure meters read from re2js internals pinned at an exact version; a DFA match
// that returns null hands the test to the slower matcher and is charged its worst case.
function compilePattern(pattern: string, scope: PatternScope): PatternCompilation {
  const known = scope.get(pattern);
  if (known !== undefined) return known;
  const compiled = translatePattern(pattern);
  scope.set(pattern, compiled);
  return compiled;
}

function isRecord(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonValuesEqual(left: unknown, right: unknown, run: Evaluation): boolean {
  const pending: Array<[unknown, unknown]> = [[left, right]];
  while (pending.length > 0) {
    spend(run, 1);
    const [a, b] = pending.pop()!;
    if (a === b) continue;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let index = 0; index < a.length; index += 1) pending.push([a[index], b[index]]);
    } else if (isRecord(a) && isRecord(b)) {
      const keys = Object.keys(a);
      if (keys.length !== Object.keys(b).length) return false;
      for (const key of keys) {
        if (!Object.hasOwn(b, key)) return false;
        pending.push([a[key], b[key]]);
      }
    } else {
      return false;
    }
  }
  return true;
}

export const JsonSchemaResponseFormatSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().max(1_000).optional(),
  schema: z.record(z.string(), z.unknown()),
  strict: z.boolean().optional(),
});

export type JsonSchemaResponseFormat = z.infer<typeof JsonSchemaResponseFormatSchema>;

export function wantsJsonSchema(responseFormat: { type?: string } | undefined): boolean {
  return responseFormat?.type === 'json_schema';
}

export function requestedResponseFormat(
  responseFormat: { type?: string; json_schema?: JsonSchemaResponseFormat } | undefined,
): ChatResponseFormat | undefined {
  if (wantsJsonObject(responseFormat)) return { type: 'json_object' };
  const format = responseFormat?.json_schema;
  if (!wantsJsonSchema(responseFormat) || !format) return undefined;
  return {
    type: 'json_schema',
    name: format.name,
    schema: format.schema,
    strict: format.strict === true,
  };
}

function schemaProblemAt(
  schema: unknown,
  path: string,
  depth: number,
  nodes: Map<Schema, string>,
  patterns: { instructions: number; runes: number; readonly scope: PatternScope },
): string | null {
  if (depth > MAX_SCHEMA_DEPTH) return `${path} nests deeper than ${MAX_SCHEMA_DEPTH} levels`;
  if (!isRecord(schema)) return `${path} is not a schema object`;
  nodes.set(schema, path);
  if (nodes.size > MAX_SCHEMA_NODES) {
    return `the schema has more than ${MAX_SCHEMA_NODES} schema objects`;
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) return `${path} uses unsupported keyword "${key}"`;
  }
  const pattern = schema['pattern'];
  if (typeof pattern === 'string') {
    const compiled = compilePattern(pattern, patterns.scope);
    if (compiled.kind === 'unsupported') {
      return `${path} uses an unsupported pattern: ${compiled.construct}`;
    }
    if (compiled.kind === 'too-large')
      return 'the schema patterns are too large to enforce together';
    patterns.instructions += compiled.instructions;
    patterns.runes += compiled.runes;
    if (
      patterns.instructions > MAX_SCHEMA_PATTERN_INSTRUCTIONS ||
      patterns.runes > MAX_SCHEMA_PATTERN_RUNES
    ) {
      return 'the schema patterns are too large to enforce together';
    }
  }
  const ref = schema['$ref'];
  if (ref !== undefined && (typeof ref !== 'string' || !ref.startsWith('#/$defs/'))) {
    return `${path}.$ref must point into #/$defs`;
  }
  const children: Array<[string, unknown]> = [];
  if (isRecord(schema['properties'])) {
    for (const [name, child] of Object.entries(schema['properties'])) {
      children.push([`${path}.properties.${name}`, child]);
    }
  }
  if (isRecord(schema['$defs'])) {
    for (const [name, child] of Object.entries(schema['$defs'])) {
      children.push([`${path}.$defs.${name}`, child]);
    }
  }
  if (schema['items'] !== undefined) children.push([`${path}.items`, schema['items']]);
  if (Array.isArray(schema['anyOf'])) {
    if (schema['anyOf'].length > MAX_ANY_OF_OPTIONS) {
      return `${path}.anyOf has more than ${MAX_ANY_OF_OPTIONS} options`;
    }
    schema['anyOf'].forEach((child, index) => children.push([`${path}.anyOf[${index}]`, child]));
  }
  if (isRecord(schema['additionalProperties'])) {
    children.push([`${path}.additionalProperties`, schema['additionalProperties']]);
  }
  for (const [childPath, child] of children) {
    const problem = schemaProblemAt(child, childPath, depth + 1, nodes, patterns);
    if (problem) return problem;
  }
  return null;
}

function schemaAdmission(
  format: JsonSchemaResponseFormat,
): { problem: string } | { problem: null; patterns: PatternScope } {
  if (JSON.stringify(format.schema).length > MAX_SCHEMA_CHARS) {
    return { problem: `the schema is larger than ${MAX_SCHEMA_CHARS} characters` };
  }
  if (format.schema['type'] !== 'object') {
    return { problem: 'the root schema must have type "object"' };
  }
  const nodes = new Map<Schema, string>();
  const patterns = { instructions: 0, runes: 0, scope: new Map() as PatternScope };
  const problem =
    schemaProblemAt(format.schema, 'schema', 0, nodes, patterns) ??
    referenceProblem(format.schema, nodes);
  return problem ? { problem } : { problem: null, patterns: patterns.scope };
}

export function jsonSchemaFormatProblem(format: JsonSchemaResponseFormat): string | null {
  return schemaAdmission(format).problem;
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

function resolveRef(ref: string, root: Schema): Schema | null {
  let pointer: string;
  try {
    pointer = decodeURIComponent(ref.slice(1));
  } catch {
    return null;
  }
  if (!pointer.startsWith('/$defs/')) return null;
  let target: unknown = root;
  for (const encoded of pointer.slice(1).split('/')) {
    if (/~(?:[^01]|$)/.test(encoded)) return null;
    const token = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(target)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) return null;
      const index = Number(token);
      if (index >= target.length) return null;
      target = target[index];
    } else if (isRecord(target) && Object.hasOwn(target, token)) {
      target = target[token];
    } else {
      return null;
    }
  }
  return isRecord(target) ? target : null;
}

function referenceProblem(root: Schema, nodes: ReadonlyMap<Schema, string>): string | null {
  const depths = new Map<Schema, number>();
  const active = new Set<Schema>();
  function evaluationDepth(schema: Schema): number | string {
    const cached = depths.get(schema);
    if (cached !== undefined) return cached;
    const path = nodes.get(schema) ?? 'schema';
    if (active.has(schema)) return `${path} has a reference cycle without a child value`;
    if (active.size > MAX_SCHEMA_DEPTH)
      return `${path} references deeper than ${MAX_SCHEMA_DEPTH} levels`;
    active.add(schema);
    try {
      const children: Schema[] = [];
      const ref = schema['$ref'];
      if (typeof ref === 'string') {
        const target = resolveRef(ref, root);
        if (!target || !nodes.has(target)) return `${path}.$ref must point to an admitted schema`;
        children.push(target);
      }
      if (Array.isArray(schema['anyOf'])) {
        for (const option of schema['anyOf']) {
          if (isRecord(option)) children.push(option);
        }
      }
      let depth = 0;
      for (const child of children) {
        const childDepth = evaluationDepth(child);
        if (typeof childDepth === 'string') return childDepth;
        depth = Math.max(depth, childDepth + 1);
      }
      if (depth > MAX_SCHEMA_DEPTH)
        return `${path} references deeper than ${MAX_SCHEMA_DEPTH} levels`;
      depths.set(schema, depth);
      return depth;
    } finally {
      active.delete(schema);
    }
  }
  for (const schema of nodes.keys()) {
    const depth = evaluationDepth(schema);
    if (typeof depth === 'string') return depth;
  }
  return null;
}

class EvaluationBudgetExceeded extends Error {}

interface Evaluation {
  readonly root: Schema;
  readonly memo: Map<Schema, Map<unknown, { path: string; problem: string | null }>>;
  readonly references: Map<string, Schema | null>;
  readonly patterns: PatternScope;
  spent: number;
  patternWork: number;
}

function spend(run: Evaluation, units: number): void {
  run.spent += units;
  if (run.spent > MAX_EVALUATION_UNITS) throw new EvaluationBudgetExceeded();
}

function chargePatternWork(run: Evaluation, units: number): void {
  run.patternWork += units;
  if (run.patternWork > MAX_PATTERN_WORK) throw new EvaluationBudgetExceeded();
}

function patternMatches(compiled: CompiledPattern, value: string, run: Evaluation): boolean {
  const { automaton, matcher, scans } = compiled;
  const characters = value.length + 1;
  const worstCase = characters * (compiled.instructions + scans);
  const remaining = MAX_PATTERN_WORK - run.patternWork;
  if (worstCase > remaining) throw new EvaluationBudgetExceeded();
  if (automaton === null) {
    chargePatternWork(run, worstCase);
    return matcher.test(value);
  }
  if (automaton.kind === 'one-pass') {
    chargePatternWork(run, characters * (automaton.stepsPerCharacter + scans));
    return matcher.test(value);
  }
  const { dfa, meter } = automaton;
  dfa.memBudget = Math.min(dfa.memBudget, (remaining - worstCase) * DFA_BYTES_PER_WORK_UNIT);
  const available = dfa.memBudget;
  meter.steps = 0;
  meter.fellBack = false;
  const matched = matcher.test(value);
  const allocated = Math.ceil((available - dfa.memBudget) / DFA_BYTES_PER_WORK_UNIT);
  const spent = characters * (1 + scans) + meter.steps + allocated;
  chargePatternWork(run, dfa.failed || meter.fellBack ? spent + worstCase : spent);
  return matched;
}

function valueProblem(
  value: unknown,
  schema: Schema,
  run: Evaluation,
  path: string,
): string | null {
  let byValue = run.memo.get(schema);
  const hit = byValue?.get(value);
  if (hit && hit.path === path) return hit.problem;
  spend(run, 1);
  const problem = evaluateValue(value, schema, run, path);
  if (!byValue) {
    byValue = new Map();
    run.memo.set(schema, byValue);
  }
  byValue.set(value, { path, problem });
  return problem;
}

function evaluateValue(
  value: unknown,
  schema: Schema,
  run: Evaluation,
  path: string,
): string | null {
  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    let referenced = run.references.get(ref);
    if (referenced === undefined) {
      referenced = resolveRef(ref, run.root);
      run.references.set(ref, referenced);
    }
    if (!referenced) return `${path} refers to a missing definition`;
    const problem = valueProblem(value, referenced, run, path);
    if (problem) return problem;
  }

  if (Array.isArray(schema['anyOf'])) {
    const matched = schema['anyOf'].some(
      (option) => isRecord(option) && valueProblem(value, option, run, path) === null,
    );
    if (!matched) return `${path} matches none of the allowed shapes`;
  }

  const declared = schema['type'];
  const types = typeof declared === 'string' ? [declared] : Array.isArray(declared) ? declared : [];
  spend(run, types.length);
  if (
    types.length > 0 &&
    !types.some((type) => typeof type === 'string' && typeMatches(value, type))
  ) {
    return `${path} must be ${types.join(' or ')}`;
  }
  if (
    Array.isArray(schema['enum']) &&
    !schema['enum'].some((entry) => jsonValuesEqual(entry, value, run))
  ) {
    return `${path} must be one of the allowed values`;
  }
  if (Object.hasOwn(schema, 'const') && !jsonValuesEqual(schema['const'], value, run))
    return `${path} must be the fixed value`;

  if (typeof value === 'string') {
    const minLength = schema['minLength'];
    const maxLength = schema['maxLength'];
    const pattern = schema['pattern'];
    if (typeof minLength === 'number' && value.length < minLength) return `${path} is too short`;
    if (typeof maxLength === 'number' && value.length > maxLength) return `${path} is too long`;
    if (typeof pattern === 'string') {
      const compiled = compilePattern(pattern, run.patterns);
      if (compiled.kind !== 'compiled') return `${path} has a pattern that cannot be checked`;
      if (value.length > MAX_PATTERN_INPUT_CHARS) {
        return `${path} is too long to check against its pattern`;
      }
      if (!patternMatches(compiled, value, run)) return `${path} does not match its pattern`;
    }
  }
  if (typeof value === 'number') {
    const minimum = schema['minimum'];
    const maximum = schema['maximum'];
    if (typeof minimum === 'number' && value < minimum) return `${path} is below its minimum`;
    if (typeof maximum === 'number' && value > maximum) return `${path} is above its maximum`;
  }
  if (Array.isArray(value)) {
    const minItems = schema['minItems'];
    const maxItems = schema['maxItems'];
    if (typeof minItems === 'number' && value.length < minItems) return `${path} has too few items`;
    if (typeof maxItems === 'number' && value.length > maxItems)
      return `${path} has too many items`;
    const items = schema['items'];
    if (isRecord(items)) {
      for (let index = 0; index < value.length; index += 1) {
        const problem = valueProblem(value[index], items, run, `${path}[${index}]`);
        if (problem) return problem;
      }
    }
  }
  if (isRecord(value)) {
    const properties = isRecord(schema['properties']) ? schema['properties'] : {};
    const required = Array.isArray(schema['required']) ? schema['required'] : [];
    spend(run, required.length);
    for (const name of required) {
      if (typeof name === 'string' && !Object.hasOwn(value, name))
        return `${path}.${name} is missing`;
    }
    const additional = schema['additionalProperties'];
    const entries = Object.entries(value);
    spend(run, entries.length);
    for (const [name, child] of entries) {
      const property = Object.hasOwn(properties, name) ? properties[name] : undefined;
      if (isRecord(property)) {
        const problem = valueProblem(child, property, run, `${path}.${name}`);
        if (problem) return problem;
      } else if (additional === false) {
        return `${path}.${name} is not allowed`;
      } else if (isRecord(additional)) {
        const problem = valueProblem(child, additional, run, `${path}.${name}`);
        if (problem) return problem;
      }
    }
  }
  return null;
}

function nestsDeeperThan(root: unknown, limit: number): boolean {
  const pending: Array<[unknown, number]> = [[root, 0]];
  while (pending.length > 0) {
    const [value, depth] = pending.pop()!;
    if (typeof value !== 'object' || value === null) continue;
    if (depth >= limit) return true;
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      pending.push([child, depth + 1]);
    }
  }
  return false;
}

function replyProblem(reply: unknown, schema: Schema, patterns: PatternScope): string | null {
  if (nestsDeeperThan(reply, MAX_REPLY_DEPTH)) {
    return `the reply nests deeper than ${MAX_REPLY_DEPTH} levels`;
  }
  try {
    return valueProblem(
      reply,
      schema,
      {
        root: schema,
        memo: new Map(),
        references: new Map(),
        patterns,
        spent: 0,
        patternWork: 0,
      },
      '$',
    );
  } catch (error) {
    if (error instanceof EvaluationBudgetExceeded) {
      return 'the schema is too expensive to check against this reply';
    }
    throw error;
  }
}

export function jsonSchemaDirective(format: JsonSchemaResponseFormat): string {
  return [
    'You must reply with a single valid JSON object and nothing else.',
    'Do not wrap it in a markdown code fence, and do not write any prose before or after it.',
    `The object must validate against this JSON Schema, named "${format.name}"${
      format.description ? ` (${format.description})` : ''
    }:`,
    JSON.stringify(format.schema),
  ].join('\n');
}

export type JsonSchemaSettlement =
  | { ok: true; content: string }
  | {
      ok: false;
      status: 400 | 502;
      type: 'content_filter' | 'invalid_response_error';
      code: 'json_schema_refused' | 'json_schema_incomplete' | 'json_schema_not_satisfied';
      message: string;
    };

function extractReply(rawContent: string): ReturnType<typeof extractJsonObject> {
  try {
    return extractJsonObject(rawContent);
  } catch (error) {
    if (error instanceof RangeError) {
      return { ok: false, reason: 'The model returned JSON nested too deeply to read.' };
    }
    throw error;
  }
}

export function settleJsonSchemaCompletion(
  rawContent: string,
  finishReason: string | null,
  format: JsonSchemaResponseFormat,
): JsonSchemaSettlement {
  if (isBlockedFinishReason(finishReason)) {
    return {
      ok: false,
      status: 400,
      type: 'content_filter',
      code: 'json_schema_refused',
      message: 'The model declined this request, so there is no object to return.',
    };
  }
  const extraction = extractReply(rawContent);
  if (!extraction.ok || extraction.content === undefined) {
    return isMaxOutputFinishReason(finishReason)
      ? {
          ok: false,
          status: 502,
          type: 'invalid_response_error',
          code: 'json_schema_incomplete',
          message:
            'The model reached its output limit before the object was complete. Raise `max_tokens`, or ask for a smaller object.',
        }
      : {
          ok: false,
          status: 502,
          type: 'invalid_response_error',
          code: 'json_schema_not_satisfied',
          message: `${extraction.reason} Retry the request.`,
        };
  }
  const admission = schemaAdmission(format);
  const problem =
    admission.problem === null
      ? replyProblem(JSON.parse(extraction.content) as unknown, format.schema, admission.patterns)
      : admission.problem;
  if (problem) {
    return {
      ok: false,
      status: 502,
      type: 'invalid_response_error',
      code: 'json_schema_not_satisfied',
      message: `The model's reply did not match the schema: ${problem}. Retry the request.`,
    };
  }
  return { ok: true, content: extraction.content };
}
