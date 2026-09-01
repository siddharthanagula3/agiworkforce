'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, MapPinned, Minus, Navigation, Plus, RotateCcw } from '@agiworkforce/icons';
import {
  MAP_SEARCH_MAX_ZOOM,
  MAP_SEARCH_MIN_ZOOM,
  type InteractiveCardRenderContext,
  type MapSearchCardBody,
  type MapSearchPlace,
  type MapSearchView,
} from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';

interface MapSearchCardProps {
  body: MapSearchCardBody;
  ctx: InteractiveCardRenderContext;
}

const TILE_SIZE = 256;
const FRAME_HEIGHT = 340;
const ASSUMED_FRAME_WIDTH = 5 * TILE_SIZE;
const PANEL_WIDTH = 256;
const PANEL_GUTTER = 12;

function project(
  latitude: number,
  longitude: number,
  zoom: number,
): { pixelX: number; pixelY: number } {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (clampedLat * Math.PI) / 180;
  return {
    pixelX: ((longitude + 180) / 360) * worldSize,
    pixelY: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * worldSize,
  };
}

function MapTiles({
  view,
  places,
  children,
}: {
  view: MapSearchView;
  places: MapSearchPlace[];
  children?: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(ASSUMED_FRAME_WIDTH);
  const [zoom, setZoom] = useState(view.zoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    setZoom(view.zoom);
    setPan({ x: 0, y: 0 });
  }, [view.latitude, view.longitude, view.zoom]);

  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const measured = entry?.contentRect.width ?? 0;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const changeZoom = useCallback((delta: number) => {
    setZoom((current) => {
      const next = Math.max(MAP_SEARCH_MIN_ZOOM, Math.min(MAP_SEARCH_MAX_ZOOM, current + delta));
      if (next === current) return current;
      const scale = 2 ** (next - current);
      setPan((offset) => ({ x: offset.x * scale, y: offset.y * scale }));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setZoom(view.zoom);
    setPan({ x: 0, y: 0 });
  }, [view.zoom]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX - pan.x,
      startY: event.clientY - pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({ x: event.clientX - drag.startX, y: event.clientY - drag.startY });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 120 : 40;
    const moves: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setPan((offset) => ({ x: offset.x + move.x, y: offset.y + move.y }));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      changeZoom(1);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      changeZoom(-1);
    }
  };

  const panelOccludesRight = places.length > 0 && width >= 640;
  const centreShiftX = panelOccludesRight ? (PANEL_WIDTH + PANEL_GUTTER) / 2 : 0;

  const anchor = project(view.latitude, view.longitude, zoom);
  const centreX = anchor.pixelX - pan.x + centreShiftX;
  const centreY = anchor.pixelY - pan.y;
  const tileCount = 2 ** zoom;

  const firstX = Math.floor((centreX - width / 2) / TILE_SIZE) - 1;
  const lastX = Math.floor((centreX + width / 2) / TILE_SIZE) + 1;
  const firstY = Math.floor((centreY - FRAME_HEIGHT / 2) / TILE_SIZE) - 1;
  const lastY = Math.floor((centreY + FRAME_HEIGHT / 2) / TILE_SIZE) + 1;

  const tiles: Array<{ key: string; src: string; left: number; top: number }> = [];
  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) {
      if (x < 0 || y < 0 || x >= tileCount || y >= tileCount) continue;
      tiles.push({
        key: `${zoom}-${x}-${y}`,
        src: `/api/maps/tile/${zoom}/${x}/${y}`,
        left: x * TILE_SIZE - centreX,
        top: y * TILE_SIZE - centreY,
      });
    }
  }

  const moved = pan.x !== 0 || pan.y !== 0 || zoom !== view.zoom;

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden bg-[var(--chat-surface-hover)]"
      style={{ height: FRAME_HEIGHT }}
      data-testid="map-search-tiles"
    >
      <div
        role="application"
        aria-label={`Map of ${places[0]?.label ?? 'the search area'}. Drag or use the arrow keys to pan, plus and minus to zoom.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => changeZoom(1)}
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
      >
        {/* Origin pinned to the frame's centre; children carry signed offsets. */}
        <div className="absolute left-1/2 top-1/2 size-0">
          {tiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.src}
              alt=""
              width={TILE_SIZE}
              height={TILE_SIZE}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="absolute max-w-none select-none"
              style={{ left: tile.left, top: tile.top }}
            />
          ))}

          {places.map((place, index) => {
            const point = project(place.latitude, place.longitude, zoom);
            return (
              <span
                key={`${place.latitude},${place.longitude}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
                style={{ left: point.pixelX - centreX, top: point.pixelY - centreY }}
                title={place.label}
              >
                {/* Numbered so a pin can be matched to its row in the list
                    beside the map — two identical pins leave the reader
                    guessing which end of a route is which. */}
                <span className="relative grid size-6 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground shadow-md ring-2 ring-background">
                  {index + 1}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Zoom controls sit bottom-left on desktop, where the place panel is a
          right-side column (sm:right-3) and never reaches that corner. On
          mobile the panel is a FULL-WIDTH bottom strip (inset-x-0 bottom-0),
          which covers bottom-left too - controls parked there sit underneath
          its opaque chips and stop being clickable. Top-right is the one
          corner the mobile strip and the top-left title chip both leave
          free, so controls move there below sm only when a strip is actually
          rendered (places.length > 0). */}
      <div
        className={cn(
          'absolute flex flex-col gap-1',
          places.length > 0
            ? 'right-2 top-2 sm:right-auto sm:top-auto sm:bottom-2 sm:left-2'
            : 'bottom-2 left-2',
        )}
      >
        <button
          type="button"
          onClick={() => changeZoom(1)}
          disabled={zoom >= MAP_SEARCH_MAX_ZOOM}
          aria-label="Zoom in"
          className="grid size-7 place-items-center rounded-md border border-[var(--chat-border)] bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => changeZoom(-1)}
          disabled={zoom <= MAP_SEARCH_MIN_ZOOM}
          aria-label="Zoom out"
          className="grid size-7 place-items-center rounded-md border border-[var(--chat-border)] bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        {moved && (
          <button
            type="button"
            onClick={reset}
            aria-label="Reset map view"
            className="grid size-7 place-items-center rounded-md border border-[var(--chat-border)] bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-[var(--chat-surface-hover)]"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/75 px-1.5 py-0.5 text-[12px] text-muted-foreground backdrop-blur">
        {view.attribution}
      </span>

      {children}
    </div>
  );
}

export function MapSearchCard({ body, ctx }: MapSearchCardProps) {
  const view = body.view;
  const places = body.places ?? [];
  // A place that could not be tied to the rest of the request's geography may
  // still be shown, but routing to it is exactly the unsafe action.
  const hasUnconfirmedPlace = places.some((place) => place.confident === false);
  const primaryAction =
    body.actions.find((action) => action.provider === 'google_maps') ?? body.actions[0];

  return (
    <section
      aria-label={body.title}
      data-testid="interactive-card-map-search"
      className="my-3 overflow-hidden rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] shadow-sm"
    >
      {view ? (
        <MapTiles view={view} places={places}>
          {/* Title as a chip over the map rather than a header bar above it —
              the map gets the full card, which is what makes the result read
              as a map rather than as a form with a picture in it. */}
          <div className="pointer-events-none absolute left-3 top-3 max-w-[60%]">
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm backdrop-blur">
              <MapPinned className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{body.title}</span>
            </span>
          </div>

          {places.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 p-3 sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-14 sm:w-64 sm:p-0">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-col sm:overflow-visible sm:pb-0">
                {primaryAction && !hasUnconfirmedPlace && (
                  <button
                    type="button"
                    onClick={() => ctx.onOpenUrl?.(primaryAction.url)}
                    disabled={!ctx.onOpenUrl}
                    className="order-last inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-background/95 px-3 py-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 sm:order-first"
                  >
                    <Navigation className="size-3.5 text-primary" aria-hidden="true" />
                    {places.length > 1 ? 'Open route' : 'Open in Maps'}
                  </button>
                )}
                {places.map((place, index) => (
                  <div
                    key={`${place.latitude},${place.longitude}`}
                    className="flex min-w-[13rem] shrink-0 items-center gap-2.5 rounded-xl bg-background/95 px-2.5 py-2 shadow-sm backdrop-blur sm:min-w-0"
                  >
                    <span
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
                        place.confident === false
                          ? 'bg-warning-fill text-warning-on-fill'
                          : 'bg-primary text-primary-foreground',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {place.label.split(',')[0]}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {place.kind ? `${place.kind} · ` : ''}
                        {place.label.split(',').slice(1, 3).join(',').trim() || body.query}
                      </span>
                      {place.confident === false && (
                        <span className="mt-0.5 block text-xs text-warning-text">
                          Far from the other places in this request — check this is the one you
                          meant.
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </MapTiles>
      ) : (
        <div className="relative flex min-h-28 items-end overflow-hidden bg-[radial-gradient(circle_at_20%_30%,color-mix(in_srgb,hsl(var(--primary))_18%,transparent)_0_2px,transparent_3px),linear-gradient(120deg,color-mix(in_srgb,hsl(var(--muted))_82%,transparent),color-mix(in_srgb,hsl(var(--background))_92%,transparent))] p-4">
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(var(--chat-border)_1px,transparent_1px),linear-gradient(90deg,var(--chat-border)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <MapPinned className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-semibold text-foreground">{body.title}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{body.query}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-2 p-3 pt-0 sm:grid-cols-2">
        {body.actions.map((action) => (
          <button
            key={action.provider}
            type="button"
            onClick={() => ctx.onOpenUrl?.(action.url)}
            disabled={!ctx.onOpenUrl}
            className="inline-flex min-h-10 items-center justify-between gap-3 rounded-xl border border-[var(--chat-border)] bg-background px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{action.label}</span>
            <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="px-4 pb-3 text-xs text-muted-foreground">
        {hasUnconfirmedPlace
          ? 'One of these places could not be matched to the area the others are in, so no route is offered. Open each place to check it first.'
          : 'Opens a provider search. Confirm the place before navigating.'}
      </p>
    </section>
  );
}
