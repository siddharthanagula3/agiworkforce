import 'server-only';

import { z } from 'zod';
import type { ChatResponseFormat } from '@agiworkforce/types';
import { extractJsonObject, wantsJsonObject } from './json-object-mode';
import { isBlockedFinishReason, isMaxOutputFinishReason } from './turn-completeness';

const MAX_SCHEMA_CHARS = 32_000;
const MAX_SCHEMA_DEPTH = 10;

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

function isRecord(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  const pending: Array<[unknown, unknown]> = [[left, right]];
  while (pending.length > 0) {
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
): string | null {
  if (depth > MAX_SCHEMA_DEPTH) return `${path} nests deeper than ${MAX_SCHEMA_DEPTH} levels`;
  if (!isRecord(schema)) return `${path} is not a schema object`;
  nodes.set(schema, path);
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) return `${path} uses unsupported keyword "${key}"`;
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
    schema['anyOf'].forEach((child, index) => children.push([`${path}.anyOf[${index}]`, child]));
  }
  if (isRecord(schema['additionalProperties'])) {
    children.push([`${path}.additionalProperties`, schema['additionalProperties']]);
  }
  for (const [childPath, child] of children) {
    const problem = schemaProblemAt(child, childPath, depth + 1, nodes);
    if (problem) return problem;
  }
  return null;
}

export function jsonSchemaFormatProblem(format: JsonSchemaResponseFormat): string | null {
  if (JSON.stringify(format.schema).length > MAX_SCHEMA_CHARS) {
    return `the schema is larger than ${MAX_SCHEMA_CHARS} characters`;
  }
  if (format.schema['type'] !== 'object') return 'the root schema must have type "object"';
  const nodes = new Map<Schema, string>();
  return (
    schemaProblemAt(format.schema, 'schema', 0, nodes) ?? referenceProblem(format.schema, nodes)
  );
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

function valueProblem(value: unknown, schema: Schema, root: Schema, path: string): string | null {
  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    const referenced = resolveRef(ref, root);
    if (!referenced) return `${path} refers to a missing definition`;
    const problem = valueProblem(value, referenced, root, path);
    if (problem) return problem;
  }

  if (Array.isArray(schema['anyOf'])) {
    const matched = schema['anyOf'].some(
      (option) => isRecord(option) && valueProblem(value, option, root, path) === null,
    );
    if (!matched) return `${path} matches none of the allowed shapes`;
  }

  const declared = schema['type'];
  const types = typeof declared === 'string' ? [declared] : Array.isArray(declared) ? declared : [];
  if (
    types.length > 0 &&
    !types.some((type) => typeof type === 'string' && typeMatches(value, type))
  ) {
    return `${path} must be ${types.join(' or ')}`;
  }
  if (
    Array.isArray(schema['enum']) &&
    !schema['enum'].some((entry) => jsonValuesEqual(entry, value))
  ) {
    return `${path} must be one of the allowed values`;
  }
  if (Object.hasOwn(schema, 'const') && !jsonValuesEqual(schema['const'], value))
    return `${path} must be the fixed value`;

  if (typeof value === 'string') {
    const minLength = schema['minLength'];
    const maxLength = schema['maxLength'];
    const pattern = schema['pattern'];
    if (typeof minLength === 'number' && value.length < minLength) return `${path} is too short`;
    if (typeof maxLength === 'number' && value.length > maxLength) return `${path} is too long`;
    if (typeof pattern === 'string') {
      try {
        if (!new RegExp(pattern, 'u').test(value)) return `${path} does not match its pattern`;
      } catch {
        return `${path} has a pattern that cannot be checked`;
      }
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
        const problem = valueProblem(value[index], items, root, `${path}[${index}]`);
        if (problem) return problem;
      }
    }
  }
  if (isRecord(value)) {
    const properties = isRecord(schema['properties']) ? schema['properties'] : {};
    const required = Array.isArray(schema['required']) ? schema['required'] : [];
    for (const name of required) {
      if (typeof name === 'string' && !Object.hasOwn(value, name))
        return `${path}.${name} is missing`;
    }
    const additional = schema['additionalProperties'];
    for (const [name, child] of Object.entries(value)) {
      const property = Object.hasOwn(properties, name) ? properties[name] : undefined;
      if (isRecord(property)) {
        const problem = valueProblem(child, property, root, `${path}.${name}`);
        if (problem) return problem;
      } else if (additional === false) {
        return `${path}.${name} is not allowed`;
      } else if (isRecord(additional)) {
        const problem = valueProblem(child, additional, root, `${path}.${name}`);
        if (problem) return problem;
      }
    }
  }
  return null;
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
  const extraction = extractJsonObject(rawContent);
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
  const problem =
    jsonSchemaFormatProblem(format) ??
    valueProblem(JSON.parse(extraction.content) as unknown, format.schema, format.schema, '$');
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
