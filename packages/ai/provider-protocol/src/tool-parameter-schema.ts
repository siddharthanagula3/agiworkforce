/**
 * Tool parameter schema normalization (provider-quirk-aware).
 *
 * Ensures tool parameter schemas are accepted by every provider's tool
 * validator:
 *   - **Gemini** rejects several JSON Schema keywords + top-level `type`
 *     alongside `anyOf`. Use `cleanSchemaForGemini` from `./lib/clean-for-gemini`.
 *   - **OpenAI** rejects function tool schemas unless top-level is
 *     `type: "object"` (TypeBox root unions compile to `{ anyOf: [...] }`
 *     without `type`). We auto-flatten union schemas into a single object
 *     schema with merged properties.
 *   - **Anthropic** expects full JSON Schema draft 2020-12 compliance — close
 *     to a passthrough for our shape.
 *   - **xAI** rejects validation-constraint keywords (minLength/maxLength
 *     etc.). Caller can request a strip via `unsupportedKeywords`.
 *
 * Pure function. Pass through from `ProviderAdapter.normalizeToolSchemas`.
 *
 * Ported and simplified from OpenClaw `src/agents/pi-tools-parameter-schema.ts`
 * (MIT, Peter Steinberger). The original sourced unsupported-keyword sets
 * from a per-model compat config; we accept them as a direct argument.
 *
 * See THIRD_PARTY_LICENSES.md at repo root for full attribution.
 */

import { cleanSchemaForGemini } from './lib/clean-for-gemini';

export interface ToolParameterSchemaOptions {
  /** Provider id — drives Gemini cleanup vs generic flattening. */
  modelProvider?: string;
  /** Set of JSON Schema keywords to strip (e.g. xAI's reject list). */
  unsupportedKeywords?: ReadonlySet<string>;
}

function extractEnumValues(schema: unknown): unknown[] | undefined {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  const record = schema as Record<string, unknown>;
  if (Array.isArray(record['enum'])) {
    return record['enum'];
  }
  if ('const' in record) {
    return [record['const']];
  }
  const variants = Array.isArray(record['anyOf'])
    ? (record['anyOf'] as unknown[])
    : Array.isArray(record['oneOf'])
      ? (record['oneOf'] as unknown[])
      : null;
  if (variants) {
    const values = variants.flatMap((variant) => {
      const extracted = extractEnumValues(variant);
      return extracted ?? [];
    });
    return values.length > 0 ? values : undefined;
  }
  return undefined;
}

function mergePropertySchemas(existing: unknown, incoming: unknown): unknown {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }

  const existingEnum = extractEnumValues(existing);
  const incomingEnum = extractEnumValues(incoming);
  if (existingEnum || incomingEnum) {
    const values = Array.from(new Set([...(existingEnum ?? []), ...(incomingEnum ?? [])]));
    const merged: Record<string, unknown> = {};
    for (const source of [existing, incoming]) {
      if (!source || typeof source !== 'object') {
        continue;
      }
      const record = source as Record<string, unknown>;
      for (const key of ['title', 'description', 'default']) {
        if (!(key in merged) && key in record) {
          merged[key] = record[key];
        }
      }
    }
    const types = new Set(values.map((value) => typeof value));
    if (types.size === 1) {
      merged['type'] = Array.from(types)[0];
    }
    merged['enum'] = values;
    return merged;
  }

  return existing;
}

type FlattenableVariantKey = 'anyOf' | 'oneOf';
type TopLevelConditionalKey = FlattenableVariantKey | 'allOf';

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasTopLevelArrayKeyword(
  schemaRecord: Record<string, unknown>,
  key: TopLevelConditionalKey,
): boolean {
  return Array.isArray(schemaRecord[key]);
}

function getFlattenableVariantKey(
  schemaRecord: Record<string, unknown>,
): FlattenableVariantKey | null {
  if (hasTopLevelArrayKeyword(schemaRecord, 'anyOf')) {
    return 'anyOf';
  }
  if (hasTopLevelArrayKeyword(schemaRecord, 'oneOf')) {
    return 'oneOf';
  }
  return null;
}

function getTopLevelConditionalKey(
  schemaRecord: Record<string, unknown>,
): TopLevelConditionalKey | null {
  return (
    getFlattenableVariantKey(schemaRecord) ??
    (hasTopLevelArrayKeyword(schemaRecord, 'allOf') ? 'allOf' : null)
  );
}

function hasTopLevelObjectSchema(
  schemaRecord: Record<string, unknown>,
  conditionalKey: TopLevelConditionalKey | null,
): boolean {
  return (
    schemaRecord['type'] === 'object' &&
    isSchemaRecord(schemaRecord['properties']) &&
    conditionalKey === null
  );
}

function isObjectLikeSchemaMissingType(
  schemaRecord: Record<string, unknown>,
  conditionalKey: TopLevelConditionalKey | null,
): boolean {
  return (
    !('type' in schemaRecord) &&
    (isSchemaRecord(schemaRecord['properties']) || Array.isArray(schemaRecord['required'])) &&
    conditionalKey === null
  );
}

function isTypedObjectSchemaMissingValidProperties(
  schemaRecord: Record<string, unknown>,
  conditionalKey: TopLevelConditionalKey | null,
): boolean {
  return (
    schemaRecord['type'] === 'object' &&
    !isSchemaRecord(schemaRecord['properties']) &&
    conditionalKey === null
  );
}

function isTrulyEmptySchema(schemaRecord: Record<string, unknown>): boolean {
  return Object.keys(schemaRecord).length === 0;
}

function stripUnsupportedKeywordsRecursive(
  schema: unknown,
  unsupported: ReadonlySet<string>,
): unknown {
  if (Array.isArray(schema)) {
    return schema.map((entry) => stripUnsupportedKeywordsRecursive(entry, unsupported));
  }
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  const record = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (unsupported.has(key)) continue;
    out[key] = stripUnsupportedKeywordsRecursive(value, unsupported);
  }
  return out;
}

export function normalizeToolParameterSchema(
  schema: unknown,
  options?: ToolParameterSchemaOptions,
): unknown {
  const schemaRecord = isSchemaRecord(schema) ? schema : undefined;
  if (!schemaRecord) {
    return schema;
  }

  const provider = options?.modelProvider?.toLowerCase() ?? '';
  const isGeminiProvider = provider.includes('google') || provider.includes('gemini');
  const isAnthropicProvider = provider.includes('anthropic');
  const unsupportedKeywords = options?.unsupportedKeywords;

  function applyProviderCleaning(s: unknown): unknown {
    if (isGeminiProvider && !isAnthropicProvider) {
      return cleanSchemaForGemini(s);
    }
    if (unsupportedKeywords && unsupportedKeywords.size > 0) {
      return stripUnsupportedKeywordsRecursive(s, unsupportedKeywords);
    }
    return s;
  }

  const conditionalKey = getTopLevelConditionalKey(schemaRecord);
  const flattenableVariantKey = getFlattenableVariantKey(schemaRecord);

  if (hasTopLevelObjectSchema(schemaRecord, conditionalKey)) {
    return applyProviderCleaning(schemaRecord);
  }

  if (isObjectLikeSchemaMissingType(schemaRecord, conditionalKey)) {
    return applyProviderCleaning({
      ...schemaRecord,
      type: 'object',
      properties: isSchemaRecord(schemaRecord['properties']) ? schemaRecord['properties'] : {},
    });
  }

  if (isTypedObjectSchemaMissingValidProperties(schemaRecord, conditionalKey)) {
    return applyProviderCleaning({ ...schemaRecord, properties: {} });
  }

  if (!flattenableVariantKey) {
    if (isTrulyEmptySchema(schemaRecord)) {
      return applyProviderCleaning({ type: 'object', properties: {} });
    }
    return applyProviderCleaning(schema);
  }

  const variants = schemaRecord[flattenableVariantKey] as unknown[];
  const mergedProperties: Record<string, unknown> = {};
  const requiredCounts = new Map<string, number>();
  let objectVariants = 0;

  for (const entry of variants) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const props = (entry as { properties?: unknown }).properties;
    if (!props || typeof props !== 'object') {
      continue;
    }
    objectVariants += 1;
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (!(key in mergedProperties)) {
        mergedProperties[key] = value;
        continue;
      }
      mergedProperties[key] = mergePropertySchemas(mergedProperties[key], value);
    }
    const required = Array.isArray((entry as { required?: unknown }).required)
      ? (entry as { required: unknown[] }).required
      : [];
    for (const key of required) {
      if (typeof key !== 'string') {
        continue;
      }
      requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1);
    }
  }

  const baseRequired = Array.isArray(schemaRecord['required'])
    ? schemaRecord['required'].filter((key): key is string => typeof key === 'string')
    : undefined;
  const mergedRequired =
    baseRequired && baseRequired.length > 0
      ? baseRequired
      : objectVariants > 0
        ? Array.from(requiredCounts.entries())
            .filter(([, count]) => count === objectVariants)
            .map(([key]) => key)
        : undefined;

  const flattenedSchema: Record<string, unknown> = {
    type: 'object',
    ...(typeof schemaRecord['title'] === 'string' ? { title: schemaRecord['title'] } : {}),
    ...(typeof schemaRecord['description'] === 'string'
      ? { description: schemaRecord['description'] }
      : {}),
    properties:
      Object.keys(mergedProperties).length > 0
        ? mergedProperties
        : (schemaRecord['properties'] ?? {}),
    ...(mergedRequired && mergedRequired.length > 0 ? { required: mergedRequired } : {}),
    additionalProperties:
      'additionalProperties' in schemaRecord ? schemaRecord['additionalProperties'] : true,
  };

  return applyProviderCleaning(flattenedSchema);
}
