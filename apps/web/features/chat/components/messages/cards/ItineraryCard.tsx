'use client';

import { useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { isAllowedItineraryRouteUrl } from '@agiworkforce/cloud-contracts';
import { CircleAlert, MapPinned, Navigation } from '@agiworkforce/icons';
import { Spinner, translateUiPlural } from '@agiworkforce/ui';
import type {
  ItineraryCardBody,
  ItineraryRoute,
  ItineraryTravelMode,
  PlaceIdentity,
} from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { LeafletMapCanvas, type MapPoint } from './map/LeafletMapCanvas';
import { mapTileStyle, useMapTileConfig } from './map/mapTileConfig';

const ITINERARY_MAP_HEIGHT_PX = 280;
const ITINERARY_MAP_UNAVAILABLE_MESSAGE =
  'The map could not be loaded. The stops are listed below.';
const PLACE_NOT_FOUND = 'Not found on the map';
const PLACE_LOOKUP_FAILED = 'Could not be looked up';
const NEW_TAB_HINT = '(opens in a new tab)';

const TRAVEL_MODE_DIRECTIONS: Record<ItineraryTravelMode, string> = {
  walking: 'Walking directions in Google Maps',
  driving: 'Driving directions in Google Maps',
  transit: 'Transit directions in Google Maps',
  bicycling: 'Cycling directions in Google Maps',
};

type ResolvedPlace = Extract<PlaceIdentity, { status: 'resolved' }>;

function isResolved(place: PlaceIdentity | undefined): place is ResolvedPlace {
  return place?.status === 'resolved';
}

function unresolvedLabel(place: PlaceIdentity | undefined): string {
  return place?.status === 'unresolved' &&
    (place.reason === 'provider_error' || place.reason === 'rate_limited')
    ? PLACE_LOOKUP_FAILED
    : PLACE_NOT_FOUND;
}

function routeUnavailableMessage(route: ItineraryRoute): string | null {
  if (route.status === 'available' || route.reason === 'too_few_stops') return null;
  if (route.reason === 'unresolved_stops') {
    return translateUiPlural('chat', 'counts.unresolvedStops', route.unresolvedStopCount, {
      one: 'No route, because one place is missing from the map.',
      other: 'No route, because {{count}} places are missing from the map.',
    });
  }
  return 'No route is available for this plan.';
}

const pinBadgeClass =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums';

export interface ItineraryCardProps {
  body: ItineraryCardBody;
}

export function ItineraryCard({ body }: ItineraryCardProps) {
  const tileState = useMapTileConfig();
  const prefersReducedMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const [selectedPlace, setSelectedPlace] = useState<number | null>(null);
  const dark = resolvedTheme === 'dark';

  const pinsByPlace = useMemo(() => {
    const pins = new Map<number, number[]>();
    for (const stop of body.stops) {
      pins.set(stop.placeIndex, [...(pins.get(stop.placeIndex) ?? []), stop.pin]);
    }
    return pins;
  }, [body.stops]);

  const points = useMemo<MapPoint[]>(
    () =>
      body.places.flatMap((place, index) =>
        isResolved(place)
          ? [{ key: String(index), latitude: place.lat, longitude: place.lng }]
          : [],
      ),
    [body.places],
  );

  const mapReady = points.length > 0 && tileState.status === 'ready';
  const attribution = body.places.find(isResolved)?.attribution;
  const routeMessage = routeUnavailableMessage(body.route);
  const routeLegs =
    body.route.status === 'available'
      ? body.route.legs.filter((leg) => isAllowedItineraryRouteUrl(leg.url))
      : [];

  return (
    <section
      aria-label={body.title}
      data-testid="interactive-card-itinerary"
      className="my-3 overflow-hidden rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)]"
    >
      <div className="px-3 pb-2 pt-3">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[color:var(--chat-text-primary)]">
          <MapPinned
            className="size-4 shrink-0 text-[color:var(--chat-accent-primary-text)]"
            aria-hidden="true"
          />
          <span className="truncate">{body.title}</span>
        </p>
        <p className="mt-0.5 text-xs text-[color:var(--chat-text-muted)]">{body.region.label}</p>
        {body.summary ? (
          <p className="mt-2 text-sm text-[color:var(--chat-text-secondary)]">{body.summary}</p>
        ) : null}
      </div>

      {points.length === 0 ? null : tileState.status === 'loading' ? (
        <div
          className="grid place-items-center bg-[var(--chat-surface-hover)]"
          style={{ height: ITINERARY_MAP_HEIGHT_PX }}
        >
          <Spinner size="sm" className="text-[color:var(--chat-text-secondary)]" />
        </div>
      ) : tileState.status === 'unavailable' ? (
        <p
          data-testid="itinerary-map-unavailable"
          className="px-3 pb-1 text-sm text-[color:var(--chat-text-secondary)]"
        >
          {ITINERARY_MAP_UNAVAILABLE_MESSAGE}
        </p>
      ) : (
        <LeafletMapCanvas
          points={points}
          tile={tileState.config}
          label={`Map of ${body.title}`}
          dark={dark}
          focusKey={selectedPlace === null ? null : String(selectedPlace)}
          animate={!prefersReducedMotion}
          className="w-full"
          style={{ height: ITINERARY_MAP_HEIGHT_PX }}
          renderPoint={(point) => {
            const placeIndex = Number(point.key);
            const place = body.places[placeIndex];
            if (!isResolved(place)) return null;
            const pins = (pinsByPlace.get(placeIndex) ?? []).join(', ');
            return (
              <button
                type="button"
                onClick={() => setSelectedPlace(placeIndex)}
                aria-pressed={selectedPlace === placeIndex}
                aria-label={`Stop ${pins}: ${place.displayName}`}
                data-testid="itinerary-map-marker"
                className={cn(
                  'inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-xs font-semibold tabular-nums shadow-e1 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
                  'bg-[var(--chat-surface-elevated)] text-[color:var(--chat-text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
                  selectedPlace === placeIndex
                    ? 'border-[var(--chat-accent-primary)] ring-2 ring-[var(--chat-accent-primary)]'
                    : 'border-[var(--chat-border-strong)]',
                )}
              >
                {pins}
              </button>
            );
          }}
        />
      )}

      <ol data-testid="itinerary-stops" className="flex flex-col gap-3 px-3 py-3">
        {body.stops.map((stop) => {
          const place = body.places[stop.placeIndex];
          const selected = selectedPlace === stop.placeIndex;
          return (
            <li key={stop.id} data-testid="itinerary-stop" className="flex gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  pinBadgeClass,
                  selected
                    ? 'border-[var(--chat-accent-primary)] text-[color:var(--chat-text-primary)]'
                    : 'border-[var(--chat-border-strong)] text-[color:var(--chat-text-secondary)]',
                )}
              >
                {stop.pin}
              </span>
              <div className="min-w-0 flex-1">
                {stop.startTimeLabel ? (
                  <p className="text-xs tabular-nums text-[color:var(--chat-text-muted)]">
                    {stop.startTimeLabel}
                  </p>
                ) : null}
                {isResolved(place) && mapReady ? (
                  <button
                    type="button"
                    onClick={() => setSelectedPlace(stop.placeIndex)}
                    aria-pressed={selected}
                    className="rounded text-start text-sm font-medium text-[color:var(--chat-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
                  >
                    {place.displayName}
                  </button>
                ) : (
                  <p className="text-sm font-medium text-[color:var(--chat-text-primary)]">
                    {isResolved(place) ? place.displayName : place?.query}
                  </p>
                )}
                {isResolved(place) ? (
                  <p className="truncate text-xs text-[color:var(--chat-text-muted)]">
                    {place.formattedAddress}
                  </p>
                ) : (
                  <p className="flex items-center gap-1 text-xs text-[color:var(--chat-text-secondary)]">
                    <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                    {unresolvedLabel(place)}
                  </p>
                )}
                {stop.note ? (
                  <p className="mt-1 text-sm text-[color:var(--chat-text-secondary)]">
                    {stop.note}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {body.route.status === 'available' && routeLegs.length > 0 ? (
        <div className="px-3 pb-2" data-testid="itinerary-route">
          <p className="text-xs text-[color:var(--chat-text-muted)]">
            {TRAVEL_MODE_DIRECTIONS[body.route.travelMode]}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {routeLegs.map((leg) => (
              <a
                key={leg.url}
                href={leg.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--chat-border-strong)] px-3 text-xs font-medium text-[color:var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
              >
                <Navigation className="size-3.5 shrink-0" aria-hidden="true" />
                {leg.label}
                <span className="sr-only"> {NEW_TAB_HINT}</span>
              </a>
            ))}
          </div>
        </div>
      ) : routeMessage ? (
        <p className="px-3 pb-2 text-xs text-[color:var(--chat-text-secondary)]">{routeMessage}</p>
      ) : null}

      {attribution ? (
        <p className="px-3 pb-3 pt-1 text-xs text-[color:var(--chat-text-muted)]">
          {attribution.providerLabel}
          {mapReady && tileState.status === 'ready'
            ? ` · ${mapTileStyle(tileState.config, dark).attribution}`
            : ''}
          {attribution.providerUrl ? (
            <>
              {' · '}
              <a
                href={attribution.providerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Terms
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
