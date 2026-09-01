import { describe, expect, it } from 'vitest';

import {
  ROUTE_LANE_HEADER as SERVER_ROUTE_LANE_HEADER,
  ROUTE_LANES,
} from '@/lib/services/free-lane/plan';

import { CHAT_ROUTE_LANES, ROUTE_LANE_HEADER, isFreeRouteLane, readRouteLane } from './routeLane';

describe('route lane wire vocabulary', () => {
  it('names the same header the response builders set', () => {
    expect(ROUTE_LANE_HEADER).toBe(SERVER_ROUTE_LANE_HEADER);
  });

  it('carries every lane the server can emit, and no others', () => {
    expect(CHAT_ROUTE_LANES).toEqual(ROUTE_LANES);
  });
});

describe('readRouteLane', () => {
  it('reads a lane the server emitted', () => {
    expect(readRouteLane(ROUTE_LANES.free)).toBe('free');
    expect(readRouteLane(ROUTE_LANES.managed)).toBe('managed');
  });

  it('tolerates the whitespace a proxy may add', () => {
    expect(readRouteLane('  free ')).toBe('free');
  });

  it('says nothing when the header is absent, empty or unrecognised', () => {
    expect(readRouteLane(null)).toBeUndefined();
    expect(readRouteLane(undefined)).toBeUndefined();
    expect(readRouteLane('')).toBeUndefined();
    expect(readRouteLane('subsidised')).toBeUndefined();
  });
});

describe('isFreeRouteLane', () => {
  it('is true only for the free lane', () => {
    expect(isFreeRouteLane(ROUTE_LANES.free)).toBe(true);
    expect(isFreeRouteLane(ROUTE_LANES.managed)).toBe(false);
    expect(isFreeRouteLane(undefined)).toBe(false);
  });
});
