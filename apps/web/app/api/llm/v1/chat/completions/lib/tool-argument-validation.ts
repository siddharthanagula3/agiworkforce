import 'server-only';

type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';

const JSON_SCHEMA_TYPES: ReadonlySet<string> = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
  'null',
]);

const COMPOSITE_KEYWORDS = ['anyOf', 'oneOf', 'allOf', 'not', '$ref', 'if'] as const;
const MAX_LISTED_ENUM_VALUES = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function declaredTypes(schema: Record<string, unknown>): JsonSchemaType[] | null {
  const raw = schema['type'];
  const list = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : null;
  if (!list || list.length === 0) return null;
  if (!list.every((entry) => typeof entry === 'string' && JSON_SCHEMA_TYPES.has(entry))) {
    return null;
  }
  return list as JsonSchemaType[];
}

function matchesType(value: unknown, type: JsonSchemaType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isRecord(value);
    case 'null':
      return value === null;
  }
}

function describeTypes(types: JsonSchemaType[]): string {
  return types.map((type) => (type === 'integer' ? 'a whole number' : `a ${type}`)).join(' or ');
}

function propertyProblem(name: string, value: unknown, schema: unknown): string | null {
  if (!isRecord(schema)) return null;
  if (COMPOSITE_KEYWORDS.some((keyword) => keyword in schema)) return null;
  const types = declaredTypes(schema);
  if (types && !types.some((type) => matchesType(value, type))) {
    return `argument "${name}" must be ${describeTypes(types)}`;
  }
  const allowed = schema['enum'];
  if (
    Array.isArray(allowed) &&
    allowed.length > 0 &&
    allowed.every((entry) => entry === null || typeof entry !== 'object') &&
    !allowed.includes(value)
  ) {
    const listed = allowed.slice(0, MAX_LISTED_ENUM_VALUES).map((entry) => JSON.stringify(entry));
    const more = allowed.length > MAX_LISTED_ENUM_VALUES ? ', ...' : '';
    return `argument "${name}" must be one of ${listed.join(', ')}${more}`;
  }
  return null;
}

export function toolArgumentProblem(
  call: { args: Record<string, unknown>; argsMalformed?: true },
  schema: unknown,
): string | null {
  if (call.argsMalformed) return 'the arguments were not valid JSON';
  if (!isRecord(schema)) return null;
  if (COMPOSITE_KEYWORDS.some((keyword) => keyword in schema)) return null;
  const types = declaredTypes(schema);
  if (types && !types.includes('object')) return null;

  const required = Array.isArray(schema['required'])
    ? schema['required'].filter((entry): entry is string => typeof entry === 'string')
    : [];
  const missing = required.filter((name) => call.args[name] === undefined);
  if (missing.length > 0) {
    return `missing required argument${missing.length === 1 ? '' : 's'} ${missing
      .map((name) => `"${name}"`)
      .join(', ')}`;
  }

  const properties = isRecord(schema['properties']) ? schema['properties'] : {};
  for (const [name, value] of Object.entries(call.args)) {
    if (value === undefined) continue;
    if (value === null && !required.includes(name)) continue;
    const problem = propertyProblem(name, value, properties[name]);
    if (problem) return problem;
  }
  return null;
}

export function invalidToolArgumentsMessage(toolName: string, problem: string): string {
  return (
    `Tool "${toolName}" was not run because its arguments were rejected: ${problem}. ` +
    'Call it again with arguments that match its schema.'
  );
}
