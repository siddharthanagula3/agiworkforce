import 'server-only';

import { z } from 'zod';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import {
  INTERACTIVE_CARD_SCHEMA_VERSION,
  MAP_SEARCH_QUERY_MAX_LENGTH,
  type InteractiveCard,
} from '@agiworkforce/types';

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

export function createMapSearchToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: MAP_SEARCH_TOOL_NAME,
      description:
        'Open a real map search card for a location or nearby-category request. Use this when ' +
        'the user asks to find, show, or explore something on a map. This is a search, not a ' +
        'verified place identity or turn-by-turn route; do not claim that a specific place was resolved.',
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

export function executeMapSearchTool(
  args: Record<string, unknown>,
  context: { toolCallId: string; now?: () => Date },
): MapSearchToolOutcome {
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
    body: { title, query, actions },
  };
  const card = parseInteractiveCardDelta({ card: rawCard });
  if (!card?.recognized || card.kind !== 'map-search.v1') {
    return { ok: false, content: 'Map search could not be rendered safely.' };
  }

  return {
    ok: true,
    content:
      `Created a map search card for "${query}". ` +
      'The links open provider search results; do not describe them as a verified place or route.',
    card,
  };
}
