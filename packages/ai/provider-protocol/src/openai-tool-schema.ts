import { normalizeToolParameterSchema } from './tool-parameter-schema';

export function normalizeStrictOpenAIJsonSchema(schema: unknown): unknown {
  return normalizeStrictOpenAIJsonSchemaRecursive(normalizeToolParameterSchema(schema ?? {}), 0);
}

function normalizeStrictOpenAIJsonSchemaRecursive(schema: unknown, depth: number): unknown {
  if (Array.isArray(schema)) {
    let changed = false;
    const normalized = schema.map((entry) => {
      const next = normalizeStrictOpenAIJsonSchemaRecursive(entry, depth);
      changed ||= next !== entry;
      return next;
    });
    return changed ? normalized : schema;
  }
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const record = schema as Record<string, unknown>;
  let changed = false;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const next = normalizeStrictOpenAIJsonSchemaRecursive(
      value,
      key === 'properties' ? depth : depth + 1,
    );
    normalized[key] = next;
    changed ||= next !== value;
  }

  if (normalized['type'] === 'object') {
    const properties =
      normalized['properties'] &&
      typeof normalized['properties'] === 'object' &&
      !Array.isArray(normalized['properties'])
        ? (normalized['properties'] as Record<string, unknown>)
        : undefined;
    if (
      properties &&
      Object.keys(properties).length === 0 &&
      !Array.isArray(normalized['required'])
    ) {
      normalized['required'] = [];
      changed = true;
    }
    if (depth === 0 && !('additionalProperties' in normalized)) {
      normalized['additionalProperties'] = false;
      changed = true;
    }
  }

  return changed ? normalized : schema;
}

export function normalizeOpenAIStrictToolParameters<T>(schema: T, strict: boolean): T {
  if (!strict) {
    return normalizeToolParameterSchema(schema ?? {}) as T;
  }
  return normalizeStrictOpenAIJsonSchema(schema) as T;
}

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function qualifiesForOpenAIStrictMode(schema: unknown): boolean {
  if (Array.isArray(schema)) {
    return schema.every(qualifiesForOpenAIStrictMode);
  }
  if (!isSchemaRecord(schema)) {
    return true;
  }
  const properties = isSchemaRecord(schema['properties']) ? schema['properties'] : undefined;
  const type = schema['type'];
  const isObject =
    type === 'object' ||
    (Array.isArray(type) && type.includes('object')) ||
    properties !== undefined;
  if (isObject) {
    if (schema['additionalProperties'] !== false) return false;
    const required = Array.isArray(schema['required']) ? schema['required'] : [];
    if (properties && !Object.keys(properties).every((key) => required.includes(key))) {
      return false;
    }
  }
  if (properties && !Object.values(properties).every(qualifiesForOpenAIStrictMode)) {
    return false;
  }
  for (const key of ['items', 'prefixItems', 'anyOf', 'allOf', 'oneOf']) {
    if (key in schema && !qualifiesForOpenAIStrictMode(schema[key])) return false;
  }
  for (const key of ['$defs', 'definitions']) {
    const definitions = schema[key];
    if (
      isSchemaRecord(definitions) &&
      !Object.values(definitions).every(qualifiesForOpenAIStrictMode)
    ) {
      return false;
    }
  }
  return true;
}

export function resolveOpenAIToolStrictness(
  tool: { strict?: boolean; inputSchema?: unknown },
  supportsStrictMode: boolean,
): boolean | undefined {
  if (!supportsStrictMode) return undefined;
  return (
    tool.strict === true &&
    qualifiesForOpenAIStrictMode(normalizeStrictOpenAIJsonSchema(tool.inputSchema))
  );
}
