import { describe, expect, it } from 'vitest';

import { createMapSearchToolDefinition, executeMapSearchTool } from './map-search-tool-service';

describe('map search tool service', () => {
  it('builds a validated identity-neutral card with server-owned provider URLs', () => {
    const outcome = executeMapSearchTool(
      { query: 'coffee shops near Austin, Texas', title: 'Coffee near Austin' },
      { toolCallId: 'fixture-map-call', now: () => new Date('2026-08-11T12:00:00.000Z') },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.card.recognized || outcome.card.kind !== 'map-search.v1') return;
    expect(outcome.card.cardId).toBe('fixture-map-call');
    expect(outcome.card.body.query).toBe('coffee shops near Austin, Texas');
    expect(outcome.card.body.actions).toHaveLength(2);
    expect(outcome.card.body.actions[0]?.url).toContain('api=1');
    expect(outcome.card.body.actions.every((action) => action.url.startsWith('https://'))).toBe(
      true,
    );
    expect(JSON.stringify(outcome.card)).not.toMatch(/\b(lat|lng|placeId|route)\b/);
  });

  it('rejects unbounded or shape-smuggled input', () => {
    expect(
      executeMapSearchTool({ query: '', url: 'javascript:alert(1)' }, { toolCallId: 'fixture' }),
    ).toEqual({
      ok: false,
      content: 'Map search failed: provide one bounded, self-contained search query.',
    });
  });

  it('offers a map-search definition without identity or route fields', () => {
    const definition = createMapSearchToolDefinition();
    const properties = definition.function.parameters.properties;
    expect(definition.function.name).toBe('search_maps');
    expect(Object.keys(properties)).toEqual(['query', 'title']);
  });
});
