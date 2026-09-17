/**
 * A JSON Schema subset validator for the structured-output suite.
 *
 * The harness cannot resolve workspace dependencies (see `types.ts`), so it
 * validates the keywords its corpora use and refuses a schema that uses any
 * other keyword at load time. A schema keyword this validator silently ignored
 * would pass every answer on that constraint.
 *
 * @module evals/json-schema
 * @packageDocumentation
 */

const SUPPORTED_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'pattern',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'description',
]);

const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function unsupportedSchemaKeywords(schema: unknown, at = '$'): string[] {
  if (!isRecord(schema)) return [`${at} is not a schema object`];
  const problems: string[] = [];
  for (const [keyword, value] of Object.entries(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      problems.push(`${at}.${keyword}`);
      continue;
    }
    if (keyword === 'type') {
      const types = Array.isArray(value) ? value : [value];
      for (const type of types) {
        if (typeof type !== 'string' || !TYPES.has(type))
          problems.push(`${at}.type=${String(type)}`);
      }
    }
    if (keyword === 'properties') {
      if (!isRecord(value)) {
        problems.push(`${at}.properties`);
        continue;
      }
      for (const [name, child] of Object.entries(value)) {
        problems.push(...unsupportedSchemaKeywords(child, `${at}.properties.${name}`));
      }
    }
    if (keyword === 'items') problems.push(...unsupportedSchemaKeywords(value, `${at}.items`));
    if (keyword === 'additionalProperties' && typeof value !== 'boolean') {
      problems.push(`${at}.additionalProperties must be a boolean`);
    }
  }
  return problems;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeOf(value) === type;
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateJsonSchema(
  schema: Record<string, unknown>,
  value: unknown,
  at = '$',
): string[] {
  const errors: string[] = [];
  const type = schema['type'];
  if (type !== undefined) {
    const types = (Array.isArray(type) ? type : [type]) as string[];
    if (!types.some((entry) => matchesType(value, entry))) {
      return [`${at} is ${typeOf(value)}, expected ${types.join(' or ')}`];
    }
  }
  if (schema['const'] !== undefined && !deepEqual(schema['const'], value)) {
    errors.push(`${at} must equal ${JSON.stringify(schema['const'])}`);
  }
  const allowed = schema['enum'];
  if (Array.isArray(allowed) && !allowed.some((entry) => deepEqual(entry, value))) {
    errors.push(`${at} must be one of ${JSON.stringify(allowed)}`);
  }
  if (typeof value === 'string') {
    const pattern = schema['pattern'];
    if (typeof pattern === 'string' && !new RegExp(pattern, 'u').test(value)) {
      errors.push(`${at} does not match /${pattern}/`);
    }
    const minLength = schema['minLength'];
    if (typeof minLength === 'number' && value.length < minLength) {
      errors.push(`${at} is shorter than ${minLength}`);
    }
    const maxLength = schema['maxLength'];
    if (typeof maxLength === 'number' && value.length > maxLength) {
      errors.push(`${at} is longer than ${maxLength}`);
    }
  }
  if (typeof value === 'number') {
    const minimum = schema['minimum'];
    if (typeof minimum === 'number' && value < minimum) errors.push(`${at} is below ${minimum}`);
    const maximum = schema['maximum'];
    if (typeof maximum === 'number' && value > maximum) errors.push(`${at} is above ${maximum}`);
  }
  if (Array.isArray(value)) {
    const minItems = schema['minItems'];
    if (typeof minItems === 'number' && value.length < minItems) {
      errors.push(`${at} has fewer than ${minItems} items`);
    }
    const maxItems = schema['maxItems'];
    if (typeof maxItems === 'number' && value.length > maxItems) {
      errors.push(`${at} has more than ${maxItems} items`);
    }
    const items = schema['items'];
    if (isRecord(items)) {
      value.forEach((entry, index) => {
        errors.push(...validateJsonSchema(items, entry, `${at}[${index}]`));
      });
    }
  }
  if (isRecord(value)) {
    const properties = isRecord(schema['properties']) ? schema['properties'] : {};
    const required = Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];
    for (const name of required) {
      if (!(name in value)) errors.push(`${at}.${name} is required`);
    }
    for (const [name, child] of Object.entries(value)) {
      const childSchema = properties[name];
      if (isRecord(childSchema)) {
        errors.push(...validateJsonSchema(childSchema, child, `${at}.${name}`));
      } else if (schema['additionalProperties'] === false) {
        errors.push(`${at}.${name} is not allowed`);
      }
    }
  }
  return errors;
}

/**
 * The answer is the JSON value, optionally inside one fenced block. Prose
 * around the value is not stripped: a structured-output request that comes back
 * with a preamble is a failed structured output.
 */
export function parseJsonAnswer(text: string): { value: unknown } | { error: string } {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/u.exec(trimmed);
  const body = fenced ? fenced[1]! : trimmed;
  try {
    return { value: JSON.parse(body) };
  } catch (error) {
    return { error: `not valid JSON: ${(error as Error).message}` };
  }
}

export function readJsonPath(value: unknown, path: string): { found: boolean; value?: unknown } {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (Array.isArray(current) && /^\d+$/u.test(segment)) {
      current = current[Number(segment)];
    } else if (isRecord(current) && segment in current) {
      current = current[segment];
    } else {
      return { found: false };
    }
    if (current === undefined) return { found: false };
  }
  return { found: true, value: current };
}
