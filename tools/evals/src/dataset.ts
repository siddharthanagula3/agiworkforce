/**
 * Corpus loading and validation.
 *
 * The corpora are data files, so they are parsed as untrusted input: a typo in
 * a check kind, a duplicated id, or a row with no assertions would otherwise
 * turn into a silently-passing row, and a corpus that cannot fail is worse than
 * no corpus because it stops the next person looking.
 *
 * @module evals/dataset
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { unsupportedSchemaKeywords } from './json-schema';
import { LANGUAGE_CODES } from './language';
import { fixturePath } from './request';
import type {
  ArgumentMatcher,
  Check,
  CorpusPriority,
  DatasetProvenance,
  EvalAttachment,
  EvalCase,
  EvalDataset,
  EvalHaystack,
  EvalSource,
  EvalToolCall,
  EvalToolDef,
  EvalTurn,
  ExpectedBehaviour,
  LanguageCode,
  ProvenanceKind,
  RiskLabel,
  SuiteName,
} from './types';

export const SUITE_NAMES: readonly SuiteName[] = [
  'golden',
  'refusal',
  'jailbreak',
  'chat',
  'coding',
  'reasoning',
  'research',
  'search',
  'tools',
  'structured-output',
  'long-context',
  'files',
  'browser',
  'computer-use',
  'multilingual',
];
const RISKS: readonly RiskLabel[] = ['low', 'high'];
const BEHAVIOURS: readonly ExpectedBehaviour[] = ['answer', 'refusal', 'safe-completion'];
const CHECK_KINDS = [
  'includesAny',
  'includesAll',
  'excludesAll',
  'matches',
  'refuses',
  'maxWords',
  'exactAnswer',
  'jsonSchema',
  'jsonEquals',
  'codeTests',
  'toolCalled',
  'noToolCall',
  'toolSequence',
  'citations',
  'citedUrls',
  'sourceQuality',
  'sourceRestriction',
  'language',
] as const;
const PRIORITIES: readonly CorpusPriority[] = ['P0', 'P1'];
const PROVENANCE_KINDS: readonly ProvenanceKind[] = ['authored', 'derived', 'captured'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const MODULE_NAME = /^[a-z][a-z0-9-]*\.mjs$/u;
const PROMPT_ID = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/u;
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}

function readString(value: unknown, where: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(where, `${field} must be a non-empty string`);
  }
  return value;
}

function readStringArray(value: unknown, where: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(where, 'values must be a non-empty array of strings');
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      fail(where, 'values must be a non-empty array of strings');
    }
  }
  return value as readonly string[];
}

function readRegex(value: unknown, where: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(where, `${field} requires a non-empty pattern`);
  }
  try {
    new RegExp(value, 'iu');
  } catch (error) {
    fail(where, `pattern is not a valid regex: ${(error as Error).message}`);
  }
  return value;
}

function readPositiveInteger(value: unknown, where: string, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) fail(where, message);
  return value;
}

function parseMatcher(raw: unknown, where: string): ArgumentMatcher {
  if (!isRecord(raw) || Object.keys(raw).length !== 1) {
    fail(where, 'an argument matcher must have exactly one of equals, matches, includes, within');
  }
  if ('equals' in raw) {
    const value = raw['equals'];
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      fail(where, 'equals must be a string, number or boolean');
    }
    return { equals: value as string | number | boolean };
  }
  if ('matches' in raw) return { matches: readRegex(raw['matches'], where, 'matches') };
  if ('includes' in raw) return { includes: readString(raw['includes'], where, 'includes') };
  if ('within' in raw) {
    const within = raw['within'];
    if (
      !isRecord(within) ||
      typeof within['min'] !== 'number' ||
      typeof within['max'] !== 'number' ||
      within['min'] > within['max']
    ) {
      fail(where, 'within requires numeric min <= max');
    }
    return { within: { min: within['min'], max: within['max'] } };
  }
  fail(where, 'unknown argument matcher');
}

function parseCheck(raw: unknown, where: string): Check {
  if (!isRecord(raw)) fail(where, 'check must be an object');
  const kind = raw['kind'];
  if (typeof kind !== 'string' || !(CHECK_KINDS as readonly string[]).includes(kind)) {
    fail(where, `unknown check kind ${JSON.stringify(kind)}`);
  }

  switch (kind as (typeof CHECK_KINDS)[number]) {
    case 'includesAny':
      return { kind: 'includesAny', values: readStringArray(raw['values'], where) };
    case 'includesAll':
      return { kind: 'includesAll', values: readStringArray(raw['values'], where) };
    case 'excludesAll':
      return { kind: 'excludesAll', values: readStringArray(raw['values'], where) };
    case 'matches':
      return { kind: 'matches', pattern: readRegex(raw['pattern'], where, 'matches') };
    case 'refuses':
      return { kind: 'refuses' };
    case 'maxWords':
      return {
        kind: 'maxWords',
        limit: readPositiveInteger(
          raw['limit'],
          where,
          'maxWords requires a positive integer limit',
        ),
      };
    case 'exactAnswer': {
      const expected = readString(raw['expected'], where, 'expected');
      const tolerance = raw['tolerance'];
      if (tolerance === undefined) return { kind: 'exactAnswer', expected };
      if (typeof tolerance !== 'number' || tolerance < 0 || Number.isNaN(Number(expected))) {
        fail(where, 'tolerance requires a numeric expected answer and a non-negative number');
      }
      return { kind: 'exactAnswer', expected, tolerance };
    }
    case 'jsonSchema': {
      const schema = raw['schema'];
      const problems = unsupportedSchemaKeywords(schema);
      if (problems.length > 0) fail(where, `unsupported schema keywords ${problems.join(', ')}`);
      return { kind: 'jsonSchema', schema: schema as Record<string, unknown> };
    }
    case 'jsonEquals': {
      if (!('value' in raw)) fail(where, 'jsonEquals requires a value');
      return {
        kind: 'jsonEquals',
        path: readString(raw['path'], where, 'path'),
        value: raw['value'],
      };
    }
    case 'codeTests': {
      const module = readString(raw['module'], where, 'module');
      if (!MODULE_NAME.test(module))
        fail(where, 'module must be a plain kebab-case .mjs file name');
      const tests = readString(raw['tests'], where, 'tests');
      if (!tests.includes(`./${module}`)) fail(where, `tests must import ./${module}`);
      const timeoutMs = raw['timeoutMs'];
      if (timeoutMs === undefined) return { kind: 'codeTests', module, tests };
      return {
        kind: 'codeTests',
        module,
        tests,
        timeoutMs: readPositiveInteger(timeoutMs, where, 'timeoutMs must be a positive integer'),
      };
    }
    case 'toolCalled': {
      const name = readString(raw['name'], where, 'name');
      const position = raw['position'];
      if (position !== undefined && position !== 'first' && position !== 'any') {
        fail(where, 'position must be first or any');
      }
      const rawArguments = raw['arguments'];
      if (rawArguments !== undefined && !isRecord(rawArguments)) {
        fail(where, 'arguments must be an object of matchers');
      }
      const parsedArguments =
        rawArguments === undefined
          ? undefined
          : Object.fromEntries(
              Object.entries(rawArguments).map(([key, matcher]) => [
                key,
                parseMatcher(matcher, `${where}.arguments.${key}`),
              ]),
            );
      return {
        kind: 'toolCalled',
        name,
        ...(position === undefined ? {} : { position }),
        ...(parsedArguments === undefined ? {} : { arguments: parsedArguments }),
      };
    }
    case 'noToolCall': {
      const names = raw['names'];
      return names === undefined
        ? { kind: 'noToolCall' }
        : { kind: 'noToolCall', names: readStringArray(names, where) };
    }
    case 'toolSequence':
      return { kind: 'toolSequence', names: readStringArray(raw['names'], where) };
    case 'citations': {
      const sources = readStringArray(raw['sources'], where);
      const minDistinct = readPositiveInteger(
        raw['minDistinct'],
        where,
        'minDistinct must be a positive integer',
      );
      const required = raw['required'];
      if (required === undefined) return { kind: 'citations', sources, minDistinct };
      if (!Array.isArray(required) || required.length === 0) {
        fail(where, 'required must be a non-empty array');
      }
      return {
        kind: 'citations',
        sources,
        minDistinct,
        required: required.map((entry, index) => {
          const at = `${where}.required[${index}]`;
          if (!isRecord(entry)) fail(at, 'required citation must be an object');
          const source = readString(entry['source'], at, 'source');
          if (!sources.includes(source)) fail(at, `source ${source} is not in sources`);
          return { claim: readRegex(entry['claim'], at, 'claim'), source };
        }),
      };
    }
    case 'citedUrls': {
      const allowed = readStringArray(raw['allowed'], where);
      const required = readStringArray(raw['required'], where);
      for (const url of required) {
        if (!allowed.includes(url)) fail(where, `required url ${url} is not allowed`);
      }
      return { kind: 'citedUrls', allowed, required };
    }
    case 'sourceQuality': {
      const authoritative = readStringArray(raw['authoritative'], where);
      const weak = readStringArray(raw['weak'], where);
      for (const url of authoritative) {
        if (weak.includes(url)) fail(where, `${url} is both authoritative and weak`);
      }
      const minAuthoritative = raw['minAuthoritative'];
      if (minAuthoritative === undefined) return { kind: 'sourceQuality', authoritative, weak };
      const minimum = readPositiveInteger(
        minAuthoritative,
        where,
        'minAuthoritative must be a positive integer',
      );
      if (minimum > authoritative.length) {
        fail(where, `minAuthoritative ${minimum} exceeds the ${authoritative.length} listed`);
      }
      return { kind: 'sourceQuality', authoritative, weak, minAuthoritative: minimum };
    }
    case 'sourceRestriction': {
      const sources = readStringArray(raw['sources'], where);
      const urls = raw['urls'];
      return urls === undefined
        ? { kind: 'sourceRestriction', sources }
        : { kind: 'sourceRestriction', sources, urls: readStringArray(urls, where) };
    }
    case 'language': {
      const expected = raw['expected'];
      if (
        typeof expected !== 'string' ||
        !(LANGUAGE_CODES as readonly string[]).includes(expected)
      ) {
        fail(where, `expected must be one of ${LANGUAGE_CODES.join(', ')}`);
      }
      return { kind: 'language', expected: expected as LanguageCode };
    }
  }
}

function parseToolDef(raw: unknown, where: string): EvalToolDef {
  if (!isRecord(raw)) fail(where, 'tool must be an object');
  const name = readString(raw['name'], where, 'name');
  if (!TOOL_NAME.test(name)) fail(where, 'tool name must match [a-zA-Z0-9_-]{1,64}');
  const inputSchema = raw['inputSchema'];
  if (!isRecord(inputSchema) || inputSchema['type'] !== 'object') {
    fail(where, 'inputSchema must be an object schema');
  }
  return { name, description: readString(raw['description'], where, 'description'), inputSchema };
}

function parseToolCall(raw: unknown, where: string): EvalToolCall {
  if (!isRecord(raw)) fail(where, 'tool call must be an object');
  const id = raw['id'];
  if (typeof id !== 'string' || !TOOL_NAME.test(id)) {
    fail(where, 'tool call id must match [a-zA-Z0-9_-]{1,64}');
  }
  const input = raw['input'];
  if (!isRecord(input)) fail(where, 'tool call input must be an object');
  return { id, name: readString(raw['name'], where, 'name'), input };
}

function parseTurn(raw: unknown, where: string): EvalTurn {
  if (!isRecord(raw)) fail(where, 'turn must be an object');
  const role = raw['role'];
  if (role === 'user') return { role, content: readString(raw['content'], where, 'content') };
  if (role === 'assistant') {
    const content = raw['content'];
    if (typeof content !== 'string') fail(where, 'assistant content must be a string');
    const toolCalls = raw['toolCalls'];
    if (toolCalls === undefined) {
      if (content.trim().length === 0) fail(where, 'assistant turn needs content or tool calls');
      return { role, content };
    }
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      fail(where, 'toolCalls must be a non-empty array');
    }
    return {
      role,
      content,
      toolCalls: toolCalls.map((call, index) =>
        parseToolCall(call, `${where}.toolCalls[${index}]`),
      ),
    };
  }
  if (role === 'tool') {
    const toolUseId = readString(raw['toolUseId'], where, 'toolUseId');
    const content = raw['content'];
    const fixture = raw['fixture'];
    if ((content === undefined) === (fixture === undefined)) {
      fail(where, 'tool turn needs exactly one of content or fixture');
    }
    return fixture === undefined
      ? { role, toolUseId, content: readString(content, where, 'content') }
      : { role, toolUseId, fixture: readString(fixture, where, 'fixture') };
  }
  fail(where, 'role must be user, assistant or tool');
}

function parseTurns(raw: unknown, where: string): readonly EvalTurn[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(where, 'turns must be a non-empty array');
  const turns = raw.map((turn, index) => parseTurn(turn, `${where}[${index}]`));
  const callIds = new Set(
    turns.flatMap((turn) =>
      turn.role === 'assistant' ? (turn.toolCalls ?? []).map((call) => call.id) : [],
    ),
  );
  for (const turn of turns) {
    if (turn.role === 'tool' && !callIds.has(turn.toolUseId)) {
      fail(where, `tool result ${turn.toolUseId} answers no assistant tool call`);
    }
  }
  return turns;
}

/**
 * Declared rather than free text: a typo in a media type reaches the provider
 * as a different modality, and the row then measures whether the adapter
 * tolerated the mistake instead of whether the model read the file.
 */
export const ATTACHMENT_MEDIA_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/wav',
] as const;

function parseAttachment(raw: unknown, where: string): EvalAttachment {
  if (!isRecord(raw)) fail(where, 'attachment must be an object');
  const mediaType = readString(raw['mediaType'], where, 'mediaType');
  if (!(ATTACHMENT_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    fail(where, `mediaType ${mediaType} is not one of ${ATTACHMENT_MEDIA_TYPES.join(', ')}`);
  }
  return { fixture: readString(raw['fixture'], where, 'fixture'), mediaType };
}

function parseSource(raw: unknown, where: string): EvalSource {
  if (!isRecord(raw)) fail(where, 'source must be an object');
  const url = raw['url'];
  const source = {
    id: readString(raw['id'], where, 'id'),
    title: readString(raw['title'], where, 'title'),
    text: readString(raw['text'], where, 'text'),
  };
  return url === undefined ? source : { ...source, url: readString(url, where, 'url') };
}

function parseHaystack(raw: unknown, where: string): EvalHaystack {
  if (!isRecord(raw)) fail(where, 'haystack must be an object');
  const depth = raw['depth'];
  if (typeof depth !== 'number' || depth < 0 || depth > 1) fail(where, 'depth must be in [0, 1]');
  const seed = raw['seed'];
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0) {
    fail(where, 'seed must be a non-negative integer');
  }
  return {
    seed,
    depth,
    targetChars: readPositiveInteger(
      raw['targetChars'],
      where,
      'targetChars must be a positive integer',
    ),
    needle: readString(raw['needle'], where, 'needle'),
  };
}

function parseList<T>(raw: unknown, where: string, parse: (entry: unknown, at: string) => T): T[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(where, 'must be a non-empty array');
  return raw.map((entry, index) => parse(entry, `${where}[${index}]`));
}

function parseCase(raw: unknown, suite: SuiteName, index: number): EvalCase {
  const where = `${suite}.cases[${index}]`;
  if (!isRecord(raw)) fail(where, 'case must be an object');

  const id = raw['id'];
  if (typeof id !== 'string' || !id.startsWith(`${suite}/`)) {
    fail(where, `id must be a string starting with "${suite}/"`);
  }
  const family = raw['family'];
  if (typeof family !== 'string' || family.trim().length === 0) {
    fail(where, 'family must be a non-empty string');
  }
  const risk = raw['risk'];
  if (typeof risk !== 'string' || !(RISKS as readonly string[]).includes(risk)) {
    fail(where, `risk must be one of ${RISKS.join(', ')}`);
  }
  const expected = raw['expected'];
  if (typeof expected !== 'string' || !(BEHAVIOURS as readonly string[]).includes(expected)) {
    fail(where, `expected must be one of ${BEHAVIOURS.join(', ')}`);
  }
  const prompt = raw['prompt'];
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    fail(where, 'prompt must be a non-empty string');
  }
  const rawChecks = raw['checks'];
  if (!Array.isArray(rawChecks) || rawChecks.length === 0) {
    fail(where, 'case must declare at least one check');
  }
  const notes = raw['notes'];
  if (notes !== undefined && typeof notes !== 'string') {
    fail(where, 'notes must be a string when present');
  }

  const checks = rawChecks.map((check, checkIndex) =>
    parseCheck(check, `${where}.checks[${checkIndex}]`),
  );
  const tools =
    raw['tools'] === undefined
      ? undefined
      : parseList(raw['tools'], `${where}.tools`, parseToolDef);
  if (tools === undefined && checks.some((check) => check.kind === 'toolCalled')) {
    fail(where, 'a toolCalled check needs the case to offer tools');
  }
  for (const check of checks) {
    if (check.kind === 'toolCalled' && !tools?.some((tool) => tool.name === check.name)) {
      fail(where, `toolCalled names ${check.name}, which the case does not offer`);
    }
  }
  const system = raw['system'];

  return {
    id,
    family,
    risk: risk as RiskLabel,
    expected: expected as ExpectedBehaviour,
    prompt,
    checks,
    ...(notes === undefined ? {} : { notes }),
    ...(system === undefined ? {} : { system: readString(system, where, 'system') }),
    ...(raw['turns'] === undefined ? {} : { turns: parseTurns(raw['turns'], `${where}.turns`) }),
    ...(tools === undefined ? {} : { tools }),
    ...(raw['attachments'] === undefined
      ? {}
      : { attachments: parseList(raw['attachments'], `${where}.attachments`, parseAttachment) }),
    ...(raw['sources'] === undefined
      ? {}
      : { sources: parseList(raw['sources'], `${where}.sources`, parseSource) }),
    ...(raw['haystack'] === undefined
      ? {}
      : { haystack: parseHaystack(raw['haystack'], `${where}.haystack`) }),
    ...(raw['requires'] === undefined
      ? {}
      : { requires: readStringArray(raw['requires'], `${where}.requires`) }),
  };
}

function parseProvenance(raw: unknown, where: string): DatasetProvenance {
  if (!isRecord(raw)) fail(where, 'provenance must be an object');
  const kind = raw['kind'];
  if (typeof kind !== 'string' || !(PROVENANCE_KINDS as readonly string[]).includes(kind)) {
    fail(where, `provenance kind must be one of ${PROVENANCE_KINDS.join(', ')}`);
  }
  const authoredOn = readString(raw['authoredOn'], where, 'authoredOn');
  if (!ISO_DATE.test(authoredOn)) fail(where, 'provenance authoredOn must be YYYY-MM-DD');
  const license = raw['license'];
  const notes = raw['notes'];
  return {
    kind: kind as ProvenanceKind,
    source: readString(raw['source'], where, 'source'),
    authoredOn,
    ...(license === undefined ? {} : { license: readString(license, where, 'license') }),
    ...(notes === undefined ? {} : { notes: readString(notes, where, 'notes') }),
  };
}

export function parseDataset(raw: unknown): EvalDataset {
  if (!isRecord(raw)) fail('dataset', 'dataset must be an object');

  const suite = raw['suite'];
  if (typeof suite !== 'string' || !(SUITE_NAMES as readonly string[]).includes(suite)) {
    fail('dataset', `suite must be one of ${SUITE_NAMES.join(', ')}`);
  }
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    fail(suite, 'version must be a positive integer');
  }
  const passThreshold = raw['passThreshold'];
  if (typeof passThreshold !== 'number' || passThreshold <= 0 || passThreshold > 1) {
    fail(suite, 'passThreshold must be in (0, 1]');
  }
  const priority = raw['priority'];
  if (typeof priority !== 'string' || !(PRIORITIES as readonly string[]).includes(priority)) {
    fail(suite, `priority must be one of ${PRIORITIES.join(', ')}`);
  }
  const provenance = parseProvenance(raw['provenance'], `${suite}.provenance`);
  const rawCases = raw['cases'];
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    fail(suite, 'cases must be a non-empty array');
  }
  const requires = raw['requires'];
  const maxOutputTokens = raw['maxOutputTokens'];
  const promptId = raw['promptId'];
  if (promptId !== undefined && (typeof promptId !== 'string' || !PROMPT_ID.test(promptId))) {
    fail(suite, 'promptId must be a dotted lower-case prompt manifest id');
  }

  const suiteName = suite as SuiteName;
  const cases = rawCases.map((entry, index) => parseCase(entry, suiteName, index));

  const seen = new Set<string>();
  for (const entry of cases) {
    if (seen.has(entry.id)) fail(suiteName, `duplicate case id ${entry.id}`);
    seen.add(entry.id);
  }

  return {
    suite: suiteName,
    version,
    priority: priority as CorpusPriority,
    provenance,
    passThreshold,
    ...(promptId === undefined ? {} : { promptId: promptId as string }),
    ...(requires === undefined ? {} : { requires: readStringArray(requires, `${suite}.requires`) }),
    ...(maxOutputTokens === undefined
      ? {}
      : {
          maxOutputTokens: readPositiveInteger(
            maxOutputTokens,
            suite,
            'maxOutputTokens must be a positive integer',
          ),
        }),
    cases,
  };
}

function caseFixtures(evalCase: EvalCase): string[] {
  return [
    ...(evalCase.attachments ?? []).map((attachment) => attachment.fixture),
    ...(evalCase.turns ?? []).flatMap((turn) =>
      turn.role === 'tool' && turn.fixture !== undefined ? [turn.fixture] : [],
    ),
  ];
}

export function loadDataset(suite: SuiteName): EvalDataset {
  const path = fileURLToPath(new URL(`../datasets/${suite}.json`, import.meta.url));
  const dataset = parseDataset(JSON.parse(readFileSync(path, 'utf8')));
  if (dataset.suite !== suite) {
    fail(suite, `file declares suite ${dataset.suite}`);
  }
  for (const evalCase of dataset.cases) {
    for (const fixture of caseFixtures(evalCase)) {
      if (!existsSync(fixturePath(fixture))) fail(evalCase.id, `fixture ${fixture} does not exist`);
    }
  }
  return dataset;
}

export function loadDatasets(suites: readonly SuiteName[]): readonly EvalDataset[] {
  return suites.map((suite) => loadDataset(suite));
}

export function loadAllDatasets(): readonly EvalDataset[] {
  return loadDatasets(SUITE_NAMES);
}

/**
 * Every corpus that measures `promptId`, so a prompt version change can be run
 * against the suites that cover it without anyone remembering which they are.
 */
export function datasetsForPrompt(
  promptId: string,
  datasets: readonly EvalDataset[] = loadAllDatasets(),
): readonly EvalDataset[] {
  return datasets.filter((dataset) => dataset.promptId === promptId);
}

export function promptIdsUnderEval(
  datasets: readonly EvalDataset[] = loadAllDatasets(),
): readonly string[] {
  return [
    ...new Set(
      datasets
        .map((dataset) => dataset.promptId)
        .filter((promptId): promptId is string => promptId !== undefined),
    ),
  ].sort();
}
