import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toolStatusPhrase } from '@agiworkforce/provider-protocol';
import { PLACES_SEARCH_TOOL_NAME, type PlaceRecord } from '@agiworkforce/types';

import type { PlacesProvider, PlacesSearchQuery } from './places-provider';
import {
  executePlacesSearch,
  formatPlacesResultForModel,
  isPlacesSearchTool,
  placesSearchToolDef,
} from './places-tool';

const RECORDED_PLACE: PlaceRecord = {
  placeId: 'ChIJ_recorded_saint_frank',
  name: 'Saint Frank Coffee',
  address: '2340 Polk St, San Francisco, CA 94109, USA',
  rating: 4.5,
  reviewCount: 1180,
  category: 'Coffee shop',
  priceLevel: 'moderate',
  openNow: true,
  hours: ['Monday: 7:00 AM - 6:00 PM'],
  phone: '(415) 926-5019',
  website: 'https://www.saintfrankcoffee.com/',
  mapsUrl: 'https://maps.google.com/?cid=1',
};

function stubProvider(
  overrides: Partial<PlacesProvider> = {},
  captured: PlacesSearchQuery[] = [],
): PlacesProvider {
  return {
    id: 'stub_places',
    attribution: 'Powered by the stub',
    configured: () => true,
    search: async (request) => {
      captured.push(request);
      return {
        ok: true,
        providerId: 'stub_places',
        attribution: 'Powered by the stub',
        places: [RECORDED_PLACE],
        billableCalls: 1,
      };
    },
    ...overrides,
  };
}

const FIXED_NOW = new Date('2026-09-05T04:30:00.000Z');

describe('placesSearchToolDef', () => {
  it('publishes the brief schema under a provider-safe function name', () => {
    const def = placesSearchToolDef();
    expect(def.function.name).toBe(PLACES_SEARCH_TOOL_NAME);
    expect(/^[a-zA-Z0-9_-]{1,64}$/.test(def.function.name)).toBe(true);
    expect(Object.keys(def.function.parameters['properties'] as object)).toEqual([
      'query',
      'near',
      'open_now',
      'limit',
    ]);
    expect(def.function.parameters['required']).toEqual(['query']);
  });

  it('is recognised by the tool-name predicate', () => {
    expect(isPlacesSearchTool(PLACES_SEARCH_TOOL_NAME)).toBe(true);
    expect(isPlacesSearchTool('search_maps')).toBe(false);
  });

  it('carries the activity label the leaders show while it runs', () => {
    expect(toolStatusPhrase(PLACES_SEARCH_TOOL_NAME)).toBe('Searching for places');
  });
});

describe('executePlacesSearch', () => {
  let recordCost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    recordCost = vi.fn().mockResolvedValue(undefined);
  });

  it('rejects an unusable argument without buying anything', async () => {
    const provider = stubProvider();
    const outcome = await executePlacesSearch(
      { query: '   ' },
      { toolCallId: 'call-1', provider, recordCost },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errorCode).toBe('invalid_tool_input');
    expect(recordCost).not.toHaveBeenCalled();
  });

  it('reports places search as unavailable when no provider key is configured', async () => {
    const provider = stubProvider({ configured: () => false });
    const outcome = await executePlacesSearch(
      { query: 'coffee' },
      { toolCallId: 'call-2', provider, recordCost, userId: 'user_1' },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errorCode).toBe('not_configured');
    expect(outcome.message).toContain('Places search is unavailable');
    expect(recordCost).not.toHaveBeenCalled();
    expect(formatPlacesResultForModel(outcome)).toBe(outcome.message);
  });

  it('passes the arguments through and stamps the user local time on the result', async () => {
    const captured: PlacesSearchQuery[] = [];
    const provider = stubProvider({}, captured);

    const outcome = await executePlacesSearch(
      { query: 'best coffee', near: 'Union Square San Francisco', open_now: true, limit: 3 },
      {
        toolCallId: 'call-3',
        provider,
        recordCost,
        userId: 'user_1',
        timeZone: 'America/Los_Angeles',
        now: () => FIXED_NOW,
      },
    );

    expect(captured[0]).toMatchObject({
      query: 'best coffee',
      near: 'Union Square San Francisco',
      openNow: true,
      limit: 3,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.payload.openNowRequested).toBe(true);
    expect(outcome.payload.timeZone).toBe('America/Los_Angeles');
    expect(outcome.payload.localTime).toContain('21:30');
    expect(outcome.payload.places).toHaveLength(1);
  });

  it('defaults the limit and ignores an unusable time zone', async () => {
    const captured: PlacesSearchQuery[] = [];
    const provider = stubProvider({}, captured);

    const outcome = await executePlacesSearch(
      { query: 'ramen' },
      {
        toolCallId: 'call-4',
        provider,
        recordCost,
        timeZone: 'Mars/Olympus',
        now: () => FIXED_NOW,
      },
    );

    expect(captured[0]?.limit).toBe(5);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.payload.localTime).toBeUndefined();
  });

  it('records one tool cost event per billable upstream call', async () => {
    const provider = stubProvider();
    await executePlacesSearch(
      { query: 'coffee' },
      {
        toolCallId: 'call-5',
        provider,
        recordCost,
        userId: 'user_1',
        organizationId: 'org_1',
      },
    );

    expect(recordCost).toHaveBeenCalledWith({
      userId: 'user_1',
      organizationId: 'org_1',
      providerId: 'stub_places',
      toolCallId: 'call-5',
      calls: 1,
      delivered: true,
    });
  });

  it('records an undelivered cost event when the provider call failed after being billed', async () => {
    const provider = stubProvider({
      search: async () => ({
        ok: false,
        providerId: 'stub_places',
        errorCode: 'upstream_error',
        error: 'The places provider returned HTTP 500.',
        billableCalls: 1,
      }),
    });

    const outcome = await executePlacesSearch(
      { query: 'coffee' },
      { toolCallId: 'call-6', provider, recordCost, userId: 'user_1' },
    );

    expect(outcome.ok).toBe(false);
    expect(recordCost).toHaveBeenCalledWith(
      expect.objectContaining({ calls: 1, delivered: false, toolCallId: 'call-6' }),
    );
  });

  it('does not attempt to bill an anonymous caller', async () => {
    const provider = stubProvider();
    await executePlacesSearch({ query: 'coffee' }, { toolCallId: 'call-7', provider, recordCost });
    expect(recordCost).not.toHaveBeenCalled();
  });
});

describe('formatPlacesResultForModel', () => {
  it('renders every fact the answer needs and names the local time', async () => {
    const provider = stubProvider();
    const outcome = await executePlacesSearch(
      { query: 'best coffee', near: 'Union Square', open_now: true },
      {
        toolCallId: 'call-8',
        provider,
        userId: 'user_1',
        recordCost: vi.fn(),
        timeZone: 'America/Los_Angeles',
        now: () => FIXED_NOW,
      },
    );

    const rendered = formatPlacesResultForModel(outcome);
    expect(rendered).toContain('best coffee near Union Square');
    expect(rendered).toContain('1. Saint Frank Coffee');
    expect(rendered).toContain('4.5 from 1180 reviews');
    expect(rendered).toContain('open now');
    expect(rendered).toContain('2340 Polk St');
    expect(rendered).toContain('Hours: Monday: 7:00 AM - 6:00 PM');
    expect(rendered).toContain('https://www.saintfrankcoffee.com/');
    expect(rendered).toContain("the user's local time");
    expect(rendered).toContain('Powered by the stub');
  });

  it('says plainly that nothing matched instead of inviting a remembered answer', async () => {
    const provider = stubProvider({
      search: async () => ({
        ok: true,
        providerId: 'stub_places',
        attribution: 'Powered by the stub',
        places: [],
        billableCalls: 1,
      }),
    });

    const outcome = await executePlacesSearch(
      { query: 'coffee' },
      { toolCallId: 'call-9', provider, recordCost: vi.fn() },
    );

    expect(formatPlacesResultForModel(outcome)).toContain('No places matched');
  });
});
