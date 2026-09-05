'use client';

import { useTheme } from 'next-themes';
import { ExternalLink, MapPinned, Navigation } from '@agiworkforce/icons';
import type { InteractiveCardRenderContext, MapSearchCardBody } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { LeafletMapCanvas, type MapPoint } from './map/LeafletMapCanvas';
import { mapTileStyle, useMapTileConfig } from './map/mapTileConfig';

interface MapSearchCardProps {
  body: MapSearchCardBody;
  ctx: InteractiveCardRenderContext;
}

export const MAP_SEARCH_FRAME_HEIGHT_PX = 340;

export function MapSearchCard({ body, ctx }: MapSearchCardProps) {
  const tileState = useMapTileConfig();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const places = body.places ?? [];
  // A place that could not be tied to the rest of the request's geography may
  // still be shown, but routing to it is exactly the unsafe action.
  const hasUnconfirmedPlace = places.some((place) => place.confident === false);
  const primaryAction =
    body.actions.find((action) => action.provider === 'google_maps') ?? body.actions[0];

  const points: MapPoint[] = places.map((place, index) => ({
    key: `${index}:${place.latitude}:${place.longitude}`,
    latitude: place.latitude,
    longitude: place.longitude,
  }));

  const showMap = Boolean(body.view) && points.length > 0 && tileState.status === 'ready';

  return (
    <section
      aria-label={body.title}
      data-testid="interactive-card-map-search"
      className="my-3 overflow-hidden rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] shadow-sm"
    >
      {showMap && tileState.status === 'ready' ? (
        <div className="relative">
          <LeafletMapCanvas
            points={points}
            tile={tileState.config}
            dark={dark}
            label={`Map of ${places[0]?.label ?? body.query}`}
            focusKey={null}
            animate={false}
            className="w-full"
            style={{ height: MAP_SEARCH_FRAME_HEIGHT_PX }}
            renderPoint={(point) => {
              const index = points.findIndex((candidate) => candidate.key === point.key);
              const place = places[index];
              return (
                <span
                  title={place?.label}
                  className={cn(
                    'grid size-6 place-items-center rounded-full text-xs font-semibold shadow-md ring-2 ring-[var(--chat-surface-elevated)]',
                    place?.confident === false
                      ? 'bg-warning-fill text-warning-on-fill'
                      : 'bg-[var(--chat-accent-primary)] text-[color:var(--chat-accent-on-primary)]',
                  )}
                >
                  {index + 1}
                </span>
              );
            }}
          >
            {/* Title as a chip over the map rather than a header bar above it,
                so the result reads as a map rather than as a form with a
                picture in it. */}
            <div className="pointer-events-none absolute left-3 top-3 z-30 max-w-[60%]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chat-surface-elevated)] px-3 py-1.5 text-sm font-semibold text-[color:var(--chat-text-primary)] shadow-sm">
                <MapPinned
                  className="size-3.5 shrink-0 text-[color:var(--chat-accent-primary-text)]"
                  aria-hidden="true"
                />
                <span className="truncate">{body.title}</span>
              </span>
            </div>
          </LeafletMapCanvas>

          <ol className="mt-2 flex flex-col gap-2 px-3 sm:absolute sm:right-3 sm:top-14 sm:z-30 sm:mt-0 sm:w-64 sm:px-0">
            {primaryAction && !hasUnconfirmedPlace ? (
              <li className="order-last sm:order-first">
                <button
                  type="button"
                  onClick={() => ctx.onOpenUrl?.(primaryAction.url)}
                  disabled={!ctx.onOpenUrl}
                  className="inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] px-3 text-xs font-semibold text-[color:var(--chat-text-primary)] shadow-sm transition-colors hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Navigation
                    className="size-3.5 text-[color:var(--chat-accent-primary-text)]"
                    aria-hidden="true"
                  />
                  {places.length > 1 ? 'Open route' : 'Open in Maps'}
                </button>
              </li>
            ) : null}
            {places.map((place, index) => (
              <li
                key={`${place.latitude},${place.longitude}`}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] px-2.5 py-2 shadow-sm"
              >
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                    place.confident === false
                      ? 'bg-warning-fill text-warning-on-fill'
                      : 'bg-[var(--chat-accent-primary)] text-[color:var(--chat-accent-on-primary)]',
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[color:var(--chat-text-primary)]">
                    {place.label.split(',')[0]}
                  </span>
                  <span className="block truncate text-xs text-[color:var(--chat-text-secondary)]">
                    {place.kind ? `${place.kind} · ` : ''}
                    {place.label.split(',').slice(1, 3).join(',').trim() || body.query}
                  </span>
                  {place.confident === false && (
                    <span className="mt-0.5 block text-xs text-warning-text">
                      Far from the other places in this request, check this is the one you meant.
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          <span className="pointer-events-none absolute bottom-1 right-1 z-30 rounded bg-[var(--chat-surface-overlay)] px-1.5 py-0.5 text-xs text-[color:var(--chat-text-secondary)]">
            {mapTileStyle(tileState.config, dark).attribution}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--chat-accent-primary)] text-[color:var(--chat-accent-on-primary)] shadow-sm">
            <MapPinned className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-[color:var(--chat-text-primary)]">
              {body.title}
            </h3>
            <p className="mt-0.5 truncate text-sm text-[color:var(--chat-text-secondary)]">
              {body.query}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-2 p-3 pt-2 sm:grid-cols-2">
        {body.actions.map((action) => (
          <button
            key={action.provider}
            type="button"
            onClick={() => ctx.onOpenUrl?.(action.url)}
            disabled={!ctx.onOpenUrl}
            className="inline-flex min-h-10 items-center justify-between gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-3 py-2 text-left text-sm font-medium text-[color:var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{action.label}</span>
            <ExternalLink
              className="size-4 shrink-0 text-[color:var(--chat-text-secondary)]"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <p className="px-4 pb-3 text-xs text-[color:var(--chat-text-muted)]">
        {hasUnconfirmedPlace
          ? 'One of these places could not be matched to the area the others are in, so no route is offered. Open each place to check it first.'
          : 'Opens a provider search. Confirm the place before navigating.'}
      </p>
    </section>
  );
}
