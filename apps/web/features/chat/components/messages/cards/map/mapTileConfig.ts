'use client';

import { useEffect, useState } from 'react';
import {
  MAP_CONFIG_PATH,
  parseMapTileConfig,
  type MapTileConfig,
} from '@agiworkforce/cloud-contracts';

export type { MapTileConfig };

export interface MapTileStyleChoice {
  urlTemplate: string;
  attribution: string;
  dim: boolean;
}

export function mapTileStyle(config: MapTileConfig, dark: boolean): MapTileStyleChoice {
  return dark
    ? {
        urlTemplate: config.darkTileUrlTemplate,
        attribution: config.darkAttribution,
        dim: config.dimLightTiles,
      }
    : { urlTemplate: config.tileUrlTemplate, attribution: config.attribution, dim: false };
}

let pending: Promise<MapTileConfig | null> | null = null;

/**
 * One request per session, shared by every card on the page: the tile endpoint
 * is deployment configuration, not per-message data, so a transcript with six
 * map cards must not ask six times.
 */
export function loadMapTileConfig(): Promise<MapTileConfig | null> {
  pending ??= fetch(MAP_CONFIG_PATH, { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((value: unknown) => parseMapTileConfig(value))
    .catch(() => null);
  return pending;
}

export function resetMapTileConfigCache(): void {
  pending = null;
}

export type MapTileConfigState =
  { status: 'loading' } | { status: 'ready'; config: MapTileConfig } | { status: 'unavailable' };

export function useMapTileConfig(): MapTileConfigState {
  const [state, setState] = useState<MapTileConfigState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void loadMapTileConfig().then((config) => {
      if (!active) return;
      setState(config ? { status: 'ready', config } : { status: 'unavailable' });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
