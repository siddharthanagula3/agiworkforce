'use client';

import { useEffect, useState } from 'react';

export interface MapTileConfig {
  tileUrlTemplate: string;
  attribution: string;
  darkTileUrlTemplate: string;
  darkAttribution: string;
  dimLightTiles: boolean;
  minZoom: number;
  maxZoom: number;
}

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

const MAP_CONFIG_ENDPOINT = '/api/maps/config';

let pending: Promise<MapTileConfig | null> | null = null;

function isMapTileConfig(value: unknown): value is MapTileConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MapTileConfig>;
  return (
    typeof candidate.tileUrlTemplate === 'string' &&
    typeof candidate.attribution === 'string' &&
    typeof candidate.darkTileUrlTemplate === 'string' &&
    typeof candidate.darkAttribution === 'string' &&
    typeof candidate.dimLightTiles === 'boolean' &&
    typeof candidate.minZoom === 'number' &&
    typeof candidate.maxZoom === 'number'
  );
}

/**
 * One request per session, shared by every card on the page: the tile endpoint
 * is deployment configuration, not per-message data, so a transcript with six
 * map cards must not ask six times.
 */
export function loadMapTileConfig(): Promise<MapTileConfig | null> {
  pending ??= fetch(MAP_CONFIG_ENDPOINT, { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((value: unknown) => (isMapTileConfig(value) ? value : null))
    .catch(() => null);
  return pending;
}

export function resetMapTileConfigCache(): void {
  pending = null;
}

export type MapTileConfigState =
  | { status: 'loading' }
  | { status: 'ready'; config: MapTileConfig }
  | { status: 'unavailable' };

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
