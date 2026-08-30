import { describe, expect, it } from 'vitest';

import { cleanSchemaForGemini, GEMINI_SUPPORTED_SCHEMA_KEYWORDS } from '../lib/clean-for-gemini';

function buildForkingRefChain(length: number): Record<string, unknown> {
  const $defs: Record<string, unknown> = {};
  for (let i = 0; i < length; i += 1) {
    $defs[`node${i}`] =
      i === length - 1
        ? { type: 'string' }
        : {
            type: 'object',
            properties: {
              left: { $ref: `#/$defs/node${i + 1}` },
              right: { $ref: `#/$defs/node${i + 1}` },
            },
            required: ['left', 'right'],
          };
  }
  return { $defs, $ref: '#/$defs/node0' };
}

function buildInlineNesting(depth: number): Record<string, unknown> {
  let schema: Record<string, unknown> = { type: 'string' };
  for (let i = 0; i < depth; i += 1) {
    schema = { type: 'object', properties: { child: schema } };
  }
  return schema;
}

describe('cleanSchemaForGemini — expansion bounds', () => {
  it('survives a 35-link $ref chain that forks twice per link', () => {
    const started = Date.now();
    const cleaned = cleanSchemaForGemini(buildForkingRefChain(35));
    const elapsedMs = Date.now() - started;

    expect(elapsedMs).toBeLessThan(2000);
    expect(JSON.stringify(cleaned).length).toBeLessThan(500_000);
  }, 15_000);

  it('bounds a 4000-link chain that forks four times per link', () => {
    const $defs: Record<string, unknown> = {};
    const links = 4000;
    for (let i = 0; i < links; i += 1) {
      $defs[`node${i}`] =
        i === links - 1
          ? { type: 'string' }
          : {
              type: 'object',
              properties: {
                a: { $ref: `#/$defs/node${i + 1}` },
                b: { $ref: `#/$defs/node${i + 1}` },
                c: { $ref: `#/$defs/node${i + 1}` },
                d: { $ref: `#/$defs/node${i + 1}` },
              },
            };
    }

    const started = Date.now();
    const cleaned = cleanSchemaForGemini({ $defs, $ref: '#/$defs/node0' });
    const elapsedMs = Date.now() - started;

    expect(elapsedMs).toBeLessThan(2000);
    expect(JSON.stringify(cleaned).length).toBeLessThan(500_000);
  }, 15_000);

  it('truncates inline nesting past the depth cap instead of recursing forever', () => {
    const cleaned = cleanSchemaForGemini(buildInlineNesting(400)) as Record<string, unknown>;

    let cursor: Record<string, unknown> | undefined = cleaned;
    let observedDepth = 0;
    while (cursor && typeof cursor === 'object') {
      const properties = cursor['properties'] as Record<string, unknown> | undefined;
      if (!properties || !properties['child']) {
        break;
      }
      cursor = properties['child'] as Record<string, unknown>;
      observedDepth += 1;
    }

    expect(observedDepth).toBeLessThan(400);
    expect(observedDepth).toBeGreaterThan(0);
  }, 15_000);
});

describe('cleanSchemaForGemini — memoized $ref resolution stays correct', () => {
  it('produces identical cleaned output for every site referencing one definition', () => {
    const cleaned = cleanSchemaForGemini({
      type: 'object',
      properties: {
        origin: { $ref: '#/$defs/place' },
        destination: { $ref: '#/$defs/place' },
      },
      $defs: {
        place: {
          type: 'object',
          properties: { city: { type: 'string', minLength: 2 } },
          required: ['city'],
        },
      },
    }) as Record<string, unknown>;

    const properties = cleaned['properties'] as Record<string, unknown>;
    const expected = {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    };
    expect(properties['origin']).toEqual(expected);
    expect(properties['destination']).toEqual(expected);
  });

  it('keeps per-site description overrides off the shared resolution', () => {
    const cleaned = cleanSchemaForGemini({
      type: 'object',
      properties: {
        origin: { $ref: '#/$defs/place', description: 'where the trip starts' },
        destination: { $ref: '#/$defs/place', description: 'where the trip ends' },
        unlabelled: { $ref: '#/$defs/place' },
      },
      $defs: {
        place: { type: 'object', properties: { city: { type: 'string' } } },
      },
    }) as Record<string, unknown>;

    const properties = cleaned['properties'] as Record<string, unknown>;
    expect((properties['origin'] as Record<string, unknown>)['description']).toBe(
      'where the trip starts',
    );
    expect((properties['destination'] as Record<string, unknown>)['description']).toBe(
      'where the trip ends',
    );
    expect(properties['unlabelled']).not.toHaveProperty('description');
  });

  it('still collapses a self-recursive definition to an empty schema', () => {
    const cleaned = cleanSchemaForGemini({
      $ref: '#/$defs/tree',
      $defs: {
        tree: {
          type: 'object',
          properties: { children: { type: 'array', items: { $ref: '#/$defs/tree' } } },
        },
      },
    }) as Record<string, unknown>;

    const properties = cleaned['properties'] as Record<string, unknown>;
    const children = properties['children'] as Record<string, unknown>;
    expect(children['items']).toEqual({});
  });
});

describe('cleanSchemaForGemini — only Gemini-known keywords survive', () => {
  /**
   * Google rejects the WHOLE request on an unknown field, naming the path:
   *   Unknown name "propertyNames" at
   *   tools[0].function_declarations[4].parameters.properties[2].value
   * Both of these reached production and took every tool-enabled Gemini turn
   * down with them, because the cleaner was a denylist and neither was on it.
   */
  it('drops the keywords that produced the live 400', () => {
    const cleaned = cleanSchemaForGemini({
      type: 'object',
      properties: {
        tags: {
          type: 'object',
          propertyNames: { pattern: '^[a-z]+$' },
          additionalProperties: { type: 'string' },
        },
        count: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 10 },
      },
      required: ['tags'],
    }) as Record<string, unknown>;

    const serialized = JSON.stringify(cleaned);
    expect(serialized).not.toContain('propertyNames');
    expect(serialized).not.toContain('exclusiveMinimum');
    expect(serialized).not.toContain('exclusiveMaximum');
    expect(cleaned['type']).toBe('object');
    expect(cleaned['required']).toEqual(['tags']);
  });

  it('drops every other JSON Schema keyword Gemini has no name for', () => {
    const cleaned = cleanSchemaForGemini({
      type: 'object',
      properties: {
        value: {
          type: 'array',
          prefixItems: [{ type: 'string' }],
          contains: { type: 'string' },
          unevaluatedItems: false,
          readOnly: true,
          writeOnly: false,
          deprecated: true,
          $comment: 'internal',
          contentEncoding: 'base64',
          dependentRequired: { a: ['b'] },
          if: { type: 'string' },
          then: { type: 'string' },
          else: { type: 'number' },
        },
      },
    }) as Record<string, unknown>;

    const value = (cleaned['properties'] as Record<string, Record<string, unknown>>)['value']!;
    expect(Object.keys(value).sort()).toEqual(['type']);
  });

  it('keeps the fields a tool call actually needs', () => {
    const cleaned = cleanSchemaForGemini({
      type: 'object',
      title: 'Search',
      description: 'Search the corpus',
      properties: {
        query: { type: 'string', description: 'What to look for' },
        mode: { type: 'string', enum: ['fast', 'deep'], default: 'fast' },
        limit: { type: 'integer' },
        filters: { type: 'array', items: { type: 'string' } },
      },
      required: ['query'],
    }) as Record<string, unknown>;

    expect(cleaned['description']).toBe('Search the corpus');
    expect(cleaned['required']).toEqual(['query']);
    const props = cleaned['properties'] as Record<string, Record<string, unknown>>;
    expect(props['mode']?.['enum']).toEqual(['fast', 'deep']);
    expect(props['mode']?.['default']).toBe('fast');
    expect(props['filters']?.['items']).toEqual({ type: 'string' });
    expect(props['query']?.['description']).toBe('What to look for');
  });

  it('turns const into a single-value enum rather than dropping it', () => {
    const cleaned = cleanSchemaForGemini({
      type: 'object',
      properties: { kind: { const: 'search' } },
    }) as Record<string, unknown>;
    const props = cleaned['properties'] as Record<string, Record<string, unknown>>;
    expect(props['kind']?.['enum']).toEqual(['search']);
  });

  it('emits nothing outside the allowlist, at any depth', () => {
    const cleaned = cleanSchemaForGemini({
      type: 'object',
      properties: {
        outer: {
          type: 'object',
          properties: { inner: { type: 'string', pattern: '^x$', exclusiveMinimum: 1 } },
        },
      },
    });

    // `properties` maps caller-chosen names to schemas, so its KEYS are data,
    // not keywords — only its values are walked as schemas.
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        expect(GEMINI_SUPPORTED_SCHEMA_KEYWORDS.has(key), `leaked keyword: ${key}`).toBe(true);
        if (key === 'properties' && value && typeof value === 'object') {
          Object.values(value as Record<string, unknown>).forEach(walk);
          continue;
        }
        if (key === 'enum' || key === 'default') continue;
        walk(value);
      }
    };
    walk(cleaned);
  });
});
