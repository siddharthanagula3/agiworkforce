import { describe, expect, it, vi } from 'vitest';

import { createMapSearchToolDefinition, executeMapSearchTool } from './map-search-tool-service';

const NOW = () => new Date('2026-08-11T12:00:00.000Z');

/** Stand-in for the Nominatim call; production resolves through the real one. */
const resolveView = vi.fn(async () => ({
  view: {
    latitude: 30.2672,
    longitude: -97.7431,
    zoom: 11,
    attribution: '© OpenStreetMap contributors',
  },
  places: [
    {
      label: 'Austin, Travis County, Texas, United States',
      latitude: 30.2672,
      longitude: -97.7431,
    },
  ],
}));

describe('map search tool service', () => {
  it('builds a validated card with server-owned provider URLs and a server-resolved view', async () => {
    const outcome = await executeMapSearchTool(
      { query: 'coffee shops near Austin, Texas', title: 'Coffee near Austin' },
      { toolCallId: 'fixture-map-call', now: NOW, resolveView },
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
    // The viewport exists and carries attribution, so the card can paint tiles.
    expect(outcome.card.body.view?.zoom).toBe(11);
    expect(outcome.card.body.view?.attribution).toContain('OpenStreetMap');
    // Identity comes from the GEOCODER, never from the model's phrasing.
    expect(outcome.card.body.places?.[0]?.label).toContain('Travis County');
  });

  it('still ships a link-only card when the query cannot be geocoded', async () => {
    const outcome = await executeMapSearchTool(
      { query: 'somewhere that does not resolve' },
      { toolCallId: 'fixture-unresolved', now: NOW, resolveView: async () => null },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.card.recognized || outcome.card.kind !== 'map-search.v1') return;
    // No fabricated centre: absent view is how the renderer knows to degrade.
    expect(outcome.card.body.view).toBeUndefined();
    expect(outcome.card.body.places).toBeUndefined();
    expect(outcome.card.body.actions).toHaveLength(2);
  });

  it('rejects unbounded or shape-smuggled input', async () => {
    await expect(
      executeMapSearchTool(
        { query: '', url: 'javascript:alert(1)' },
        { toolCallId: 'fixture', resolveView },
      ),
    ).resolves.toEqual({
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
