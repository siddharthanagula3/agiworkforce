import type { MapSearchCardBody } from '@agiworkforce/types';
import { renderIcon, Loader2 } from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';
import { loadImageDataUrl, type AnswerFileAccess } from './generatedFiles';

const TILE_SIZE = 256;
const FRAME_WIDTH = 420;
const FRAME_HEIGHT = 200;
const MAX_LATITUDE = 85.05112878;
const MAP_CONFIG_PATH = '/api/maps/config';

interface MapTileConfig {
  tileUrlTemplate: string;
  attribution: string;
  darkTileUrlTemplate: string;
  darkAttribution: string;
  dimLightTiles: boolean;
  minZoom: number;
  maxZoom: number;
}

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

let configRequest: Promise<MapTileConfig | null> | null = null;

function loadMapTileConfig(access: AnswerFileAccess): Promise<MapTileConfig | null> {
  const url = access.resolveUrl(MAP_CONFIG_PATH);
  if (!url) return Promise.resolve(null);
  configRequest ??= access
    .fetchFile(url)
    .then((blob) => blob.text())
    .then((text) => {
      const value: unknown = JSON.parse(text);
      return isMapTileConfig(value) ? value : null;
    })
    .catch(() => {
      configRequest = null;
      return null;
    });
  return configRequest;
}

function project(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const radians = (clamped * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * worldSize,
    y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * worldSize,
  };
}

function tileUrl(template: string, zoom: number, x: number, y: number): string {
  return template.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
}

export function resolvedThemeIsDark(root: HTMLElement = document.documentElement): boolean {
  const explicit = root.getAttribute('data-theme');
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

async function drawMap(
  body: MapSearchCardBody,
  access: AnswerFileAccess,
  dark: boolean,
): Promise<{ layers: HTMLElement[]; dimmed: boolean }> {
  const view = body.view!;
  const places = body.places ?? [];
  const config = await loadMapTileConfig(access);
  if (!config) throw new Error('map tiles are not configured');
  const zoom = Math.round(Math.min(config.maxZoom, Math.max(config.minZoom, view.zoom)));
  const centre = project(view.latitude, view.longitude, zoom);
  const lastIndex = 2 ** zoom - 1;
  const template = dark ? config.darkTileUrlTemplate : config.tileUrlTemplate;
  const canvas = el('div', {
    class: 'sp-map-preview__canvas',
    role: 'img',
    'aria-label': t('spMapPreviewLabel', [body.places?.[0]?.label ?? body.query]),
  });
  const firstX = Math.max(0, Math.floor((centre.x - FRAME_WIDTH / 2) / TILE_SIZE));
  const lastX = Math.min(lastIndex, Math.floor((centre.x + FRAME_WIDTH / 2) / TILE_SIZE));
  const firstY = Math.max(0, Math.floor((centre.y - FRAME_HEIGHT / 2) / TILE_SIZE));
  const lastY = Math.min(lastIndex, Math.floor((centre.y + FRAME_HEIGHT / 2) / TILE_SIZE));
  const tiles: Array<Promise<void>> = [];
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      const url = access.resolveUrl(tileUrl(template, zoom, x, y));
      if (!url) continue;
      tiles.push(
        loadImageDataUrl(url, access).then((dataUrl) => {
          canvas.appendChild(
            el('img', {
              class: 'sp-map-preview__tile',
              src: dataUrl,
              alt: '',
              style: `left:${x * TILE_SIZE - centre.x}px;top:${y * TILE_SIZE - centre.y}px`,
            }),
          );
        }),
      );
    }
  }
  const results = await Promise.allSettled(tiles);
  if (!results.some((result) => result.status === 'fulfilled')) {
    throw new Error('no map tile could be loaded');
  }
  places.forEach((place, index) => {
    const point = project(place.latitude, place.longitude, zoom);
    canvas.appendChild(
      el(
        'span',
        {
          class: `sp-map-preview__marker${place.confident === false ? ' sp-map-preview__marker--unconfirmed' : ''}`,
          'aria-hidden': 'true',
          style: `left:${point.x - centre.x}px;top:${point.y - centre.y}px`,
        },
        String(index + 1),
      ),
    );
  });
  const attribution = el(
    'span',
    { class: 'sp-map-preview__attribution' },
    dark ? config.darkAttribution : config.attribution,
  );
  return { layers: [canvas, attribution], dimmed: dark && config.dimLightTiles };
}

export function buildMapPreview(
  body: MapSearchCardBody,
  access: AnswerFileAccess | undefined,
): HTMLElement | null {
  if (!body.view || !body.places?.length || !access) return null;
  const dark = resolvedThemeIsDark();
  const frame = el('div', { class: 'sp-map-preview', 'aria-busy': 'true' });
  const status = el('span', { class: 'sp-map-preview__status', role: 'status' });
  status.appendChild(renderIcon(Loader2, 16, 'sp-map-preview__spinner'));
  status.appendChild(document.createTextNode(t('spMapPreviewLoading')));
  frame.appendChild(status);
  void drawMap(body, access, dark)
    .then(({ layers, dimmed }) => {
      frame.classList.toggle('sp-map-preview--dimmed', dimmed);
      frame.replaceChildren(...layers);
    })
    .catch(() => {
      status.replaceChildren(document.createTextNode(t('spMapPreviewUnavailable')));
    })
    .finally(() => frame.removeAttribute('aria-busy'));
  return frame;
}
