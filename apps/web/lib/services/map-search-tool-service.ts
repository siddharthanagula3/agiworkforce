import 'server-only';

import { z } from 'zod';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import {
  INTERACTIVE_CARD_SCHEMA_VERSION,
  MAP_SEARCH_QUERY_MAX_LENGTH,
  type InteractiveCard,
} from '@agiworkforce/types';
import { resolveMapView } from '@/lib/services/map-geocoding-service';

export const MAP_SEARCH_TOOL_NAME = 'search_maps';

const MapSearchToolInputSchema = z
  .object({
    query: z.string().trim().min(1).max(MAP_SEARCH_QUERY_MAX_LENGTH),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export function isMapSearchTool(name: string): boolean {
  return name === MAP_SEARCH_TOOL_NAME;
}

const MAP_SEARCH_GEO_CONTEXT_RE =
  /\b(?:on|using|via)\s+(?:a\s+|the\s+|google\s+|open\s*street\s*)?maps?\b|\bmaps?\s+of\b|\b(?:draw|show)\s+(?:me\s+)?(?:a\s+|the\s+)?maps?\b/i;
const MAP_SEARCH_LOCATION_PHRASE_RE =
  /\bnearby\b|\bnear me\b|\bwhere is\b|\bwhere are\b|\broutes?\b|\bdirections\b|\bdrive from\b|\bdriving from\b|\broad ?trip\b|\bitinerary\b|\bhow far\b/i;
const MAP_SEARCH_NEAR_PROPER_NOUN_RE = /\bnear\s+[A-Z]/;

export function hasMapSearchIntent(userMessage: string): boolean {
  return (
    MAP_SEARCH_GEO_CONTEXT_RE.test(userMessage) ||
    MAP_SEARCH_LOCATION_PHRASE_RE.test(userMessage) ||
    MAP_SEARCH_NEAR_PROPER_NOUN_RE.test(userMessage)
  );
}

export function createMapSearchToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: MAP_SEARCH_TOOL_NAME,
      description:
        'Render a real, visible map card in the chat. ALWAYS call this instead of writing a ' +
        'Google Maps or OpenStreetMap link in your answer whenever the user asks to see, show, ' +
        'find, or explore a real-world place, address, or route on a map. A pasted link is not ' +
        'a map and does not satisfy that request. For a route, pass both endpoints in the ' +
        'query as "<origin> to <destination>". This is a search, not a verified place identity ' +
        'or turn-by-turn navigation; do not claim that a specific place was resolved. Never call ' +
        'this for a non-geographic use of the word map, such as a hash map, memory map, tree ' +
        'map, or site map; those are data structures or diagrams, not places, and get a normal ' +
        'text answer instead.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            maxLength: MAP_SEARCH_QUERY_MAX_LENGTH,
            description:
              'A self-contained map search, including locality when known, such as coffee shops near Austin, Texas.',
          },
          title: {
            type: 'string',
            maxLength: 200,
            description: 'A concise user-facing title for the map card.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  };
}

function providerSearchUrl(provider: 'google_maps' | 'openstreetmap', query: string): string {
  const url =
    provider === 'google_maps'
      ? new URL('https://www.google.com/maps/search/')
      : new URL('https://www.openstreetmap.org/search');
  if (provider === 'google_maps') url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

export type MapSearchToolOutcome =
  | { ok: true; content: string; card: InteractiveCard }
  | { ok: false; content: string };

export const MAP_SEARCH_TILES_ACROSS = 2.5;
export const MAP_SEARCH_TILES_DOWN = 340 / 256;

export async function executeMapSearchTool(
  args: Record<string, unknown>,
  context: {
    toolCallId: string;
    now?: () => Date;
    resolveView?: typeof resolveMapView;
  },
): Promise<MapSearchToolOutcome> {
  const parsed = MapSearchToolInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      content: 'Map search failed: provide one bounded, self-contained search query.',
    };
  }

  const { query } = parsed.data;
  const title = parsed.data.title ?? `Map search: ${query}`;
  const actions = [
    {
      provider: 'google_maps' as const,
      label: 'Open in Google Maps',
      url: providerSearchUrl('google_maps', query),
    },
    {
      provider: 'openstreetmap' as const,
      label: 'Open in OpenStreetMap',
      url: providerSearchUrl('openstreetmap', query),
    },
  ];
  const resolved = await (context.resolveView ?? resolveMapView)(query, {
    tilesAcross: MAP_SEARCH_TILES_ACROSS,
    tilesDown: MAP_SEARCH_TILES_DOWN,
  });

  const rawCard = {
    schemaVersion: INTERACTIVE_CARD_SCHEMA_VERSION,
    cardId: context.toolCallId,
    kind: 'map-search.v1',
    createdAt: (context.now ?? (() => new Date()))().toISOString(),
    fallback: {
      headline: title,
      text: [
        `Map search: ${query}`,
        ...actions.map((action) => `${action.label}: ${action.url}`),
      ].join('\n'),
    },
    producedBy: { toolCallId: context.toolCallId, toolName: MAP_SEARCH_TOOL_NAME },
    body: {
      title,
      query,
      actions,
      ...(resolved ? { view: resolved.view, places: resolved.places } : {}),
    },
  };
  const card = parseInteractiveCardDelta({ card: rawCard });
  if (!card?.recognized || card.kind !== 'map-search.v1') {
    return { ok: false, content: 'Map search could not be rendered safely.' };
  }

  return {
    ok: true,
    content:
      `Rendered a map card for "${query}"${
        resolved
          ? ' with a live map the user can already see'
          : ' (link-only: the location could not be geocoded)'
      }. Do not repeat the links as markdown and do not describe them as a ` +
      'verified place or turn-by-turn route.',
    card,
  };
}
