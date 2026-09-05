'use client';

import 'leaflet/dist/leaflet.css';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Minus, Plus } from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';
import { mapTileStyle, type MapTileConfig } from './mapTileConfig';

export interface MapPoint {
  key: string;
  latitude: number;
  longitude: number;
}

export interface MapProjection {
  x: number;
  y: number;
}

export interface MapCanvasSize {
  width: number;
  height: number;
}

export const MAP_SINGLE_POINT_ZOOM = 15;
export const MAP_FOCUS_ZOOM = 16;
export const MAP_FIT_PADDING_PX = 56;
const MAP_VIEW_EVENTS = 'move zoom zoomend moveend resize viewreset load';

/**
 * A deployment with no dark basemap of its own still has to draw a map into a
 * dark transcript, and the only thing left to change is what reaches the
 * screen. It self-disables the moment a dark tile endpoint is configured.
 */
const DIMMED_TILE_FILTER =
  'invert(1) hue-rotate(180deg) saturate(0.22) sepia(0.16) brightness(1.04) contrast(0.88)';

export interface MapFitPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_FIT_PADDING: MapFitPadding = { top: 0, right: 0, bottom: 0, left: 0 };

interface LeafletMapCanvasProps {
  points: readonly MapPoint[];
  tile: MapTileConfig;
  dark: boolean;
  label: string;
  focusKey: string | null;
  animate: boolean;
  /**
   * Space the initial fit must leave clear. The card list overlays the right
   * edge of the map on a wide viewport, so without this the markers it exists
   * to explain sit underneath it.
   */
  fitPadding?: (size: MapCanvasSize) => MapFitPadding;
  renderPoint: (point: MapPoint, projected: MapProjection) => React.ReactNode;
  onViewChange?: (
    projections: Readonly<Record<string, MapProjection>>,
    size: MapCanvasSize,
  ) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function LeafletMapCanvas({
  points,
  tile,
  dark,
  label,
  focusKey,
  animate,
  fitPadding,
  renderPoint,
  onViewChange,
  className,
  style,
  children,
}: LeafletMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [projections, setProjections] = useState<Record<string, MapProjection>>({});
  const [zoomBounds, setZoomBounds] = useState({ atMin: false, atMax: false });
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  const tileStyle = mapTileStyle(tile, dark);

  const pointsKey = points
    .map((point) => `${point.key}:${point.latitude}:${point.longitude}`)
    .join('|');

  const syncOverlay = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next: Record<string, MapProjection> = {};
    for (const point of points) {
      const projected = map.latLngToContainerPoint([point.latitude, point.longitude]);
      next[point.key] = { x: projected.x, y: projected.y };
    }
    setProjections(next);
    const measured = map.getSize();
    onViewChangeRef.current?.(next, { width: measured.x, height: measured.y });
    const zoom = map.getZoom();
    setZoomBounds({ atMin: zoom <= tile.minZoom, atMax: zoom >= tile.maxZoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey, tile.minZoom, tile.maxZoom]);

  // Layout effect, not effect: the overlay markers are positioned from a
  // measurement of the map, and a state update scheduled from a passive effect
  // paints one frame late, which reads as markers arriving after the tiles.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return undefined;

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: false,
      // A map inside a scrolling transcript must never swallow the page scroll.
      scrollWheelZoom: false,
      minZoom: tile.minZoom,
      maxZoom: tile.maxZoom,
    });
    mapRef.current = map;

    const measured = map.getSize();
    const padding = fitPadding?.({ width: measured.x, height: measured.y }) ?? NO_FIT_PADDING;

    if (points.length > 1) {
      map.fitBounds(
        L.latLngBounds(points.map((point) => L.latLng(point.latitude, point.longitude))),
        {
          paddingTopLeft: [MAP_FIT_PADDING_PX + padding.left, MAP_FIT_PADDING_PX + padding.top],
          paddingBottomRight: [
            MAP_FIT_PADDING_PX + padding.right,
            MAP_FIT_PADDING_PX + padding.bottom,
          ],
          animate: false,
        },
      );
    } else {
      const first = points[0];
      map.setView(
        first ? L.latLng(first.latitude, first.longitude) : L.latLng(0, 0),
        first ? MAP_SINGLE_POINT_ZOOM : tile.minZoom,
        { animate: false },
      );
    }

    map.on(MAP_VIEW_EVENTS, syncOverlay);
    syncOverlay();

    return () => {
      map.off(MAP_VIEW_EVENTS, syncOverlay);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.off(MAP_VIEW_EVENTS, syncOverlay);
    map.on(MAP_VIEW_EVENTS, syncOverlay);
    syncOverlay();
  }, [syncOverlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || focusKey === null) return;
    const target = points.find((point) => point.key === focusKey);
    if (!target) return;
    map.setView(
      L.latLng(target.latitude, target.longitude),
      Math.min(MAP_FOCUS_ZOOM, tile.maxZoom),
      {
        animate,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, animate, pointsKey, tile.maxZoom]);

  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const layer = L.tileLayer(tileStyle.urlTemplate, {
      minZoom: tile.minZoom,
      maxZoom: tile.maxZoom,
    });
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [tile.minZoom, tile.maxZoom, tileStyle.urlTemplate]);

  const changeZoom = useCallback(
    (delta: number) => {
      const map = mapRef.current;
      if (!map) return;
      map.setZoom(map.getZoom() + delta, { animate });
    },
    [animate],
  );

  return (
    <div className={cn('relative isolate overflow-hidden', className)} style={style}>
      <div
        ref={containerRef}
        role="application"
        aria-label={label}
        data-testid="places-map-canvas"
        data-tiles-dimmed={tileStyle.dim ? 'true' : undefined}
        className="absolute inset-0 z-0 bg-[var(--chat-surface-hover)]"
        style={tileStyle.dim ? { filter: DIMMED_TILE_FILTER } : undefined}
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        {points.map((point) => {
          const projected = projections[point.key];
          if (!projected) return null;
          return (
            <div
              key={point.key}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full"
              style={{ left: projected.x, top: projected.y }}
            >
              {renderPoint(point, projected)}
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => changeZoom(1)}
          disabled={zoomBounds.atMax}
          aria-label="Zoom in"
          className="grid size-8 place-items-center rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] text-[color:var(--chat-text-primary)] shadow-sm transition-colors hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => changeZoom(-1)}
          disabled={zoomBounds.atMin}
          aria-label="Zoom out"
          className="grid size-8 place-items-center rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] text-[color:var(--chat-text-primary)] shadow-sm transition-colors hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
      </div>

      {children}
    </div>
  );
}
