'use client';

import dynamic from 'next/dynamic';
import type { InteractiveCardRenderContext, MapSearchCardBody } from '@agiworkforce/types';
import { MapCardFallback } from './MapCardFallback';
import type { PlacesMapCardProps } from './PlacesMapCard';

/**
 * The map library and its stylesheet are the heaviest thing a transcript can
 * pull in, and most chats never show a map, so both map cards arrive on demand.
 * The library also touches `window` at import time, which is why neither
 * renders on the server.
 */
export const PlacesMapCardLazy = dynamic<PlacesMapCardProps>(
  () => import('./PlacesMapCard').then((module) => module.PlacesMapCard),
  { ssr: false, loading: MapCardFallback },
);

export const MapSearchCardLazy = dynamic<{
  body: MapSearchCardBody;
  ctx: InteractiveCardRenderContext;
}>(() => import('./MapSearchCard').then((module) => module.MapSearchCard), {
  ssr: false,
  loading: MapCardFallback,
});
