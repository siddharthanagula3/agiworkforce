import 'server-only';

import { z } from 'zod';
import { resolvePromptText } from '@/lib/prompts/prompt-registry';
import {
  isValidIanaTimeZone,
  PLACES_SEARCH_DEFAULT_LIMIT,
  PLACES_SEARCH_MAX_LIMIT,
  PLACES_SEARCH_MIN_LIMIT,
  PLACES_SEARCH_NEAR_MAX_LENGTH,
  PLACES_SEARCH_QUERY_MAX_LENGTH,
  PLACES_SEARCH_TOOL_NAME,
  type PlaceRecord,
  type PlacesSearchPayload,
} from '@agiworkforce/types';

import { createGooglePlacesProvider } from '@/lib/places/google-places-provider';
import {
  reservePlacesSearchCharge,
  settlePlacesSearchCall,
  type PlacesSearchBilling,
} from '@/lib/places/places-cost';
import type {
  PlacesErrorCode,
  PlacesProvider,
  PlacesSearchOutcome,
} from '@/lib/places/places-provider';
import { placesApiKey } from '@/lib/places/places-config';
import { INCLUDED_SEARCH_ADMISSION, type SearchAdmission } from '@/lib/web-search/search-budget';

export { PLACES_SEARCH_TOOL_NAME };

export function isPlacesSearchTool(name: string): boolean {
  return name === PLACES_SEARCH_TOOL_NAME;
}

export function placesBackendConfigured(): boolean {
  return placesApiKey() !== undefined;
}

const PlacesSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(PLACES_SEARCH_QUERY_MAX_LENGTH),
  near: z.string().trim().min(1).max(PLACES_SEARCH_NEAR_MAX_LENGTH).optional(),
  open_now: z.boolean().optional(),
  limit: z.number().int().min(PLACES_SEARCH_MIN_LIMIT).max(PLACES_SEARCH_MAX_LIMIT).optional(),
});

export const PLACES_SEARCH_TOOL_PROMPT_ID = 'tool.places_search_description';

export function placesSearchToolDef(): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function',
    function: {
      name: PLACES_SEARCH_TOOL_NAME,
      description: resolvePromptText(PLACES_SEARCH_TOOL_PROMPT_ID),
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            maxLength: PLACES_SEARCH_QUERY_MAX_LENGTH,
            description:
              'What to look for, in plain words, such as specialty coffee or late night pharmacy.',
          },
          near: {
            type: 'string',
            maxLength: PLACES_SEARCH_NEAR_MAX_LENGTH,
            description:
              'The neighbourhood, address or landmark to search around, when the user named one.',
          },
          open_now: {
            type: 'boolean',
            description: 'Set true to return only places open at the time of the search.',
          },
          limit: {
            type: 'integer',
            minimum: PLACES_SEARCH_MIN_LIMIT,
            maximum: PLACES_SEARCH_MAX_LIMIT,
            description: `How many places to return. Defaults to ${PLACES_SEARCH_DEFAULT_LIMIT}.`,
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  };
}

export type PlacesToolOutcome =
  | { ok: true; payload: PlacesSearchPayload }
  | { ok: false; errorCode: PlacesErrorCode | 'unaffordable'; message: string };

export interface PlacesSearchExecutionContext {
  toolCallId: string;
  timeZone?: string | undefined;
  signal?: AbortSignal | undefined;
  now?: () => Date;
  provider?: PlacesProvider;
  billing?: PlacesSearchBilling;
}

const UNAVAILABLE_MESSAGE =
  'Places search is unavailable: this server has no places provider configured. Tell the ' +
  'user plainly that live place data is not available here, and do not substitute remembered ' +
  'places, ratings or opening hours.';

const UNAFFORDABLE_MESSAGE =
  'Places search is unavailable on this account right now: this search is charged and the ' +
  'account has no credits left for it. Do not substitute remembered places, ratings or ' +
  'opening hours, and tell the user their credit balance is what stopped the search.';

function formatLocalTime(now: Date, timeZone: string | undefined): string | undefined {
  if (!timeZone || !isValidIanaTimeZone(timeZone)) return undefined;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

export async function executePlacesSearch(
  args: Record<string, unknown>,
  context: PlacesSearchExecutionContext,
): Promise<PlacesToolOutcome> {
  const parsed = PlacesSearchInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'invalid_tool_input',
      message: `${PLACES_SEARCH_TOOL_NAME} requires a non-empty "query" string, with optional "near", "open_now" and "limit".`,
    };
  }

  const provider = context.provider ?? createGooglePlacesProvider();
  if (!provider.configured()) {
    return { ok: false, errorCode: 'not_configured', message: UNAVAILABLE_MESSAGE };
  }

  const billing = context.billing;
  let admission: SearchAdmission = INCLUDED_SEARCH_ADMISSION;
  if (billing) {
    const reserved = await reservePlacesSearchCharge(billing, {
      providerId: provider.id,
      toolCallId: context.toolCallId,
    });
    if (reserved.outcome === 'refused') {
      return { ok: false, errorCode: 'unaffordable', message: UNAFFORDABLE_MESSAGE };
    }
    admission = reserved.admission;
  }

  const settle = (searched: PlacesSearchOutcome | null): Promise<void> =>
    billing
      ? settlePlacesSearchCall(billing, {
          admission,
          providerId: searched?.providerId ?? provider.id,
          toolCallId: context.toolCallId,
          billableCalls: searched?.billableCalls ?? 0,
          answered: searched?.ok === true,
        })
      : Promise.resolve();

  const openNowRequested = parsed.data.open_now === true;
  let outcome: PlacesSearchOutcome;
  try {
    outcome = await provider.search({
      query: parsed.data.query,
      ...(parsed.data.near ? { near: parsed.data.near } : {}),
      ...(openNowRequested ? { openNow: true } : {}),
      limit: parsed.data.limit ?? PLACES_SEARCH_DEFAULT_LIMIT,
      ...(context.signal ? { signal: context.signal } : {}),
    });
  } catch (error) {
    await settle(null);
    throw error;
  }
  await settle(outcome);

  if (!outcome.ok) {
    return { ok: false, errorCode: outcome.errorCode, message: outcome.error };
  }

  const now = (context.now ?? (() => new Date()))();
  const localTime = formatLocalTime(now, context.timeZone);

  return {
    ok: true,
    payload: {
      query: parsed.data.query,
      ...(parsed.data.near ? { near: parsed.data.near } : {}),
      openNowRequested,
      ...(localTime ? { localTime } : {}),
      ...(context.timeZone ? { timeZone: context.timeZone } : {}),
      providerId: outcome.providerId,
      attribution: outcome.attribution,
      ...(outcome.termsUrl ? { termsUrl: outcome.termsUrl } : {}),
      places: outcome.places,
    },
  };
}

function formatPlaceLine(place: PlaceRecord, index: number): string {
  const facts: string[] = [];
  if (place.rating !== undefined) {
    facts.push(
      place.reviewCount !== undefined
        ? `${place.rating} from ${place.reviewCount} reviews`
        : `${place.rating}`,
    );
  }
  if (place.category) facts.push(place.category);
  if (place.priceLevel) facts.push(place.priceLevel.replace(/_/g, ' '));
  if (place.openNow !== undefined) facts.push(place.openNow ? 'open now' : 'closed now');

  const detail: string[] = [];
  if (place.address) detail.push(place.address);
  if (place.hours?.length) detail.push(`Hours: ${place.hours.join('; ')}`);
  if (place.phone) detail.push(place.phone);
  if (place.website) detail.push(place.website);
  if (place.mapsUrl) detail.push(place.mapsUrl);

  return [
    `${index + 1}. ${place.name}${facts.length > 0 ? ` (${facts.join(', ')})` : ''}`,
    ...detail.map((line) => `   ${line}`),
  ].join('\n');
}

export function formatPlacesResultForModel(outcome: PlacesToolOutcome): string {
  if (!outcome.ok) return outcome.message;

  const { payload } = outcome;
  const scope = payload.near ? `${payload.query} near ${payload.near}` : payload.query;
  const header = [
    `Places for "${scope}"${payload.openNowRequested ? ', limited to places open at the time of the search' : ''}.`,
    payload.localTime
      ? `The search ran at ${payload.localTime}, the user's local time. Use that time in the answer instead of guessing the time of day.`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  if (payload.places.length === 0) {
    return `${header}\n\nNo places matched. Say so plainly rather than naming places from memory.`;
  }

  return [
    header,
    '',
    payload.places.map(formatPlaceLine).join('\n'),
    '',
    `Attribution to show with these results: ${payload.attribution}.`,
  ].join('\n');
}
