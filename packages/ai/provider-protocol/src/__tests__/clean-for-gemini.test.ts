import { describe, expect, it } from 'vitest';

import { cleanSchemaForGemini } from '../lib/clean-for-gemini';

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
