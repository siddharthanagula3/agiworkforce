import {
  MAP_CONFIG_PATH,
  parseMapTileConfig,
  type MapTileConfig,
} from '@agiworkforce/cloud-contracts';
import {
  MAP_SEARCH_MIN_ZOOM,
  type MapSearchCardBody,
  type MapSearchView,
} from '@agiworkforce/types';
import { renderIcon, Loader2 } from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';
import { loadImageDataUrl, type AnswerFileAccess } from './generatedFiles';

const TILE_SIZE = 256;
const FRAME_WIDTH = 420;
const FRAME_HEIGHT = 200;
const FIT_WIDTH = 260;
const FIT_HEIGHT = 140;
const FIT_MAX_ZOOM = 15;
const MAX_LATITUDE = 85.05112878;

let configRequest: Promise<MapTileConfig | null> | null = null;

function loadMapTileConfig(access: AnswerFileAccess): Promise<MapTileConfig | null> {
  const url = access.resolveUrl(MAP_CONFIG_PATH);
  if (!url) return Promise.resolve(null);
  configRequest ??= access
    .fetchFile(url)
    .then((blob) => blob.text())
    .then((text) => {
      const value: unknown = JSON.parse(text);
      return parseMapTileConfig(value);
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

export interface MapPreviewPoint {
  latitude: number;
  longitude: number;
  label: string;
  unconfirmed?: boolean;
}

export interface MapPreviewRequest {
  label: string;
  unavailableText: string;
  view: Pick<MapSearchView, 'latitude' | 'longitude' | 'zoom'>;
  points: readonly MapPreviewPoint[];
}

export function fittedMapView(
  points: readonly MapPreviewPoint[],
): MapPreviewRequest['view'] | null {
  if (points.length === 0) return null;
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const latitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const longitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
  for (let zoom = FIT_MAX_ZOOM; zoom > MAP_SEARCH_MIN_ZOOM; zoom -= 1) {
    const projected = points.map((point) => project(point.latitude, point.longitude, zoom));
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    if (
      Math.max(...xs) - Math.min(...xs) <= FIT_WIDTH &&
      Math.max(...ys) - Math.min(...ys) <= FIT_HEIGHT
    ) {
      return { latitude, longitude, zoom };
    }
  }
  return { latitude, longitude, zoom: MAP_SEARCH_MIN_ZOOM };
}

async function drawMap(
  request: MapPreviewRequest,
  access: AnswerFileAccess,
  dark: boolean,
): Promise<{ layers: HTMLElement[]; dimmed: boolean }> {
  const { view, points } = request;
  const config = await loadMapTileConfig(access);
  if (!config) throw new Error('map tiles are not configured');
  const zoom = Math.round(Math.min(config.maxZoom, Math.max(config.minZoom, view.zoom)));
  const centre = project(view.latitude, view.longitude, zoom);
  const lastIndex = 2 ** zoom - 1;
  const template = dark ? config.darkTileUrlTemplate : config.tileUrlTemplate;
  const canvas = el('div', {
    class: 'sp-map-preview__canvas',
    role: 'img',
    'aria-label': request.label,
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
  for (const point of points) {
    const position = project(point.latitude, point.longitude, zoom);
    canvas.appendChild(
      el(
        'span',
        {
          class: `sp-map-preview__marker${point.unconfirmed ? ' sp-map-preview__marker--unconfirmed' : ''}`,
          'aria-hidden': 'true',
          style: `left:${position.x - centre.x}px;top:${position.y - centre.y}px`,
        },
        point.label,
      ),
    );
  }
  const attribution = el(
    'span',
    { class: 'sp-map-preview__attribution' },
    dark ? config.darkAttribution : config.attribution,
  );
  return { layers: [canvas, attribution], dimmed: dark && config.dimLightTiles };
}

export function buildPointsMapPreview(
  request: MapPreviewRequest,
  access: AnswerFileAccess,
): HTMLElement {
  const dark = resolvedThemeIsDark();
  const frame = el('div', { class: 'sp-map-preview', 'aria-busy': 'true' });
  const status = el('span', { class: 'sp-map-preview__status', role: 'status' });
  status.appendChild(renderIcon(Loader2, 16, 'sp-map-preview__spinner'));
  status.appendChild(document.createTextNode(t('spMapPreviewLoading')));
  frame.appendChild(status);
  void drawMap(request, access, dark)
    .then(({ layers, dimmed }) => {
      frame.classList.toggle('sp-map-preview--dimmed', dimmed);
      frame.replaceChildren(...layers);
    })
    .catch(() => {
      status.replaceChildren(document.createTextNode(request.unavailableText));
    })
    .finally(() => frame.removeAttribute('aria-busy'));
  return frame;
}

export function buildMapPreview(
  body: MapSearchCardBody,
  access: AnswerFileAccess | undefined,
): HTMLElement | null {
  if (!body.view || !body.places?.length || !access) return null;
  return buildPointsMapPreview(
    {
      label: t('spMapPreviewLabel', [body.places[0]?.label ?? body.query]),
      unavailableText: t('spMapPreviewUnavailable'),
      view: body.view,
      points: body.places.map((place, index) => ({
        latitude: place.latitude,
        longitude: place.longitude,
        label: String(index + 1),
        unconfirmed: place.confident === false,
      })),
    },
    access,
  );
}
