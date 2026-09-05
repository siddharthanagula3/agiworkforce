'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { MapPinned, Star } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import type { PlacesCardBody } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { assistantNoteForPlace } from './map/assistantNote';
import {
  LeafletMapCanvas,
  type MapCanvasSize,
  type MapPoint,
  type MapProjection,
} from './map/LeafletMapCanvas';
import { mapTileStyle, useMapTileConfig } from './map/mapTileConfig';
import { PlaceDetailPopup } from './map/PlaceDetailPopup';
import { PlaceListCard } from './map/PlaceListCard';
import { placeMarkerName, ratingLabel } from './map/placeFacts';

export const PLACES_MAP_EMPTY_MESSAGE = 'No places matched this search.';
export const PLACES_MAP_UNAVAILABLE_MESSAGE =
  'The map could not be loaded. The places from this search are listed below.';

export const PLACES_MAP_HEIGHT_PX = 360;
export const PLACES_LIST_WIDTH_PX = 256;
const PLACES_LIST_GUTTER_PX = 12;
const PLACES_DESKTOP_MIN_WIDTH_PX = 640;
const POPUP_WIDTH_PX = 288;
const POPUP_MARKER_GAP_PX = 14;
const POPUP_EDGE_INSET_PX = 8;

interface MapView {
  projections: Readonly<Record<string, MapProjection>>;
  size: MapCanvasSize;
}

const EMPTY_VIEW: MapView = { projections: {}, size: { width: 0, height: 0 } };

export interface PlacesMapCardProps {
  body: PlacesCardBody;
  assistantText?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function PlacesMapCard({ body, assistantText }: PlacesMapCardProps) {
  const tileState = useMapTileConfig();
  const prefersReducedMotion = useReducedMotion();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [view, setView] = useState<MapView>(EMPTY_VIEW);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const popupRef = useRef<HTMLDivElement>(null);
  const mapRegionRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [popupHeight, setPopupHeight] = useState(0);
  const [cardMetrics, setCardMetrics] = useState({ height: 0, mapOffsetTop: 0 });
  const { resolvedTheme } = useTheme();

  const places = body.places;
  const scope = body.near ? `${body.query} near ${body.near}` : body.query;

  const points = useMemo<MapPoint[]>(
    () =>
      places.map((place) => ({
        key: place.placeId,
        latitude: place.latitude,
        longitude: place.longitude,
      })),
    [places],
  );

  const selectedPlace = selectedIndex === null ? null : (places[selectedIndex] ?? null);

  const fitPadding = useCallback(
    (size: MapCanvasSize) => ({
      top: 0,
      right:
        size.width >= PLACES_DESKTOP_MIN_WIDTH_PX
          ? PLACES_LIST_WIDTH_PX + PLACES_LIST_GUTTER_PX
          : 0,
      bottom: 0,
      left: 0,
    }),
    [],
  );

  const onViewChange = useCallback(
    (projections: Readonly<Record<string, MapProjection>>, size: MapCanvasSize) => {
      setView({ projections, size });
    },
    [],
  );

  const closePopup = useCallback(() => {
    const index = selectedIndex;
    setSelectedIndex(null);
    if (index !== null) cardRefs.current[index]?.focus();
  }, [selectedIndex]);

  const stepPopup = useCallback(
    (delta: number) => {
      setSelectedIndex((current) =>
        current === null || places.length === 0
          ? current
          : (current + delta + places.length) % places.length,
      );
    },
    [places.length],
  );

  /**
   * The popup may cover the card's header and footer, not just the map, which
   * is the only way a full editorial note fits beside the sourced facts. That
   * needs the card's own height and where the map starts inside it.
   */
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const region = mapRegionRef.current;
    if (!section || !region) return undefined;
    const measure = () =>
      setCardMetrics({
        height: section.getBoundingClientRect().height,
        mapOffsetTop: region.offsetTop,
      });
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    return () => observer.disconnect();
  }, [tileState.status, places.length]);

  useLayoutEffect(() => {
    const panel = popupRef.current;
    if (!panel) {
      setPopupHeight(0);
      return undefined;
    }
    const measure = () => setPopupHeight(panel.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [selectedIndex]);

  const popupAnchor = selectedPlace ? view.projections[selectedPlace.placeId] : undefined;
  const popupBounds = cardMetrics.height || PLACES_MAP_HEIGHT_PX;
  const popupMaxHeight = popupBounds - POPUP_EDGE_INSET_PX * 2;

  /**
   * The card clips its own overflow, so a popup placed from the marker alone
   * loses its photo off the top or its pagination off the bottom. Its measured
   * height is what makes the anchored position stay inside the card.
   */
  const popupPosition = useMemo(() => {
    if (!popupAnchor) return { left: POPUP_EDGE_INSET_PX, top: POPUP_EDGE_INSET_PX };
    const width = view.size.width || POPUP_WIDTH_PX;
    const left = clamp(
      popupAnchor.x - POPUP_WIDTH_PX / 2,
      POPUP_EDGE_INSET_PX,
      Math.max(POPUP_EDGE_INSET_PX, width - POPUP_WIDTH_PX - POPUP_EDGE_INSET_PX),
    );
    const anchorY = popupAnchor.y + cardMetrics.mapOffsetTop;
    const above = anchorY - POPUP_MARKER_GAP_PX - popupHeight;
    const top = clamp(
      above >= POPUP_EDGE_INSET_PX ? above : anchorY + POPUP_MARKER_GAP_PX,
      POPUP_EDGE_INSET_PX,
      Math.max(POPUP_EDGE_INSET_PX, popupBounds - POPUP_EDGE_INSET_PX - popupHeight),
    );
    return { left, top };
  }, [popupAnchor, popupHeight, view.size.width, cardMetrics.mapOffsetTop, popupBounds]);

  return (
    <section
      ref={sectionRef}
      aria-label={`Places for ${scope}`}
      data-testid="interactive-card-places"
      className="relative my-3 overflow-hidden rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 pb-2 pt-3">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[color:var(--chat-text-primary)]">
          <MapPinned
            className="size-4 shrink-0 text-[color:var(--chat-accent-primary-text)]"
            aria-hidden="true"
          />
          <span className="truncate">{scope}</span>
        </p>
        {body.localTime ? (
          <p className="text-xs text-[color:var(--chat-text-muted)]">
            {body.openNowRequested ? 'Open at' : 'Checked'} {body.localTime}
          </p>
        ) : null}
      </div>

      <div ref={mapRegionRef} className="relative">
        {places.length === 0 ? (
          <p
            data-testid="places-card-empty"
            className="px-3 pb-1 text-sm text-[color:var(--chat-text-secondary)]"
          >
            {PLACES_MAP_EMPTY_MESSAGE}
          </p>
        ) : tileState.status === 'loading' ? (
          <div
            className="grid place-items-center bg-[var(--chat-surface-hover)]"
            style={{ height: PLACES_MAP_HEIGHT_PX }}
          >
            <Spinner size="sm" className="text-[color:var(--chat-text-secondary)]" />
          </div>
        ) : tileState.status === 'unavailable' ? (
          <p
            data-testid="places-map-unavailable"
            className="px-3 pb-1 text-sm text-[color:var(--chat-text-secondary)]"
          >
            {PLACES_MAP_UNAVAILABLE_MESSAGE}
          </p>
        ) : (
          <LeafletMapCanvas
            points={points}
            tile={tileState.config}
            label={`Map of places for ${scope}`}
            dark={resolvedTheme === 'dark'}
            focusKey={selectedPlace?.placeId ?? null}
            animate={!prefersReducedMotion}
            fitPadding={fitPadding}
            onViewChange={onViewChange}
            className="w-full"
            style={{ height: PLACES_MAP_HEIGHT_PX }}
            renderPoint={(point) => {
              const index = places.findIndex((place) => place.placeId === point.key);
              const place = places[index];
              if (!place) return null;
              const rating = ratingLabel(place.rating);
              return (
                <button
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  aria-label={placeMarkerName(place)}
                  aria-pressed={selectedIndex === index}
                  data-testid="places-map-marker"
                  className={cn(
                    'inline-flex min-h-6 items-center gap-1 rounded-full border px-2 text-xs font-semibold shadow-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
                    selectedIndex === index
                      ? 'border-[var(--chat-accent-primary)] bg-[var(--chat-surface-elevated)] text-[color:var(--chat-text-primary)] ring-2 ring-[var(--chat-accent-primary)]'
                      : 'border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] text-[color:var(--chat-text-primary)]',
                  )}
                >
                  <Star className="size-3 shrink-0" fill="currentColor" aria-hidden="true" />
                  {rating ?? place.name.slice(0, 1)}
                </button>
              );
            }}
          />
        )}

        {selectedPlace && selectedIndex !== null ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-40"
            style={{ height: popupBounds, top: -cardMetrics.mapOffsetTop }}
          >
            <div
              ref={popupRef}
              className="pointer-events-auto absolute"
              style={{ ...popupPosition, width: POPUP_WIDTH_PX }}
            >
              <PlaceDetailPopup
                place={selectedPlace}
                index={selectedIndex}
                total={places.length}
                note={assistantNoteForPlace(assistantText, selectedPlace.name)}
                attribution={body.attribution}
                termsUrl={body.termsUrl}
                onClose={closePopup}
                onStep={stepPopup}
                style={{ maxHeight: popupMaxHeight }}
              />
            </div>
          </div>
        ) : null}

        {places.length > 0 ? (
          <ol
            data-testid="places-card-list"
            className="mb-1 mt-2 flex flex-col gap-2 px-3 sm:absolute sm:right-3 sm:top-3 sm:z-30 sm:mb-0 sm:mt-0 sm:max-h-[calc(100%-1.5rem)] sm:w-64 sm:overflow-y-auto sm:px-0"
          >
            {places.map((place, index) => (
              <li key={place.placeId}>
                <PlaceListCard
                  place={place}
                  selected={selectedIndex === index}
                  onSelect={() => setSelectedIndex(index)}
                  buttonRef={(element) => {
                    cardRefs.current[index] = element;
                  }}
                />
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <p className="px-3 pb-3 pt-3 text-xs text-[color:var(--chat-text-muted)] sm:pt-2">
        {body.attribution}
        {tileState.status === 'ready'
          ? ` · ${mapTileStyle(tileState.config, resolvedTheme === 'dark').attribution}`
          : ''}
        {body.termsUrl ? (
          <>
            {' · '}
            <a
              href={body.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Terms
            </a>
          </>
        ) : null}
      </p>
    </section>
  );
}
